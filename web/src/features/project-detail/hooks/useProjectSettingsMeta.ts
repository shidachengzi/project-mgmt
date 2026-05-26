import { Form, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { patchProject } from '../../../shared/api/projectsApi'
import { formatDateText, parseDateValue, type ProjectOverviewInfo } from '../overview'
import { collectFleetDateViolationsForProjectWindow } from '../projectDateValidation'
import { DEFAULT_PROJECT_SETTINGS_META, type ProjectSettingsFormValues, type ProjectSettingsMeta } from '../settings/projectSettingsTypes'
import { flattenTaskManageRows, type TaskManageRecord } from '../tasks'
import type { TargetRecord } from '../targets/targetTypes'

export type { ProjectSettingsMeta } from '../settings/projectSettingsTypes'

export type ProjectServerAudit = {
  ownerName: string | null
  createdAt: string
  updatedAt: string
}

export type UseProjectSettingsMetaParams = {
  project: ProjectSummary
  projectOverview: ProjectOverviewInfo
  setProjectOverview: Dispatch<SetStateAction<ProjectOverviewInfo>>
  isOverviewHydrated: boolean
  projectServerAudit: ProjectServerAudit | null
  setProjectServerAudit: Dispatch<SetStateAction<ProjectServerAudit | null>>
  members: Array<{ key: string; name: string }>
  targetList: TargetRecord[]
  taskManageList: TaskManageRecord[]
  isPersonalDeskProject: boolean
  ensureProjectEditable: () => boolean
  hasMappedProjectPermission: (section: string, key: string) => boolean
  canCreatePublicProject: boolean
  scheduleWorkspaceFlush: () => void
  onUpdateProject?: (project: ProjectSummary) => void
  /** 基本设置 Form 已挂载时再同步字段，避免 useForm 未连接警告 */
  syncSettingsForm?: boolean
}

export function useProjectSettingsMeta({
  project,
  projectOverview,
  setProjectOverview,
  isOverviewHydrated,
  projectServerAudit,
  setProjectServerAudit,
  members,
  targetList,
  taskManageList,
  isPersonalDeskProject,
  ensureProjectEditable,
  hasMappedProjectPermission,
  canCreatePublicProject,
  scheduleWorkspaceFlush,
  onUpdateProject,
  syncSettingsForm = false
}: UseProjectSettingsMetaParams) {
  const [projectSettingsMeta, setProjectSettingsMeta] = useState<ProjectSettingsMeta>(DEFAULT_PROJECT_SETTINGS_META)
  const [isProjectSettingsHydrated, setIsProjectSettingsHydrated] = useState(false)
  const [isSettingsCoverHover, setIsSettingsCoverHover] = useState(false)
  const [settingsForm] = Form.useForm<ProjectSettingsFormValues>()
  const settingsCoverUploadRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOverviewHydrated) return
    const visLabel = project.backendVisibility === 'public' ? '公开（企业所有成员）' : '私有（仅加入的项目成员）'
    const sd = parseDateValue(projectOverview.startDate)?.format('YYYY-MM-DD') ?? DEFAULT_PROJECT_SETTINGS_META.startDate
    const ed = parseDateValue(projectOverview.endDate)?.format('YYYY-MM-DD') ?? DEFAULT_PROJECT_SETTINGS_META.endDate
    setProjectSettingsMeta(prev => ({
      ...prev,
      owner: projectServerAudit?.ownerName ?? projectOverview.owner,
      startDate: sd,
      endDate: ed,
      description: projectOverview.description,
      progressStatus: projectOverview.progressStatus,
      healthStatus: projectOverview.healthStatus,
      statusDescription: projectOverview.statusDescription,
      visibility: visLabel
    }))
    setIsProjectSettingsHydrated(true)
  }, [isOverviewHydrated, projectOverview, project.backendVisibility, projectServerAudit?.ownerName])

  useEffect(() => {
    if (!isProjectSettingsHydrated || !syncSettingsForm) return
    settingsForm.setFieldsValue({
      title: project.title,
      owner: projectSettingsMeta.owner,
      startDate: dayjs(projectSettingsMeta.startDate),
      endDate: dayjs(projectSettingsMeta.endDate),
      visibility: projectSettingsMeta.visibility,
      description: projectSettingsMeta.description,
      progressStatus: projectSettingsMeta.progressStatus,
      healthStatus: projectSettingsMeta.healthStatus,
      statusDescription: projectSettingsMeta.statusDescription
    })
  }, [project.title, projectSettingsMeta, isProjectSettingsHydrated, settingsForm, syncSettingsForm])

  /** 校验目标/任务日期时以概览展示为准 */
  const projectWindowIso = useMemo(() => {
    const start = parseDateValue(projectOverview.startDate)?.format('YYYY-MM-DD') ?? projectSettingsMeta.startDate
    const end = parseDateValue(projectOverview.endDate)?.format('YYYY-MM-DD') ?? projectSettingsMeta.endDate
    return { start, end }
  }, [projectOverview.startDate, projectOverview.endDate, projectSettingsMeta.startDate, projectSettingsMeta.endDate])

  const saveProjectSettings = async () => {
    if (!ensureProjectEditable()) return
    try {
      const values = await settingsForm.validateFields()
      const nextStartDate = values.startDate ? values.startDate.format('YYYY-MM-DD') : DEFAULT_PROJECT_SETTINGS_META.startDate
      const nextEndDate = values.endDate ? values.endDate.format('YYYY-MM-DD') : DEFAULT_PROJECT_SETTINGS_META.endDate
      const touchesProjectStatus =
        nextStartDate !== projectSettingsMeta.startDate ||
        nextEndDate !== projectSettingsMeta.endDate ||
        values.progressStatus !== projectSettingsMeta.progressStatus ||
        values.healthStatus !== projectSettingsMeta.healthStatus
      if (touchesProjectStatus && !hasMappedProjectPermission('项目权限', '修改项目状态')) {
        message.warning('当前角色暂无「修改项目状态」权限')
        return
      }
      const touchesBasicSettings =
        (values.title.trim() || project.title) !== project.title ||
        values.visibility !== projectSettingsMeta.visibility ||
        (values.description?.trim() || '无') !== projectSettingsMeta.description ||
        (values.statusDescription?.trim() || '无') !== projectSettingsMeta.statusDescription ||
        (values.owner?.trim() || '') !== (projectSettingsMeta.owner?.trim() || '')
      if (touchesBasicSettings && !hasMappedProjectPermission('项目权限', '基本设置')) {
        message.warning('当前角色暂无「基本设置」权限')
        return
      }
      const nextMeta: ProjectSettingsMeta = {
        owner: values.owner,
        startDate: nextStartDate,
        endDate: nextEndDate,
        visibility: values.visibility,
        description: values.description?.trim() || '无',
        progressStatus: values.progressStatus,
        healthStatus: values.healthStatus,
        statusDescription: values.statusDescription?.trim() || '无'
      }

      const projectDatesChanged = nextStartDate !== projectSettingsMeta.startDate || nextEndDate !== projectSettingsMeta.endDate
      if (projectDatesChanged && !isPersonalDeskProject) {
        const fleetMsgs = collectFleetDateViolationsForProjectWindow(nextStartDate, nextEndDate, targetList, flattenTaskManageRows(taskManageList))
        if (fleetMsgs.length) {
          const preview = fleetMsgs.slice(0, 3).join('；')
          message.warning(fleetMsgs.length > 3 ? `${preview}…共 ${fleetMsgs.length} 处问题` : preview)
          return
        }
      }

      {
        const nextIsPublic = values.visibility === '公开（企业所有成员）'
        const ownerNameTrim = values.owner?.trim() || ''
        const ownerUserId = ownerNameTrim ? members.find(m => m.name === ownerNameTrim)?.key : null
        if (ownerNameTrim && !ownerUserId) {
          message.warning('当前项目成员中未找到所选负责人')
          return
        }

        const serverFieldChanged =
          (values.title.trim() || project.title) !== project.title ||
          values.visibility !== projectSettingsMeta.visibility ||
          ownerNameTrim !== (projectSettingsMeta.owner?.trim() || '')

        if (serverFieldChanged) {
          if (!hasMappedProjectPermission('项目权限', '基本设置')) {
            message.warning('当前角色暂无「基本设置」权限')
            return
          }
          if (nextIsPublic && project.backendVisibility !== 'public' && !canCreatePublicProject) {
            message.warning('暂无将项目改为公开的权限')
            return
          }
          const patchRes = await patchProject(project.id, {
            title: values.title.trim() || project.title,
            visibility: nextIsPublic ? 'public' : 'private',
            ownerUserId: ownerNameTrim ? ownerUserId! : null
          })
          if (!patchRes.ok) {
            message.error(patchRes.message)
            return
          }
          const d = patchRes.data
          const visLabel = d.visibility === 'public' ? '公开（企业所有成员）' : '私有（仅加入的项目成员）'
          const mergedMeta: ProjectSettingsMeta = {
            ...nextMeta,
            owner: d.ownerName ?? nextMeta.owner,
            visibility: visLabel
          }
          setProjectSettingsMeta(mergedMeta)
          setProjectOverview(prev => ({
            ...prev,
            title: d.title,
            owner: mergedMeta.owner,
            startDate: formatDateText(nextStartDate),
            endDate: formatDateText(nextEndDate),
            description: mergedMeta.description,
            progressStatus: mergedMeta.progressStatus,
            healthStatus: mergedMeta.healthStatus,
            statusDescription: mergedMeta.statusDescription
          }))
          setProjectServerAudit(prev =>
            prev ? { ...prev, ownerName: d.ownerName, updatedAt: d.updatedAt } : { ownerName: d.ownerName, createdAt: d.createdAt, updatedAt: d.updatedAt }
          )
          onUpdateProject?.({
            ...project,
            title: d.title,
            backendVisibility: d.visibility === 'public' ? 'public' : 'private',
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            cover: d.coverKind === 'image' ? 'image' : 'gradient',
            image: d.coverImageData ?? undefined
          })
        } else {
          setProjectSettingsMeta(nextMeta)
          setProjectOverview(prev => ({
            ...prev,
            title: values.title.trim() || project.title,
            owner: nextMeta.owner,
            startDate: formatDateText(nextStartDate),
            endDate: formatDateText(nextEndDate),
            description: nextMeta.description,
            progressStatus: nextMeta.progressStatus,
            healthStatus: nextMeta.healthStatus,
            statusDescription: nextMeta.statusDescription
          }))
        }
        void useBackendDataStore.getState().refreshProject(project.id)
        scheduleWorkspaceFlush()
        message.success('更多设置已保存')
      }
    } catch {
      // ignore validation failures
    }
  }

  const uploadSettingsCover = (event: ChangeEvent<HTMLInputElement>) => {
    if (!ensureProjectEditable()) return
    if (!hasMappedProjectPermission('项目权限', '基本设置')) {
      message.warning('当前角色暂无「基本设置」权限')
      event.target.value = ''
      return
    }
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl) {
        message.error('封面读取失败，请重试')
        return
      }
      void (async () => {
        const res = await patchProject(project.id, { coverKind: 'image', coverImageData: dataUrl })
        if (!res.ok) {
          message.error(res.message)
          return
        }
        const d = res.data
        onUpdateProject?.({
          ...project,
          cover: 'image',
          image: d.coverImageData ?? dataUrl
        })
        message.success('封面已更新')
      })()
    }
    reader.onerror = () => message.error('封面读取失败，请重试')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return {
    projectSettingsMeta,
    isProjectSettingsHydrated,
    settingsForm,
    settingsCoverUploadRef,
    isSettingsCoverHover,
    setIsSettingsCoverHover,
    projectWindowIso,
    saveProjectSettings,
    uploadSettingsCover
  }
}

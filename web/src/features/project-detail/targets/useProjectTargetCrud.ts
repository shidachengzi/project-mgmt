import { message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import dayjs from 'dayjs'
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import type { TargetRelatedTaskLink, WorkspaceActivityRecord, WorkspaceAttachmentItem } from '../hooks/useProjectDetailWorkspace'
import type { ProjectOverviewInfo } from '../overview'
import {
  clampDayToInclusiveRange,
  getNormalizedProjectBounds,
  validateEntityDatesAgainstProject,
  type EntityDateValidationMode
} from '../projectDateValidation'
import { deleteProjectTask, patchProjectTask, postProjectTask } from '../../../shared/api/projectTasksApi'
import { encodeTargetPayload, formatActivityLogDate, targetRecordToApiPatch, uiTaskDateToIso } from '../tasks/projectTaskAdapter'
import { buildTargetMetaString } from './targetMeta'
import type { TargetRecord, TargetSideTab } from './targetTypes'

export type TargetCrudMemberRef = { key: string; name: string }

export type TargetEditingField =
  | 'title'
  | 'status'
  | 'owner'
  | 'startDate'
  | 'endDate'
  | 'priority'
  | 'metricUnit'
  | 'metricStart'
  | 'metricTarget'
  | 'metricCurrent'
  | 'acceptanceCriteria'
  | 'deliveryNote'
  | 'acceptanceFeedback'
  | 'description'
  | null

const formatParticipantsForActivity = (list?: string[]) => (list?.length ? list.join('、') : '无')

export type UseProjectTargetCrudParams = {
  project: ProjectSummary
  targetTypeLabel: string
  isPersonalDeskProject: boolean
  members: TargetCrudMemberRef[]
  projectWindowIso: { start: string; end: string }
  entityDateValidationMode: EntityDateValidationMode
  projectOverview: ProjectOverviewInfo
  overviewActivityActorName: string
  ensureProjectEditable: () => boolean
  ensureMappedProjectPermission: (section: string, key: string) => boolean
  ensureProjectMemberCommentAllowed: () => boolean
  hasMappedProjectPermission: (section: string, key: string) => boolean
  editingTarget: TargetRecord | null
  setEditingTarget: Dispatch<SetStateAction<TargetRecord | null>>
  setEditingTargetField: Dispatch<SetStateAction<TargetEditingField>>
  targetDescriptionDraft: string
  setTargetList: Dispatch<SetStateAction<TargetRecord[]>>
  setTargetSideTab: Dispatch<SetStateAction<TargetSideTab>>
  setTargetCommentInput: Dispatch<SetStateAction<string>>
  targetCommentInput: string
  setTargetRelatedTasksByKey: Dispatch<SetStateAction<Record<string, TargetRelatedTaskLink[]>>>
  setTargetAttachmentsByKey: Dispatch<SetStateAction<Record<string, WorkspaceAttachmentItem[]>>>
  prependActivityRecords: (entityKey: string, records: WorkspaceActivityRecord[]) => void
  addComment: (entityKey: string, content: string) => void
  reloadTasksFromBackend: () => Promise<unknown>
  createTargetForm: FormInstance
  createTargetContinue: boolean
  setCreateTargetModalOpen: Dispatch<SetStateAction<boolean>>
  setCreateTargetContinue: Dispatch<SetStateAction<boolean>>
  detailFromExternal?: { kind: 'target' | 'task'; key: string } | null
  onExternalDetailClose?: () => void
  onLocalMutation?: () => void
}

export function useProjectTargetCrud({
  project,
  targetTypeLabel,
  isPersonalDeskProject,
  members,
  projectWindowIso,
  entityDateValidationMode,
  projectOverview,
  overviewActivityActorName,
  ensureProjectEditable,
  ensureMappedProjectPermission,
  ensureProjectMemberCommentAllowed,
  hasMappedProjectPermission,
  editingTarget,
  setEditingTarget,
  setEditingTargetField,
  targetDescriptionDraft,
  setTargetList,
  setTargetSideTab,
  setTargetCommentInput,
  targetCommentInput,
  setTargetRelatedTasksByKey,
  setTargetAttachmentsByKey,
  prependActivityRecords,
  addComment,
  reloadTasksFromBackend,
  createTargetForm,
  createTargetContinue,
  setCreateTargetModalOpen,
  setCreateTargetContinue,
  detailFromExternal,
  onExternalDetailClose,
  onLocalMutation
}: UseProjectTargetCrudParams) {
  const updateEditingTarget = useCallback(
    (patch: Partial<TargetRecord>) => {
      if (!ensureProjectEditable()) return
      if (!editingTarget) return
      const patchKeys = Object.keys(patch) as Array<keyof TargetRecord>
      const statusManagedFields: Array<keyof TargetRecord> = ['status', 'owner', 'startDate', 'endDate']
      const editsStatusFields = patchKeys.some(k => statusManagedFields.includes(k))
      const editsGeneralFields = patchKeys.some(k => !statusManagedFields.includes(k))
      if (editsStatusFields && !hasMappedProjectPermission('目标管理', '修改目标状态')) {
        message.warning('当前角色暂无「修改目标状态」权限')
        return
      }
      if (editsGeneralFields && !hasMappedProjectPermission('目标管理', '编辑目标')) {
        message.warning('当前角色暂无「编辑目标」权限')
        return
      }
      const fieldLabels: Partial<Record<keyof TargetRecord, string>> = {
        title: '标题',
        status: '状态',
        owner: '负责人',
        startDate: '开始时间',
        endDate: '截止时间',
        priority: '优先级',
        metricUnit: '量化指标-单位',
        metricStart: '量化指标-起始值',
        metricTarget: '量化指标-目标值',
        metricCurrent: '量化指标-当前值',
        description: '描述',
        acceptanceCriteria: '验收标准',
        deliveryNote: '交付说明',
        acceptanceFeedback: '验收反馈',
        participants: '参与人'
      }
      const now = new Date().toISOString()
      const merged: TargetRecord = {
        ...editingTarget,
        ...patch,
        risky: undefined,
        updatedAt: now,
        createdAt: editingTarget.createdAt ?? now
      }
      const nextTarget: TargetRecord = {
        ...merged,
        meta: buildTargetMetaString(merged)
      }
      if (patch.startDate !== undefined || patch.endDate !== undefined) {
        const v = validateEntityDatesAgainstProject({
          projectStartIso: projectWindowIso.start,
          projectEndIso: projectWindowIso.end,
          entityStartIso: nextTarget.startDate,
          entityEndIso: nextTarget.endDate,
          mode: entityDateValidationMode
        })
        if (!v.ok) {
          message.warning(v.message)
          return
        }
      }
      const activities: WorkspaceActivityRecord[] = Object.keys(patch)
        .map(k => k as keyof TargetRecord)
        .filter(k => fieldLabels[k])
        .flatMap(k => {
          if (k === 'participants') {
            const beforeStr = formatParticipantsForActivity(editingTarget.participants)
            const afterStr = formatParticipantsForActivity(nextTarget.participants)
            if (beforeStr === afterStr) return []
            return [
              {
                id: `${editingTarget.key}-${String(k)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                actor: overviewActivityActorName,
                targetTitle: nextTarget.title,
                fieldLabel: '参与人',
                before: beforeStr,
                after: afterStr,
                createdAt: now
              }
            ]
          }
          const before = editingTarget[k]
          const after = nextTarget[k]
          if ((before ?? '') === (after ?? '')) return []
          const label = fieldLabels[k] as string
          const isDateField = k === 'startDate' || k === 'endDate'
          return [
            {
              id: `${editingTarget.key}-${String(k)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              actor: overviewActivityActorName,
              targetTitle: nextTarget.title,
              fieldLabel: label,
              before: isDateField ? formatActivityLogDate(String(before ?? '')) : String(before ?? '无'),
              after: isDateField ? formatActivityLogDate(String(after ?? '')) : String(after ?? '无'),
              createdAt: now
            }
          ]
        })

      setEditingTarget(nextTarget)
      setTargetList(prev => prev.map(item => (item.key === nextTarget.key ? nextTarget : item)))
      prependActivityRecords(editingTarget.key, activities)

      void (async () => {
        onLocalMutation?.()
        const res = await patchProjectTask(project.id, nextTarget.key, targetRecordToApiPatch(nextTarget, members))
        if (!res.ok) {
          message.error(res.message)
          await reloadTasksFromBackend()
        }
      })()
    },
    [
      editingTarget,
      ensureProjectEditable,
      hasMappedProjectPermission,
      overviewActivityActorName,
      projectWindowIso,
      entityDateValidationMode,
      setEditingTarget,
      setTargetList,
      prependActivityRecords,
      project.id,
      members,
      reloadTasksFromBackend
    ]
  )

  const commitTargetDescription = useCallback(() => {
    if (!editingTarget) return
    const before = editingTarget.description ?? ''
    const next = targetDescriptionDraft

    if (next !== before) {
      updateEditingTarget({ description: next })
    }
    setEditingTargetField(null)
  }, [editingTarget, targetDescriptionDraft, updateEditingTarget, setEditingTargetField])

  const deleteTargetByKey = useCallback(
    (targetKey: string) => {
      if (!ensureMappedProjectPermission('目标管理', '删除目标')) return

      const closeIfOpen = () => {
        if (editingTarget?.key === targetKey) {
          setEditingTarget(null)
          setEditingTargetField(null)
          setTargetSideTab('评论')
          setTargetCommentInput('')
          if (detailFromExternal) onExternalDetailClose?.()
        }
      }

      const cleanupMaps = () => {
        setTargetRelatedTasksByKey(prev => {
          if (!prev[targetKey]) return prev
          const next = { ...prev }
          delete next[targetKey]
          return next
        })
        setTargetAttachmentsByKey(prev => {
          if (!prev[targetKey]) return prev
          const next = { ...prev }
          delete next[targetKey]
          return next
        })
      }

      void (async () => {
        onLocalMutation?.()
        const res = await deleteProjectTask(project.id, targetKey)
        if (!res.ok) {
          message.error(res.message)
          return
        }
        closeIfOpen()
        cleanupMaps()
        await reloadTasksFromBackend()
      })()
    },
    [
      ensureMappedProjectPermission,
      editingTarget?.key,
      setEditingTarget,
      setEditingTargetField,
      setTargetSideTab,
      setTargetCommentInput,
      detailFromExternal,
      onExternalDetailClose,
      setTargetRelatedTasksByKey,
      setTargetAttachmentsByKey,
      project.id,
      reloadTasksFromBackend
    ]
  )

  const addTargetComment = useCallback(
    (targetKey: string) => {
      if (!ensureProjectMemberCommentAllowed()) return
      const content = targetCommentInput.trim()
      if (!content) return
      addComment(targetKey, content)
      setTargetCommentInput('')
    },
    [ensureProjectMemberCommentAllowed, targetCommentInput, addComment, setTargetCommentInput]
  )

  const handleCancelCreateTarget = useCallback(() => {
    setCreateTargetModalOpen(false)
    setCreateTargetContinue(false)
    createTargetForm.resetFields()
  }, [createTargetForm, setCreateTargetModalOpen, setCreateTargetContinue])

  const handleCreateTargetSubmit = useCallback(async () => {
    if (!ensureMappedProjectPermission('目标管理', '新建目标')) return
    try {
      const values = await createTargetForm.validateFields()
      const title = String(values.title ?? '').trim()
      const type = String(values.type ?? targetTypeLabel)
      const priority = values.priority as TargetRecord['priority']
      const description = String(values.description ?? '').trim()
      if (!title) return

      const now = dayjs()
      const tsIso = new Date().toISOString()
      const meta = buildTargetMetaString({
        priority,
        updatedAt: tsIso,
        createdAt: tsIso,
        meta: ''
      })

      let startD = now
      let endD = now.add(1, 'month')
      if (!isPersonalDeskProject) {
        const bounds = getNormalizedProjectBounds(projectWindowIso.start, projectWindowIso.end)
        if (bounds) {
          startD = clampDayToInclusiveRange(startD, bounds.min, bounds.max)
          endD = clampDayToInclusiveRange(endD, bounds.min, bounds.max)
          if (endD.isBefore(startD, 'day')) endD = startD
        }
      }
      const newTargetStartIso = startD.format('YYYY-MM-DD')
      const newTargetEndIso = endD.format('YYYY-MM-DD')

      const ownerName = (projectOverview.owner || '').trim() || overviewActivityActorName
      const ownerUserId = members.find(m => m.name === ownerName)?.key ?? null
      onLocalMutation?.()
      const postRes = await postProjectTask(project.id, {
        title,
        kind: 'target',
        status: '未开始',
        priority: priority ?? '普通',
        startDate: uiTaskDateToIso(newTargetStartIso),
        endDate: uiTaskDateToIso(newTargetEndIso),
        ownerUserId,
        description: encodeTargetPayload({
          type,
          meta,
          textDescription: description,
          metricUnit: '无',
          metricStart: '无',
          metricTarget: '无',
          metricCurrent: '无',
          acceptanceCriteria: '无',
          deliveryNote: '无',
          acceptanceFeedback: '无',
          participants: []
        })
      })
      if (!postRes.ok) {
        message.error(postRes.message)
        return
      }
      await reloadTasksFromBackend()
      prependActivityRecords(postRes.id, [
        {
          id: `${postRes.id}-create`,
          actor: overviewActivityActorName,
          targetTitle: title,
          fieldLabel: '创建',
          before: '无',
          after: '已创建目标',
          createdAt: new Date().toISOString()
        }
      ])
      message.success('创建成功')
      if (createTargetContinue) {
        createTargetForm.resetFields()
        createTargetForm.setFieldsValue({ type: targetTypeLabel })
      } else {
        handleCancelCreateTarget()
      }
    } catch {
      // validateFields failed
    }
  }, [
    ensureMappedProjectPermission,
    createTargetForm,
    targetTypeLabel,
    isPersonalDeskProject,
    projectWindowIso,
    projectOverview.owner,
    overviewActivityActorName,
    members,
    project.id,
    reloadTasksFromBackend,
    prependActivityRecords,
    createTargetContinue,
    handleCancelCreateTarget
  ])

  return {
    updateEditingTarget,
    commitTargetDescription,
    deleteTargetByKey,
    addTargetComment,
    handleCancelCreateTarget,
    handleCreateTargetSubmit
  }
}

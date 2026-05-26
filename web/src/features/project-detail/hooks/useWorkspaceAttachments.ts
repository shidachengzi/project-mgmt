import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ProjectOverviewAttachmentItem } from '../overview/overviewTypes'
import type { ProjectOverviewInfo } from '../overview/overviewTypes'
import { readFileAsDataUrl, triggerDownloadAllAttachments, triggerDownloadAttachment } from '../shared/workspaceAttachmentUtils'
import { flattenTaskManageRows } from '../tasks/taskManageListUtils'
import type { TaskManageRecord } from '../tasks/taskTypes'
import type { TargetRecord } from '../targets/targetTypes'
import type { WorkspaceActivityRecord, WorkspaceAttachmentItem } from './useProjectDetailWorkspace'

export type UseWorkspaceAttachmentsParams = {
  projectId: string
  projectOverview: ProjectOverviewInfo
  overviewActivityActorName: string
  ensureMappedProjectPermission: (section: string, key: string) => boolean
  editingTarget: TargetRecord | null
  taskManageList: TaskManageRecord[]
  targetAttachmentsByKey: Record<string, WorkspaceAttachmentItem[]>
  setTargetAttachmentsByKey: Dispatch<SetStateAction<Record<string, WorkspaceAttachmentItem[]>>>
  taskAttachmentsByKey: Record<string, WorkspaceAttachmentItem[]>
  setTaskAttachmentsByKey: Dispatch<SetStateAction<Record<string, WorkspaceAttachmentItem[]>>>
  projectAttachments: ProjectOverviewAttachmentItem[]
  setProjectAttachments: Dispatch<SetStateAction<ProjectOverviewAttachmentItem[]>>
  /** 删除项目附件时用于活动记录文案 */
  prependTargetActivity: (
    entityKey: string,
    entry: Omit<WorkspaceActivityRecord, 'id' | 'actor' | 'targetTitle' | 'createdAt'> & { targetTitle?: string }
  ) => void
  appendOverviewActivityEntries: (entries: Array<{ fieldLabel: string; before: string; after: string; targetTitle?: string }>) => void
}

export function useWorkspaceAttachments({
  projectId,
  projectOverview,
  overviewActivityActorName,
  ensureMappedProjectPermission,
  editingTarget,
  taskManageList,
  targetAttachmentsByKey,
  setTargetAttachmentsByKey,
  taskAttachmentsByKey,
  setTaskAttachmentsByKey,
  projectAttachments,
  setProjectAttachments,
  prependTargetActivity,
  appendOverviewActivityEntries
}: UseWorkspaceAttachmentsParams) {
  const defaultUploader = (projectOverview.owner || '').trim() || overviewActivityActorName

  const addTargetAttachmentFromFile = useCallback(
    (file: File) => {
      if (!ensureMappedProjectPermission('目标管理', '管理附件')) return
      const targetKey = editingTarget?.key
      const capturedTitle = editingTarget?.title
      if (!targetKey) return
      void (async () => {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const item: WorkspaceAttachmentItem = {
            id: `${targetKey}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: file.name,
            sizeBytes: file.size,
            uploader: defaultUploader,
            createdAt: new Date().toISOString(),
            dataUrl
          }
          setTargetAttachmentsByKey(prev => ({
            ...prev,
            [targetKey]: [...(prev[targetKey] ?? []), item]
          }))
          prependTargetActivity(targetKey, {
            fieldLabel: '附件',
            before: '无',
            after: `上传「${file.name}」`,
            targetTitle: capturedTitle
          })
        } catch {
          // Ignore read / storage errors.
        }
      })()
    },
    [defaultUploader, editingTarget, ensureMappedProjectPermission, prependTargetActivity, setTargetAttachmentsByKey]
  )

  const removeTargetAttachmentItem = useCallback(
    (targetKey: string, attachmentId: string) => {
      if (!ensureMappedProjectPermission('目标管理', '管理附件')) return
      const item = (targetAttachmentsByKey[targetKey] ?? []).find(a => a.id === attachmentId)
      if (item) {
        prependTargetActivity(targetKey, {
          fieldLabel: '附件',
          before: `「${item.name}」`,
          after: '已删除',
          targetTitle: editingTarget?.key === targetKey ? editingTarget.title : undefined
        })
      }
      setTargetAttachmentsByKey(prev => ({
        ...prev,
        [targetKey]: (prev[targetKey] ?? []).filter(a => a.id !== attachmentId)
      }))
    },
    [editingTarget, ensureMappedProjectPermission, prependTargetActivity, setTargetAttachmentsByKey, targetAttachmentsByKey]
  )

  const addTaskAttachmentFromFile = useCallback(
    (taskKey: string, file: File) => {
      if (!ensureMappedProjectPermission('任务管理', '管理附件')) return
      const taskTitle = flattenTaskManageRows(taskManageList).find(x => x.key === taskKey)?.title
      void (async () => {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const item: WorkspaceAttachmentItem = {
            id: `${taskKey}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: file.name,
            sizeBytes: file.size,
            uploader: defaultUploader,
            createdAt: new Date().toISOString(),
            dataUrl
          }
          setTaskAttachmentsByKey(prev => ({
            ...prev,
            [taskKey]: [...(prev[taskKey] ?? []), item]
          }))
          prependTargetActivity(taskKey, {
            fieldLabel: '附件',
            before: '无',
            after: `上传「${file.name}」`,
            targetTitle: taskTitle
          })
        } catch {
          // Ignore read/storage errors.
        }
      })()
    },
    [defaultUploader, ensureMappedProjectPermission, prependTargetActivity, setTaskAttachmentsByKey, taskManageList]
  )

  const removeTaskAttachmentItem = useCallback(
    (taskKey: string, attachmentId: string) => {
      if (!ensureMappedProjectPermission('任务管理', '管理附件')) return
      const item = (taskAttachmentsByKey[taskKey] ?? []).find(a => a.id === attachmentId)
      if (item) {
        prependTargetActivity(taskKey, {
          fieldLabel: '附件',
          before: `「${item.name}」`,
          after: '已删除'
        })
      }
      setTaskAttachmentsByKey(prev => ({
        ...prev,
        [taskKey]: (prev[taskKey] ?? []).filter(a => a.id !== attachmentId)
      }))
    },
    [ensureMappedProjectPermission, prependTargetActivity, setTaskAttachmentsByKey, taskAttachmentsByKey]
  )

  const addProjectAttachmentFromFile = useCallback(
    (file: File) => {
      if (!ensureMappedProjectPermission('项目权限', '管理项目附件')) return
      void (async () => {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const item: ProjectOverviewAttachmentItem = {
            id: `project-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            sizeBytes: file.size,
            uploader: defaultUploader,
            createdAt: new Date().toISOString(),
            dataUrl
          }
          setProjectAttachments(prev => [item, ...prev])
          appendOverviewActivityEntries([
            {
              fieldLabel: '附件',
              before: '无',
              after: `上传「${file.name}」`
            }
          ])
        } catch {
          // Ignore file read errors.
        }
      })()
    },
    [appendOverviewActivityEntries, defaultUploader, ensureMappedProjectPermission, projectId, setProjectAttachments]
  )

  const removeProjectAttachmentItem = useCallback(
    (attachmentId: string) => {
      if (!ensureMappedProjectPermission('项目权限', '管理项目附件')) return
      const item = projectAttachments.find(x => x.id === attachmentId)
      setProjectAttachments(prev => prev.filter(x => x.id !== attachmentId))
      if (item) {
        appendOverviewActivityEntries([
          {
            fieldLabel: '附件',
            before: `「${item.name}」`,
            after: '已删除'
          }
        ])
      }
    },
    [appendOverviewActivityEntries, ensureMappedProjectPermission, projectAttachments, setProjectAttachments]
  )

  return {
    addTargetAttachmentFromFile,
    removeTargetAttachmentItem,
    triggerDownloadTargetAttachment: triggerDownloadAttachment,
    triggerDownloadAllTargetAttachments: triggerDownloadAllAttachments,
    addTaskAttachmentFromFile,
    removeTaskAttachmentItem,
    triggerDownloadTaskAttachment: triggerDownloadAttachment,
    triggerDownloadAllTaskAttachments: triggerDownloadAllAttachments,
    addProjectAttachmentFromFile,
    removeProjectAttachmentItem,
    triggerDownloadProjectAttachment: triggerDownloadAttachment
  }
}

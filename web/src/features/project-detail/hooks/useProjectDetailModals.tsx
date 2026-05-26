import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { parseDateValue, formatDateText, formatDateTime } from '../overview'
import type { ProjectOverviewInfo } from '../overview/overviewTypes'
import { ProjectTargetEditorModal } from '../targets/ProjectTargetEditorModal'
import type { TargetEditingField, TargetEditorTab, TargetRecord, TargetSideTab } from '../targets/targetTypes'
import { TaskManageEditorModal } from '../tasks/TaskManageEditorModal'
import type { CreateSubtaskOptions, TaskEditorSubtask, TaskEditorTab, TaskManageRecord } from '../tasks/taskTypes'
import type { ProjectMemberRecord } from '../settings/projectMemberRole'
import type { WorkspaceActivityRecord, WorkspaceAttachmentItem } from './useProjectDetailWorkspace'
import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'

type RelatedTaskLink = { taskKey: string; relation: string }

export type UseProjectDetailModalsParams = {
  editingTarget: TargetRecord | null
  setEditingTarget: Dispatch<SetStateAction<TargetRecord | null>>
  editingTargetField: TargetEditingField | null
  setEditingTargetField: Dispatch<SetStateAction<TargetEditingField | null>>
  targetTypeLabel: string
  projectOverview: ProjectOverviewInfo
  detailFromExternal?: { kind: 'target' | 'task'; key: string } | null
  onExternalDetailClose?: () => void
  canDeleteTarget: boolean
  deleteTargetByKey: (key: string) => void
  projectReadonly: boolean
  canEditTargetDetailFields: boolean
  canEditTargetStatusFields: boolean
  updateEditingTarget: (patch: Partial<TargetRecord>) => void
  members: ProjectMemberRecord[]
  editorTab: TargetEditorTab
  setEditorTab: Dispatch<SetStateAction<TargetEditorTab>>
  relatedLinksForTarget: RelatedTaskLink[]
  targetAttachmentsForEditor: WorkspaceAttachmentItem[]
  targetDescriptionDraft: string
  setTargetDescriptionDraft: Dispatch<SetStateAction<string>>
  commitTargetDescription: () => void
  hideCompletedRelated: boolean
  setHideCompletedRelated: Dispatch<SetStateAction<boolean>>
  relatedTasksOverallPercent: number
  canLinkTargetTasks: boolean
  setRelatedPickerOpen: Dispatch<SetStateAction<boolean>>
  setRelatedPickerPendingKeys: Dispatch<SetStateAction<string[]>>
  setRelatedPickerSearch: Dispatch<SetStateAction<string>>
  displayedRelatedLinks: RelatedTaskLink[]
  manageFlatTasks: TaskManageRecord[]
  openRelatedTaskDetailByKey: (key: string) => void
  removeRelatedTaskLink: (targetKey: string, taskKey: string) => void
  relatedPickerOpen: boolean
  relatedPickerSearch: string
  pickerRecentTasks: TaskManageRecord[]
  pickerRestTasks: TaskManageRecord[]
  relatedPickerPendingKeys: string[]
  toggleRelatedPickerPending: (key: string) => void
  cancelRelatedPicker: () => void
  confirmRelatedPicker: () => void
  canManageTargetTabAttachments: boolean
  triggerDownloadAllTargetAttachments: (items: WorkspaceAttachmentItem[]) => void
  addTargetAttachmentFromFile: (file: File) => void
  triggerDownloadTargetAttachment: (item: WorkspaceAttachmentItem) => void
  removeTargetAttachmentItem: (targetKey: string, attachmentId: string) => void
  targetSideTab: TargetSideTab
  setTargetSideTab: Dispatch<SetStateAction<TargetSideTab>>
  totalCommentsForSide: number
  visibleCommentsForSide: TargetCommentRecord[]
  hasMoreCommentsForSide: boolean
  setTargetSidePanelVisibleCount: Dispatch<SetStateAction<number>>
  activityFeedForSide: WorkspaceActivityRecord[]
  visibleActivityFeedForSide: WorkspaceActivityRecord[]
  hasMoreActivityFeedForSide: boolean
  statusFlowForSide: WorkspaceActivityRecord[]
  visibleStatusFlowForSide: WorkspaceActivityRecord[]
  hasMoreStatusFlowForSide: boolean
  targetCommentInput: string
  setTargetCommentInput: Dispatch<SetStateAction<string>>
  blockTargetFeedCommentInput: boolean
  currentSideKey: string
  addTargetComment: (key: string) => void
  editingTask: TaskManageRecord | null
  setEditingTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  editingChildTask: TaskManageRecord | null
  setEditingChildTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  getParentTaskBadge: (taskKey?: string) => string | undefined
  flushWorkspaceNow: () => void
  canEditTaskStatusFields: boolean
  canEditTaskInfoFields: boolean
  canCreateTaskOrSubtask: boolean
  canManageTaskEditorAttachments: boolean
  canDeleteTask: boolean
  deleteTaskByKey: (key: string) => Promise<boolean>
  updateEditingTask: (patch: Partial<TaskManageRecord>) => void
  updateTaskByKey: (key: string, patch: Partial<TaskManageRecord>) => void
  taskStageOptionTitles: string[]
  openTaskDetailByKey: (key: string) => void
  createSubtaskForTask: (parentTaskKey: string, title: string, options?: CreateSubtaskOptions) => void
  renameSubtaskByKey: (key: string, title: string) => void
  deleteSubtaskByKey: (key: string) => Promise<boolean>
  updateSubtaskByKey: (key: string, patch: Partial<TaskManageRecord>) => void
  taskEditorTab: TaskEditorTab
  setTaskEditorTab: Dispatch<SetStateAction<TaskEditorTab>>
  taskAttachmentsForEditingTask: WorkspaceAttachmentItem[]
  taskAttachmentsForEditingChildTask: WorkspaceAttachmentItem[]
  addTaskAttachmentFromFile: (taskKey: string, file: File) => void
  removeTaskAttachmentItem: (taskKey: string, attachmentId: string) => void
  triggerDownloadTaskAttachment: (item: WorkspaceAttachmentItem) => void
  triggerDownloadAllTaskAttachments: (items: WorkspaceAttachmentItem[]) => void
  taskEditorSubtasks: TaskEditorSubtask[]
  targetCommentsByKey: Record<string, TargetCommentRecord[]>
  targetActivityByKey: Record<string, WorkspaceActivityRecord[]>
  taskModalMembers: ProjectMemberRecord[]
  taskParticipantsByKey: Record<string, string[]>
  updateTaskParticipants: (taskKey: string, next: string[]) => void
  isPersonalDeskProject: boolean
}

export function useProjectDetailModals(p: UseProjectDetailModalsParams): {
  targetEditorModalEl: ReactNode
  taskManageEditorModalEl: ReactNode
} {
  const flatTasksForTarget = p.manageFlatTasks.filter(t => t.kind === 'task' || t.kind === 'subtask')

  const targetEditorModalEl = (
    <ProjectTargetEditorModal
      editingTarget={p.editingTarget}
      setEditingTarget={p.setEditingTarget}
      editingTargetField={p.editingTargetField}
      setEditingTargetField={p.setEditingTargetField}
      targetTypeLabel={p.targetTypeLabel}
      projectOverview={p.projectOverview}
      detailFromExternal={p.detailFromExternal}
      onExternalDetailClose={p.onExternalDetailClose}
      canDeleteTarget={p.canDeleteTarget}
      deleteTargetByKey={p.deleteTargetByKey}
      projectReadonly={p.projectReadonly}
      canEditTargetDetailFields={p.canEditTargetDetailFields}
      canEditTargetStatusFields={p.canEditTargetStatusFields}
      updateEditingTarget={p.updateEditingTarget}
      members={p.isPersonalDeskProject ? p.taskModalMembers : p.members}
      parseDateValue={parseDateValue}
      formatDateText={formatDateText}
      editorTab={p.editorTab}
      setEditorTab={p.setEditorTab}
      relatedLinksForTarget={p.relatedLinksForTarget}
      targetAttachmentsForEditor={p.targetAttachmentsForEditor}
      targetDescriptionDraft={p.targetDescriptionDraft}
      setTargetDescriptionDraft={p.setTargetDescriptionDraft}
      commitTargetDescription={p.commitTargetDescription}
      hideCompletedRelated={p.hideCompletedRelated}
      setHideCompletedRelated={p.setHideCompletedRelated}
      relatedTasksOverallPercent={p.relatedTasksOverallPercent}
      canLinkTargetTasks={p.canLinkTargetTasks}
      setRelatedPickerOpen={p.setRelatedPickerOpen}
      setRelatedPickerPendingKeys={p.setRelatedPickerPendingKeys}
      setRelatedPickerSearch={p.setRelatedPickerSearch}
      displayedRelatedLinks={p.displayedRelatedLinks}
      manageFlatTasks={flatTasksForTarget}
      openRelatedTaskDetailByKey={p.openRelatedTaskDetailByKey}
      removeRelatedTaskLink={p.removeRelatedTaskLink}
      relatedPickerOpen={p.relatedPickerOpen}
      relatedPickerSearch={p.relatedPickerSearch}
      pickerRecentTasks={p.pickerRecentTasks}
      pickerRestTasks={p.pickerRestTasks}
      relatedPickerPendingKeys={p.relatedPickerPendingKeys}
      toggleRelatedPickerPending={p.toggleRelatedPickerPending}
      cancelRelatedPicker={p.cancelRelatedPicker}
      confirmRelatedPicker={p.confirmRelatedPicker}
      canManageTargetTabAttachments={p.canManageTargetTabAttachments}
      triggerDownloadAllTargetAttachments={p.triggerDownloadAllTargetAttachments}
      addTargetAttachmentFromFile={p.addTargetAttachmentFromFile}
      triggerDownloadTargetAttachment={p.triggerDownloadTargetAttachment}
      removeTargetAttachmentItem={p.removeTargetAttachmentItem}
      targetSideTab={p.targetSideTab}
      setTargetSideTab={p.setTargetSideTab}
      totalCommentsForSide={p.totalCommentsForSide}
      visibleCommentsForSide={p.visibleCommentsForSide}
      hasMoreCommentsForSide={p.hasMoreCommentsForSide}
      setTargetSidePanelVisibleCount={p.setTargetSidePanelVisibleCount}
      activityFeedForSide={p.activityFeedForSide}
      visibleActivityFeedForSide={p.visibleActivityFeedForSide}
      hasMoreActivityFeedForSide={p.hasMoreActivityFeedForSide}
      statusFlowForSide={p.statusFlowForSide}
      visibleStatusFlowForSide={p.visibleStatusFlowForSide}
      hasMoreStatusFlowForSide={p.hasMoreStatusFlowForSide}
      targetCommentInput={p.targetCommentInput}
      setTargetCommentInput={p.setTargetCommentInput}
      blockTargetFeedCommentInput={p.blockTargetFeedCommentInput}
      currentSideKey={p.currentSideKey}
      addTargetComment={p.addTargetComment}
      formatDateTime={formatDateTime}
    />
  )

  const taskManageEditorModalEl = (
    <>
      <TaskManageEditorModal
        task={p.editingTask}
        parentTaskBadge={p.editingTask?.kind === 'subtask' ? p.getParentTaskBadge(p.editingTask.key) : undefined}
        onClose={() => {
          p.flushWorkspaceNow()
          p.setEditingTask(null)
          p.setEditingChildTask(null)
          if (p.detailFromExternal) p.onExternalDetailClose?.()
        }}
        readonly={p.projectReadonly}
        canEditStatusFields={p.canEditTaskStatusFields}
        canEditTaskInfoFields={p.canEditTaskInfoFields}
        canCreateSubtask={p.canCreateTaskOrSubtask}
        canManageTaskAttachments={p.canManageTaskEditorAttachments}
        canDeleteTask={p.canDeleteTask}
        deleteTask={p.deleteTaskByKey}
        projectOverview={p.projectOverview}
        updateTask={p.updateEditingTask}
        taskStageOptions={p.taskStageOptionTitles}
        openTaskDetail={p.openTaskDetailByKey}
        createSubtask={p.createSubtaskForTask}
        renameSubtask={p.renameSubtaskByKey}
        deleteSubtask={p.deleteSubtaskByKey}
        updateSubtask={p.updateSubtaskByKey}
        taskEditorTab={p.taskEditorTab}
        setTaskEditorTab={p.setTaskEditorTab}
        taskAttachments={p.taskAttachmentsForEditingTask}
        addTaskAttachmentFromFile={p.addTaskAttachmentFromFile}
        removeTaskAttachmentItem={p.removeTaskAttachmentItem}
        triggerDownloadTaskAttachment={p.triggerDownloadTaskAttachment}
        triggerDownloadAllTaskAttachments={p.triggerDownloadAllTaskAttachments}
        taskEditorSubtasks={p.taskEditorSubtasks}
        targetSideTab={p.targetSideTab}
        setTargetSideTab={p.setTargetSideTab}
        targetCommentsByKey={p.targetCommentsByKey}
        targetActivityByKey={p.targetActivityByKey}
        targetCommentInput={p.targetCommentInput}
        setTargetCommentInput={p.setTargetCommentInput}
        currentSideKey={p.editingTask?.key ?? ''}
        addTargetComment={p.addTargetComment}
        members={p.isPersonalDeskProject ? p.taskModalMembers : p.members}
        taskParticipants={p.editingTask?.key ? (p.taskParticipantsByKey[p.editingTask.key] ?? []) : []}
        updateTaskParticipants={p.updateTaskParticipants}
        targetCommentInputDisabled={p.blockTargetFeedCommentInput}
        isPersonalDeskProject={p.isPersonalDeskProject}
      />
      <TaskManageEditorModal
        task={p.editingChildTask}
        parentTaskBadge={p.editingChildTask?.kind === 'subtask' ? p.getParentTaskBadge(p.editingChildTask.key) : undefined}
        onClose={() => {
          p.flushWorkspaceNow()
          p.setEditingChildTask(null)
        }}
        readonly={p.projectReadonly}
        canEditStatusFields={p.canEditTaskStatusFields}
        canEditTaskInfoFields={p.canEditTaskInfoFields}
        canCreateSubtask={p.canCreateTaskOrSubtask}
        canManageTaskAttachments={p.canManageTaskEditorAttachments}
        canDeleteTask={p.canDeleteTask}
        deleteTask={p.deleteTaskByKey}
        projectOverview={p.projectOverview}
        updateTask={patch => {
          if (!p.editingChildTask) return
          p.updateTaskByKey(p.editingChildTask.key, patch)
        }}
        taskStageOptions={p.taskStageOptionTitles}
        openTaskDetail={p.openTaskDetailByKey}
        createSubtask={p.createSubtaskForTask}
        renameSubtask={p.renameSubtaskByKey}
        deleteSubtask={p.deleteSubtaskByKey}
        updateSubtask={p.updateSubtaskByKey}
        taskEditorTab={p.taskEditorTab}
        setTaskEditorTab={p.setTaskEditorTab}
        taskAttachments={p.taskAttachmentsForEditingChildTask}
        addTaskAttachmentFromFile={p.addTaskAttachmentFromFile}
        removeTaskAttachmentItem={p.removeTaskAttachmentItem}
        triggerDownloadTaskAttachment={p.triggerDownloadTaskAttachment}
        triggerDownloadAllTaskAttachments={p.triggerDownloadAllTaskAttachments}
        taskEditorSubtasks={p.editingChildTask && p.editingChildTask.kind === 'task' ? p.taskEditorSubtasks : []}
        targetSideTab={p.targetSideTab}
        setTargetSideTab={p.setTargetSideTab}
        targetCommentsByKey={p.targetCommentsByKey}
        targetActivityByKey={p.targetActivityByKey}
        targetCommentInput={p.targetCommentInput}
        setTargetCommentInput={p.setTargetCommentInput}
        currentSideKey={p.editingChildTask?.key ?? ''}
        addTargetComment={p.addTargetComment}
        members={p.isPersonalDeskProject ? p.taskModalMembers : p.members}
        taskParticipants={p.editingChildTask?.key ? (p.taskParticipantsByKey[p.editingChildTask.key] ?? []) : []}
        updateTaskParticipants={p.updateTaskParticipants}
        targetCommentInputDisabled={p.blockTargetFeedCommentInput}
        isPersonalDeskProject={p.isPersonalDeskProject}
      />
    </>
  )

  return { targetEditorModalEl, taskManageEditorModalEl }
}

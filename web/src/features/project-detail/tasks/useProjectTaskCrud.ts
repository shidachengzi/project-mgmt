import { message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import dayjs from 'dayjs'
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import type { TargetRelatedTaskLink, WorkspaceActivityRecord, WorkspaceAttachmentItem } from '../hooks/useProjectDetailWorkspace'
import type { ProjectOverviewInfo } from '../overview'
import { validateEntityDatesAgainstProject, type EntityDateValidationMode } from '../projectDateValidation'
import { deleteProjectTask, fetchProjectTasks, patchProjectTask, postProjectTask } from '../../../shared/api/projectTasksApi'
import type { TargetRecord } from '../targets/targetTypes'
import { flattenTaskManageRows } from './taskManageListUtils'
import type { TaskManageRecord } from './taskTypes'
import { loadProjectTasksTree, notifyProjectTasksTreeLoadError } from './projectTasksLoader'
import {
  finalizeTaskManageTree,
  formatActivityLogDate,
  projectTaskDtosToRecords,
  splitProjectTaskTree,
  taskManageDeltaToApi,
  uiTaskDateToIso
} from './projectTaskAdapter'
import type { TaskEditorTab } from './taskTypes'

export type TaskCrudMemberRef = { key: string; name: string }

export type UseProjectTaskCrudParams = {
  project: ProjectSummary
  targetTypeLabel: string
  taskTypeLabel: string
  taskStageOptionTitles: string[]
  taskManageList: TaskManageRecord[]
  setTaskManageList: Dispatch<SetStateAction<TaskManageRecord[]>>
  setTargetList: Dispatch<SetStateAction<TargetRecord[]>>
  members: TaskCrudMemberRef[]
  taskModalMembers: TaskCrudMemberRef[]
  projectWindowIso: { start: string; end: string }
  entityDateValidationMode: EntityDateValidationMode
  projectOverview: ProjectOverviewInfo
  ensureProjectEditable: () => boolean
  hasMappedProjectPermission: (section: string, key: string) => boolean
  overviewActivityActorName: string
  editingTask: TaskManageRecord | null
  setEditingTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  editingChildTask: TaskManageRecord | null
  setEditingChildTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  setTaskEditorTab: Dispatch<SetStateAction<TaskEditorTab>>
  setTargetSideTab: Dispatch<SetStateAction<'评论' | '活动' | '流转' | '状态审批'>>
  targetList: TargetRecord[]
  targetRelatedTasksByKey: Record<string, TargetRelatedTaskLink[]>
  setTaskParticipantsByKey: Dispatch<SetStateAction<Record<string, string[]>>>
  syncTaskParticipantsPatchToBackend: (patch: Record<string, string[]>) => void
  setTaskAttachmentsByKey: Dispatch<SetStateAction<Record<string, WorkspaceAttachmentItem[]>>>
  setTargetRelatedTasksByKey: Dispatch<SetStateAction<Record<string, TargetRelatedTaskLink[]>>>
  prependActivityRecords: (entityKey: string, records: WorkspaceActivityRecord[]) => void
  prependActivity: (entityKey: string, entry: Omit<WorkspaceActivityRecord, 'id' | 'actor' | 'targetTitle' | 'createdAt'> & { targetTitle?: string }) => void
  createTaskForm: FormInstance
  createTaskContinue: boolean
  setCreateTaskModalOpen: Dispatch<SetStateAction<boolean>>
  setCreateTaskContinue: Dispatch<SetStateAction<boolean>>
  onLocalMutation?: () => void
}

const isSyntheticStageRowKey = (key: string) => key.startsWith('stage-template-')

export function useProjectTaskCrud({
  project,
  targetTypeLabel,
  taskTypeLabel,
  taskStageOptionTitles,
  taskManageList,
  setTaskManageList,
  setTargetList,
  members,
  taskModalMembers,
  projectWindowIso,
  entityDateValidationMode,
  projectOverview,
  ensureProjectEditable,
  hasMappedProjectPermission,
  overviewActivityActorName,
  editingTask,
  setEditingTask,
  editingChildTask,
  setEditingChildTask,
  setTaskEditorTab,
  setTargetSideTab,
  targetList,
  targetRelatedTasksByKey,
  setTaskParticipantsByKey,
  syncTaskParticipantsPatchToBackend,
  setTaskAttachmentsByKey,
  setTargetRelatedTasksByKey,
  prependActivityRecords,
  prependActivity,
  createTaskForm,
  createTaskContinue,
  setCreateTaskModalOpen,
  setCreateTaskContinue,
  onLocalMutation
}: UseProjectTaskCrudParams) {
  const reloadTasksFromBackend = useCallback(async (): Promise<TaskManageRecord[] | null> => {
    const result = await loadProjectTasksTree(project.id, targetTypeLabel, taskStageOptionTitles)
    if (!result.ok) return null
    setTargetList(result.targets)
    setTaskManageList(result.taskManageList)
    return result.taskManageList
  }, [project.id, setTargetList, setTaskManageList, targetTypeLabel, taskStageOptionTitles])

  const resolveBackendStageRowForTitle = useCallback(
    async (stageTitle: string): Promise<TaskManageRecord | null> => {
      let row = taskManageList.find(r => r.kind === 'stage' && r.title === stageTitle) ?? null
      if (row && !isSyntheticStageRowKey(row.key)) return row
      const list = await reloadTasksFromBackend()
      if (!list) return null
      row = list.find(r => r.kind === 'stage' && r.title === stageTitle) ?? null
      if (row && !isSyntheticStageRowKey(row.key)) return row
      onLocalMutation?.()
      const stageRes = await postProjectTask(project.id, {
        title: stageTitle,
        kind: 'stage',
        parentId: null
      })
      if (!stageRes.ok) {
        message.error(stageRes.message)
        return null
      }
      const listAfter = await reloadTasksFromBackend()
      if (!listAfter) return null
      row = listAfter.find(r => r.kind === 'stage' && r.title === stageTitle) ?? null
      if (!row || isSyntheticStageRowKey(row.key)) return null
      return row
    },
    [project.id, reloadTasksFromBackend, taskManageList]
  )

  const getLinkedTargetTitlesForTaskKeys = useCallback(
    (keys: Set<string>) => {
      const titles: string[] = []
      for (const [targetKey, links] of Object.entries(targetRelatedTasksByKey)) {
        if ((links ?? []).some(l => keys.has(l.taskKey))) {
          titles.push(targetList.find(t => t.key === targetKey)?.title ?? targetKey)
        }
      }
      return titles
    },
    [targetList, targetRelatedTasksByKey]
  )

  const updateTaskByKey = useCallback(
    (taskKey: string, patch: Partial<TaskManageRecord>) => {
      if (!ensureProjectEditable()) return
      const patchKeys = Object.keys(patch) as Array<keyof TaskManageRecord>
      if (!patchKeys.length) return
      const statusManagedFields: Array<keyof TaskManageRecord> = ['status', 'owner', 'start', 'end']
      const editsStatusFields = patchKeys.some(k => statusManagedFields.includes(k))
      const editsGeneralFields = patchKeys.some(k => !statusManagedFields.includes(k))
      if (editsStatusFields && !hasMappedProjectPermission('任务管理', '修改任务状态')) {
        message.warning('当前角色暂无「修改任务状态」权限')
        return
      }
      if (editsGeneralFields && !hasMappedProjectPermission('任务管理', '编辑任务')) {
        message.warning('当前角色暂无「编辑任务」权限')
        return
      }
      const currentTask = flattenTaskManageRows(taskManageList).find(x => x.key === taskKey)
      if (!currentTask) return
      if (currentTask.kind === 'subtask' && patch.stage !== undefined && patch.stage !== currentTask.stage) {
        message.warning('子任务不能单独修改项目阶段，请在父任务中修改项目阶段')
        return
      }
      const fieldLabels: Partial<Record<keyof TaskManageRecord, string>> = {
        title: '标题',
        status: '状态',
        owner: '负责人',
        start: '开始时间',
        end: '截止时间',
        stage: '项目阶段',
        priority: '优先级',
        description: '描述'
      }

      const now = new Date().toISOString()
      let nextTask: TaskManageRecord = {
        ...currentTask,
        ...patch,
        updatedAt: now,
        createdAt: currentTask.createdAt ?? now
      }
      if (currentTask.kind === 'task' && typeof patch.stage === 'string' && patch.stage !== currentTask.stage) {
        nextTask = {
          ...nextTask,
          children: (nextTask.children ?? []).map((ch: TaskManageRecord) =>
            ch.kind === 'subtask' ? { ...ch, stage: patch.stage } : ch,
          )
        }
      }
      if (patch.start !== undefined || patch.end !== undefined) {
        const v = validateEntityDatesAgainstProject({
          projectStartIso: projectWindowIso.start,
          projectEndIso: projectWindowIso.end,
          entityStartIso: nextTask.start,
          entityEndIso: nextTask.end,
          mode: entityDateValidationMode
        })
        if (!v.ok) {
          message.warning(v.message)
          return
        }
      }
      const activities: WorkspaceActivityRecord[] = (Object.keys(patch) as (keyof TaskManageRecord)[])
        .filter(k => fieldLabels[k])
        .flatMap(k => {
          const before = currentTask[k]
          const after = nextTask[k]
          if ((before ?? '') === (after ?? '')) return []
          const label = fieldLabels[k] as string
          const isDateField = k === 'start' || k === 'end'
          return [
            {
              id: `${taskKey}-${String(k)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              actor: overviewActivityActorName,
              targetTitle: nextTask.title,
              fieldLabel: label,
              before: isDateField ? formatActivityLogDate(String(before ?? '')) : String(before ?? '无'),
              after: isDateField ? formatActivityLogDate(String(after ?? '')) : String(after ?? '无'),
              createdAt: now
            }
          ]
        })

      void (async () => {
        onLocalMutation?.()
        let listForApi = taskManageList
        if (typeof patch.stage === 'string' && patch.stage) {
          const st = taskManageList.find(r => r.kind === 'stage' && r.title === patch.stage)
          if (!st || isSyntheticStageRowKey(st.key)) {
            const resolved = await resolveBackendStageRowForTitle(patch.stage)
            if (!resolved) {
              message.error('无法解析所选项目阶段，请刷新页面后重试')
              return
            }
            const reloaded = await reloadTasksFromBackend()
            if (reloaded) listForApi = reloaded
          }
        }
        const apiBody = taskManageDeltaToApi(patch, taskModalMembers, listForApi)
        if (Object.keys(apiBody).length > 0) {
          const res = await patchProjectTask(project.id, taskKey, apiBody)
          if (!res.ok) {
            message.error(res.message)
            return
          }
        }
        if (currentTask.kind === 'task' && typeof patch.stage === 'string' && patch.stage !== currentTask.stage) {
          const subs = (currentTask.children ?? []).filter(c => c.kind === 'subtask')
          for (const sub of subs) {
            if (sub.stage === patch.stage) continue
            const subBody = taskManageDeltaToApi({ stage: patch.stage }, taskModalMembers, listForApi, {
              stageTitleOnly: true
            })
            if (Object.keys(subBody).length > 0) {
              const sr = await patchProjectTask(project.id, sub.key, subBody)
              if (!sr.ok) {
                message.error(sr.message)
                return
              }
            }
          }
        }
        const list = await reloadTasksFromBackend()
        if (!list) return
        const flat = flattenTaskManageRows(list)
        setEditingTask((prev: TaskManageRecord | null) => {
          if (!prev || prev.key !== taskKey) return prev
          return flat.find(x => x.key === taskKey) ?? prev
        })
        setEditingChildTask((prev: TaskManageRecord | null) => {
          if (!prev || prev.key !== taskKey) return prev
          return flat.find(x => x.key === taskKey) ?? prev
        })
        if (activities.length) {
          prependActivityRecords(taskKey, activities)
        }
      })()
    },
    [
      ensureProjectEditable,
      entityDateValidationMode,
      hasMappedProjectPermission,
      overviewActivityActorName,
      prependActivityRecords,
      project.id,
      projectWindowIso.end,
      projectWindowIso.start,
      reloadTasksFromBackend,
      resolveBackendStageRowForTitle,
      setEditingChildTask,
      setEditingTask,
      taskManageList,
      taskModalMembers,
      onLocalMutation
    ]
  )

  const updateEditingTask = useCallback(
    (patch: Partial<TaskManageRecord>) => {
      if (!editingTask) return
      updateTaskByKey(editingTask.key, patch)
    },
    [editingTask, updateTaskByKey]
  )

  const handleCancelCreateTask = useCallback(() => {
    setCreateTaskModalOpen(false)
    setCreateTaskContinue(false)
    createTaskForm.resetFields()
  }, [createTaskForm, setCreateTaskContinue, setCreateTaskModalOpen])

  const handleCreateTaskSubmit = useCallback(async () => {
    if (!hasMappedProjectPermission('任务管理', '新建任务')) return
    try {
      const values = await createTaskForm.validateFields()
      const title = String(values.title ?? '').trim()
      const stage = String(values.stage ?? '').trim()
      const owner = values.owner ? String(values.owner) : undefined
      const priority = (values.priority as TaskManageRecord['priority']) ?? '普通'
      const participants = (values.participants as string[] | undefined) ?? []
      const description = String(values.description ?? '').trim()
      const start = values.start ? dayjs(values.start).format('YYYY-MM-DD') : ''
      const end = values.end ? dayjs(values.end).format('YYYY-MM-DD') : ''
      if (!title || !stage) return

      const dateCheck = validateEntityDatesAgainstProject({
        projectStartIso: projectWindowIso.start,
        projectEndIso: projectWindowIso.end,
        entityStartIso: start || null,
        entityEndIso: end || null,
        mode: entityDateValidationMode
      })
      if (!dateCheck.ok) {
        message.warning(dateCheck.message)
        return
      }

      const stageRow = await resolveBackendStageRowForTitle(stage)
      if (!stageRow) {
        message.error('找不到所选阶段节点')
        return
      }
      const ownerUserId = owner ? members.find(m => m.name === owner)?.key : undefined
      if (owner && !ownerUserId) {
        message.warning('当前项目成员中未找到所选负责人')
        return
      }
      onLocalMutation?.()
      const postRes = await postProjectTask(project.id, {
        title,
        kind: 'task',
        parentId: stageRow.key,
        priority,
        startDate: values.start ? dayjs(values.start).format('YYYY-MM-DD') : null,
        endDate: values.end ? dayjs(values.end).format('YYYY-MM-DD') : null,
        ownerUserId: ownerUserId ?? null,
        stageTitle: stage,
        description: description || null
      })
      if (!postRes.ok) {
        message.error(postRes.message)
        return
      }
      const reloadRes = await fetchProjectTasks(project.id)
      if (!reloadRes.ok) {
        notifyProjectTasksTreeLoadError(project.id, reloadRes.message)
        return
      }
      const { taskRoots: rootsAfterCreate } = splitProjectTaskTree(reloadRes.data)
      const nextList = finalizeTaskManageTree(projectTaskDtosToRecords(rootsAfterCreate), taskStageOptionTitles) as TaskManageRecord[]
      setTaskManageList(nextList)
      const created = flattenTaskManageRows(nextList).find(t => t.key === postRes.id)
      if (participants.length && created) {
        setTaskParticipantsByKey(prev => ({
          ...prev,
          [created.key]: participants
        }))
        syncTaskParticipantsPatchToBackend({ [created.key]: participants })
      }
      if (created) {
        prependActivityRecords(created.key, [
          {
            id: `${created.key}-create`,
            actor: overviewActivityActorName,
            targetTitle: created.title,
            fieldLabel: '创建',
            before: '无',
            after: '已创建任务',
            createdAt: new Date().toISOString()
          }
        ])
      }
      message.success('创建成功')
      if (created) setEditingTask(created)
      setEditingChildTask(null)
      setTaskEditorTab('任务信息')
      setTargetSideTab('评论')
      if (createTaskContinue) {
        createTaskForm.resetFields()
        createTaskForm.setFieldsValue({
          type: taskTypeLabel,
          stage,
          priority: '普通'
        })
      } else {
        handleCancelCreateTask()
      }
    } catch {
      // validateFields failed.
    }
  }, [
    createTaskContinue,
    createTaskForm,
    entityDateValidationMode,
    handleCancelCreateTask,
    hasMappedProjectPermission,
    members,
    overviewActivityActorName,
    prependActivityRecords,
    project.id,
    projectWindowIso.end,
    projectWindowIso.start,
    resolveBackendStageRowForTitle,
    setEditingChildTask,
    setEditingTask,
    setTargetSideTab,
    setTaskEditorTab,
    setTaskManageList,
    setTaskParticipantsByKey,
    syncTaskParticipantsPatchToBackend,
    taskStageOptionTitles,
    taskTypeLabel
  ])

  const createSubtaskForTask = useCallback(
    (
      parentTaskKey: string,
      title: string,
      options?: {
        owner?: string
        start?: string
        end?: string
        stage?: string
        priority?: TaskManageRecord['priority']
        participants?: string[]
        description?: string
      }
    ) => {
      if (!ensureProjectEditable()) return
      const parent = flattenTaskManageRows(taskManageList).find(x => x.key === parentTaskKey)
      if (!parent || parent.kind !== 'task') return
      const cleanTitle = title.trim()
      if (!cleanTitle) return

      const subDateCheck = validateEntityDatesAgainstProject({
        projectStartIso: projectWindowIso.start,
        projectEndIso: projectWindowIso.end,
        entityStartIso: options?.start || null,
        entityEndIso: options?.end || null,
        mode: entityDateValidationMode
      })
      if (!subDateCheck.ok) {
        message.warning(subDateCheck.message)
        return
      }

      void (async () => {
        onLocalMutation?.()
        const ownerName = options?.owner ?? ((projectOverview.owner || '').trim() || overviewActivityActorName)
        const ownerUserId = members.find(m => m.name === ownerName)?.key ?? null
        const postRes = await postProjectTask(project.id, {
          title: cleanTitle,
          kind: 'subtask',
          parentId: parentTaskKey,
          priority: options?.priority ?? '普通',
          stageTitle: options?.stage ?? parent.stage ?? null,
          ownerUserId,
          startDate: options?.start ? uiTaskDateToIso(options.start) : null,
          endDate: options?.end ? uiTaskDateToIso(options.end) : null,
          description: options?.description ?? null
        })
        if (!postRes.ok) {
          message.error(postRes.message)
          return
        }
        const list = await reloadTasksFromBackend()
        if (!list) return
        const created = flattenTaskManageRows(list).find(t => t.key === postRes.id)
        if (options?.participants?.length && created) {
          setTaskParticipantsByKey(prev => ({
            ...prev,
            [created.key]: options.participants!
          }))
          syncTaskParticipantsPatchToBackend({ [created.key]: options.participants! })
        }
        if (created) {
          setEditingChildTask(created)
          prependActivityRecords(created.key, [
            {
              id: `${created.key}-create`,
              actor: overviewActivityActorName,
              targetTitle: created.title,
              fieldLabel: '创建',
              before: '无',
              after: '已创建任务',
              createdAt: new Date().toISOString()
            }
          ])
        }
        setTaskEditorTab('任务信息')
        setTargetSideTab('评论')
      })()
    },
    [
      ensureProjectEditable,
      entityDateValidationMode,
      members,
      overviewActivityActorName,
      prependActivityRecords,
      project.id,
      projectOverview.owner,
      projectWindowIso.end,
      projectWindowIso.start,
      reloadTasksFromBackend,
      setEditingChildTask,
      setTargetSideTab,
      setTaskEditorTab,
      setTaskParticipantsByKey,
      syncTaskParticipantsPatchToBackend,
      taskManageList
    ]
  )

  const renameSubtaskByKey = useCallback(
    (taskKey: string, title: string) => {
      if (!hasMappedProjectPermission('任务管理', '编辑任务')) return
      const clean = title.trim()
      if (!clean) return
      updateTaskByKey(taskKey, { title: clean })
    },
    [hasMappedProjectPermission, updateTaskByKey]
  )

  const deleteSubtaskByKey = useCallback(
    async (taskKey: string): Promise<boolean> => {
      if (!hasMappedProjectPermission('任务管理', '删除任务')) return false
      const flat = flattenTaskManageRows(taskManageList)
      const target = flat.find(x => x.key === taskKey)
      if (!target || target.kind !== 'subtask') return false

      const linkedTitles = getLinkedTargetTitlesForTaskKeys(new Set([taskKey]))
      if (linkedTitles.length > 0) {
        message.warning(`该任务已被目标「${linkedTitles.join('、')}」关联，请先在目标管理中解除关联后再删除。`)
        return false
      }

      let parentTaskKey = ''
      const findParent = (rows: TaskManageRecord[]) => {
        for (const row of rows) {
          if ((row.children ?? []).some((c: TaskManageRecord) => c.key === taskKey)) {
            parentTaskKey = row.key
            return true
          }
          if (row.children?.length && findParent(row.children)) return true
        }
        return false
      }
      findParent(taskManageList)

      onLocalMutation?.()
      const res = await deleteProjectTask(project.id, taskKey)
      if (!res.ok) {
        message.error(res.message)
        return false
      }
      await reloadTasksFromBackend()
      if (editingChildTask?.key === taskKey) setEditingChildTask(null)
      if (parentTaskKey) {
        prependActivity(parentTaskKey, {
          fieldLabel: '子任务',
          before: target.title,
          after: '已删除'
        })
      }
      return true
    },
    [
      editingChildTask?.key,
      getLinkedTargetTitlesForTaskKeys,
      prependActivity,
      project.id,
      reloadTasksFromBackend,
      setEditingChildTask,
      taskManageList
    ]
  )

  const deleteTaskByKey = useCallback(
    async (taskKey: string): Promise<boolean> => {
      if (!hasMappedProjectPermission('任务管理', '删除任务')) return false

      const findNode = (rows: TaskManageRecord[]): TaskManageRecord | null => {
        for (const row of rows) {
          if (row.key === taskKey) return row
          if (row.children?.length) {
            const found = findNode(row.children)
            if (found) return found
          }
        }
        return null
      }

      const node = findNode(taskManageList)
      if (!node || node.kind !== 'task') return false

      const removedKeys = new Set<string>()
      const collectKeys = (n: TaskManageRecord) => {
        removedKeys.add(n.key)
        for (const c of n.children ?? []) collectKeys(c)
      }
      collectKeys(node)

      const linkedTitles = getLinkedTargetTitlesForTaskKeys(removedKeys)
      if (linkedTitles.length > 0) {
        message.warning(`该任务或子任务已被目标「${linkedTitles.join('、')}」关联，请先在目标管理中解除关联后再删除。`)
        return false
      }

      const res = await deleteProjectTask(project.id, taskKey)
      if (!res.ok) {
        message.error(res.message)
        return false
      }
      const okReload = await reloadTasksFromBackend()
      if (!okReload) return false
      if (editingTask?.key && removedKeys.has(editingTask.key)) {
        setEditingTask(null)
        setEditingChildTask(null)
      }
      if (editingChildTask?.key && removedKeys.has(editingChildTask.key)) setEditingChildTask(null)
      setTaskAttachmentsByKey(prev => {
        const next = { ...prev }
        removedKeys.forEach(k => {
          if (next[k]) delete next[k]
        })
        return next
      })
      setTaskParticipantsByKey(prev => {
        const next = { ...prev }
        removedKeys.forEach(k => {
          if (next[k]) delete next[k]
        })
        return next
      })
      setTargetRelatedTasksByKey(prev => {
        const next = { ...prev }
        for (const tKey of Object.keys(next)) {
          next[tKey] = (next[tKey] ?? []).filter(l => !removedKeys.has(l.taskKey))
        }
        return next
      })
      return true
    },
    [
      editingChildTask?.key,
      editingTask?.key,
      getLinkedTargetTitlesForTaskKeys,
      project.id,
      reloadTasksFromBackend,
      setEditingChildTask,
      setEditingTask,
      setTargetRelatedTasksByKey,
      setTaskAttachmentsByKey,
      setTaskParticipantsByKey,
      taskManageList
    ]
  )

  const updateSubtaskByKey = useCallback(
    (taskKey: string, patch: Partial<TaskManageRecord>) => {
      if (!ensureProjectEditable()) return
      updateTaskByKey(taskKey, patch)
    },
    [ensureProjectEditable, updateTaskByKey]
  )

  return {
    reloadTasksFromBackend,
    updateTaskByKey,
    updateEditingTask,
    updateSubtaskByKey,
    handleCancelCreateTask,
    handleCreateTaskSubmit,
    createSubtaskForTask,
    renameSubtaskByKey,
    deleteSubtaskByKey,
    deleteTaskByKey
  }
}

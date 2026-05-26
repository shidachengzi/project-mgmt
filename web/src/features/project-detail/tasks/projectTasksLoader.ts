import { message } from 'antd'
import { fetchProjectTasks } from '../../../shared/api/projectTasksApi'
import type { TargetRecord } from '../targets/targetTypes'
import {
  finalizeTaskManageTree,
  projectTargetDtosToRecords,
  projectTaskDtosToRecords,
  splitProjectTaskTree
} from './projectTaskAdapter'
import type { TaskManageRecord } from './taskTypes'

/** 同一项目任务树加载失败合并为单次提示，避免 Strict Mode / 并行请求连弹两条 */
export function notifyProjectTasksTreeLoadError(projectId: string, errMsg: string) {
  message.error({ content: errMsg, key: `project-tasks-load:${projectId}` })
}

export type LoadProjectTasksTreeResult =
  | { ok: true; targets: TargetRecord[]; taskManageList: TaskManageRecord[] }
  | { ok: false }

export async function loadProjectTasksTree(
  projectId: string,
  targetTypeLabel: string,
  taskStageOptionTitles: string[]
): Promise<LoadProjectTasksTreeResult> {
  const res = await fetchProjectTasks(projectId)
  if (!res.ok) {
    notifyProjectTasksTreeLoadError(projectId, res.message)
    return { ok: false }
  }
  const { taskRoots, targets } = splitProjectTaskTree(res.data)
  return {
    ok: true,
    targets: projectTargetDtosToRecords(targets, targetTypeLabel) as TargetRecord[],
    taskManageList: finalizeTaskManageTree(projectTaskDtosToRecords(taskRoots), taskStageOptionTitles) as TaskManageRecord[]
  }
}

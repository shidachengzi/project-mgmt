import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { fetchProjectDetail } from '../../../shared/api/projectsApi'
import { loadProjectTasksTree } from '../tasks/projectTasksLoader'
import type { TargetRecord } from '../targets/targetTypes'
import type { TaskManageRecord } from '../tasks/taskTypes'
import type { ProjectServerAudit } from './useProjectSettingsMeta'

export type UseProjectDetailDataLoadParams = {
  project: ProjectSummary
  targetTypeLabel: string
  taskStageOptionTitles: string[]
  onUpdateProject?: (project: ProjectSummary) => void
  serverUpdatedAtRef?: MutableRefObject<string | null>
}

export type UseProjectDetailDataLoadResult = {
  targetList: TargetRecord[]
  setTargetList: Dispatch<SetStateAction<TargetRecord[]>>
  taskManageList: TaskManageRecord[]
  setTaskManageList: Dispatch<SetStateAction<TaskManageRecord[]>>
  isTargetHydrated: boolean
  isTaskManageHydrated: boolean
  isProjectArchived: boolean
  setIsProjectArchived: Dispatch<SetStateAction<boolean>>
  projectServerAudit: ProjectServerAudit | null
  setProjectServerAudit: Dispatch<SetStateAction<ProjectServerAudit | null>>
  reloadProjectTasksFromServer: () => Promise<void>
}

export function useProjectDetailDataLoad({
  project,
  targetTypeLabel,
  taskStageOptionTitles,
  onUpdateProject,
  serverUpdatedAtRef
}: UseProjectDetailDataLoadParams): UseProjectDetailDataLoadResult {
  const [targetList, setTargetList] = useState<TargetRecord[]>([])
  const [isTargetHydrated, setIsTargetHydrated] = useState(false)
  const [taskManageList, setTaskManageList] = useState<TaskManageRecord[]>([])
  const [isTaskManageHydrated, setIsTaskManageHydrated] = useState(false)
  const [isProjectArchived, setIsProjectArchived] = useState(false)
  const [projectServerAudit, setProjectServerAudit] = useState<ProjectServerAudit | null>(null)

  useEffect(() => {
    setIsProjectArchived(Boolean(project.backendArchived))
  }, [project.id, project.backendArchived])

  /** 成员/RBAC 未水合时轻量拉取；完整 workspace 由概览 hook 读取缓存或单独请求，避免与 refreshProject 重复 */
  useEffect(() => {
    const store = useBackendDataStore.getState()
    if (store.membersRowsByProject[project.id] !== undefined) return
    void store.refreshProjectRbac(project.id)
  }, [project.id])

  useEffect(() => {
    let cancel = false
    setProjectServerAudit(null)
    void (async () => {
      const res = await fetchProjectDetail(project.id)
      if (cancel || !res.ok) return
      const d = res.data
      setProjectServerAudit({
        ownerName: d.ownerName,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      })
      if (serverUpdatedAtRef) serverUpdatedAtRef.current = d.updatedAt
      onUpdateProject?.({
        ...project,
        title: d.title,
        backendVisibility: d.visibility === 'public' ? 'public' : 'private',
        backendArchived: d.archived,
        backendProgressStatus: d.progressStatus,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        cover: d.coverKind === 'image' ? 'image' : 'gradient',
        image: d.coverImageData ?? undefined
      })
      setIsProjectArchived(d.archived)
    })()
    return () => {
      cancel = true
    }
  }, [project.id])

  const reloadProjectTasksFromServer = useCallback(async () => {
    const result = await loadProjectTasksTree(project.id, targetTypeLabel, taskStageOptionTitles)
    if (!result.ok) {
      setTargetList([])
      setTaskManageList([])
      return
    }
    setTargetList(result.targets)
    setTaskManageList(result.taskManageList)
  }, [project.id, targetTypeLabel, taskStageOptionTitles])

  useEffect(() => {
    setIsTargetHydrated(false)
    setIsTaskManageHydrated(false)
    void (async () => {
      await reloadProjectTasksFromServer()
      setIsTargetHydrated(true)
      setIsTaskManageHydrated(true)
    })()
  }, [reloadProjectTasksFromServer])

  return {
    targetList,
    setTargetList,
    taskManageList,
    setTaskManageList,
    isTargetHydrated,
    isTaskManageHydrated,
    isProjectArchived,
    setIsProjectArchived,
    projectServerAudit,
    setProjectServerAudit,
    reloadProjectTasksFromServer
  }
}

import { useEffect, useMemo, useState } from 'react'
import { filterActivityFeedItems } from '../shared/activityParticipantActivity'
import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'
import type { TargetRecord, TargetSideTab } from '../targets/targetTypes'
import type { TaskManageRecord } from '../tasks/taskTypes'
import type { WorkspaceActivityRecord } from './useProjectDetailWorkspace'

const TARGET_SIDE_PANEL_PAGE_SIZE = 10

export type UseTargetSidePanelParams = {
  editingTask: TaskManageRecord | null
  editingTarget: TargetRecord | null
  targetActivityByKey: Record<string, WorkspaceActivityRecord[]>
  targetCommentsByKey: Record<string, TargetCommentRecord[]>
  targetSideTab: TargetSideTab
}

export function useTargetSidePanel({ editingTask, editingTarget, targetActivityByKey, targetCommentsByKey, targetSideTab }: UseTargetSidePanelParams) {
  const [targetSidePanelVisibleCount, setTargetSidePanelVisibleCount] = useState(TARGET_SIDE_PANEL_PAGE_SIZE)

  const currentSideKey = editingTask?.key ?? editingTarget?.key ?? ''

  const activityFeedForSide = useMemo(() => filterActivityFeedItems(targetActivityByKey[currentSideKey] ?? []), [currentSideKey, targetActivityByKey])

  const statusFlowForSide = useMemo(() => activityFeedForSide.filter(item => item.fieldLabel === '状态'), [activityFeedForSide])

  useEffect(() => {
    setTargetSidePanelVisibleCount(TARGET_SIDE_PANEL_PAGE_SIZE)
  }, [currentSideKey, targetSideTab])

  const visibleCommentsForSide = useMemo(() => (targetCommentsByKey[currentSideKey] ?? []).slice(0, targetSidePanelVisibleCount), [currentSideKey, targetCommentsByKey, targetSidePanelVisibleCount])
  const totalCommentsForSide = (targetCommentsByKey[currentSideKey] ?? []).length
  const hasMoreCommentsForSide = totalCommentsForSide > targetSidePanelVisibleCount

  const visibleActivityFeedForSide = useMemo(() => activityFeedForSide.slice(0, targetSidePanelVisibleCount), [activityFeedForSide, targetSidePanelVisibleCount])
  const hasMoreActivityFeedForSide = activityFeedForSide.length > targetSidePanelVisibleCount

  const visibleStatusFlowForSide = useMemo(() => statusFlowForSide.slice(0, targetSidePanelVisibleCount), [statusFlowForSide, targetSidePanelVisibleCount])
  const hasMoreStatusFlowForSide = statusFlowForSide.length > targetSidePanelVisibleCount

  return {
    currentSideKey,
    activityFeedForSide,
    statusFlowForSide,
    targetSidePanelVisibleCount,
    setTargetSidePanelVisibleCount,
    visibleCommentsForSide,
    totalCommentsForSide,
    hasMoreCommentsForSide,
    visibleActivityFeedForSide,
    hasMoreActivityFeedForSide,
    visibleStatusFlowForSide,
    hasMoreStatusFlowForSide
  }
}

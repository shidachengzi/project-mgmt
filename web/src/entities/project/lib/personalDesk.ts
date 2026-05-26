import type { ProjectSummary } from '../model/types'

/** 与真实项目隔离的本地 ID（历史本地存储）；后端个人任务使用 `backendPersonalDeskProjectId` */
export const PERSONAL_DESK_PROJECT_ID = '__personal_desk__'

/** 后端每人一个私有容器项目 id，与 `backend/src/modules/me/personalDeskProject.ts` 一致 */
export function backendPersonalDeskProjectId(userId: string) {
  return `pd-${userId}`
}

export function isBackendPersonalDeskProjectId(projectId: string) {
  return projectId.startsWith('pd-')
}

export function personalDeskSummaryForBackendUser(userId: string): ProjectSummary {
  return {
    id: backendPersonalDeskProjectId(userId),
    title: '个人工作台',
    cover: 'gradient',
    templateId: 'project-management',
    isPreset: false,
  }
}

export const personalDeskProjectSummary: ProjectSummary = {
  id: PERSONAL_DESK_PROJECT_ID,
  title: '个人工作台',
  cover: 'gradient',
  templateId: 'project-management',
  isPreset: false,
}

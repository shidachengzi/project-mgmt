import { STORAGE_KEYS } from '../../../shared/constants/storageKeys'

export const PROJECT_LIST_STORAGE_KEY = STORAGE_KEYS.projectList

export const getProjectScopedStorageKeys = (projectId: string): string[] => [
  `pm-target-rows-${projectId}`,
  `pm-task-manage-rows-${projectId}`,
  `pm-target-related-tasks-${projectId}`,
  `pm-target-attachments-${projectId}`,
  `pm-task-recent-${projectId}`,
  `pm-project-members-v2-${projectId}`,
  `pm-project-members-${projectId}`,
  `pm-project-member-roles-${projectId}`,
  `pm-task-participants-${projectId}`,
  `pm-task-attachments-${projectId}`,
  `pm-project-overview-${projectId}`,
  `pm-project-attachments-${projectId}`,
  `pm-project-overview-activities-${projectId}`,
  `pm-target-activity-${projectId}`,
  `pm-target-comments-${projectId}`,
]

export const clearProjectScopedStorage = (projectId: string) => {
  const keys = getProjectScopedStorageKeys(projectId)
  keys.forEach(key => {
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignore localStorage cleanup failures.
    }
  })
}

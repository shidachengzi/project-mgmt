import { useAuthStore } from '../auth/model/useAuthStore'
import { useBackendDataStore } from '../workspace/model/backendDataStore'

export function getProjectMemberRoleMap(projectId: string): Record<string, string> {
  const m = useBackendDataStore.getState().memberRoleMapByProject[projectId]
  return m ? { ...m } : {}
}

export function setProjectMemberRoleMap(projectId: string, map: Record<string, string>) {
  useBackendDataStore.setState(s => ({
    memberRoleMapByProject: { ...s.memberRoleMapByProject, [projectId]: { ...map } },
  }))
}

export function getCurrentUserProjectRoleKey(projectId: string): string | null {
  const userId = useAuthStore.getState().authedUserId
  if (!userId) return null
  const keys = useBackendDataStore.getState().myProjectRoleKeys[projectId] ?? []
  if (keys.includes('admin')) return 'admin'
  return keys[0] ?? null
}

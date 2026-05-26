import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectSummary } from './types'
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys'

type ProjectScopedState = {
  overviewByProjectId: Record<string, unknown>
  targetsByProjectId: Record<string, unknown[]>
  tasksByProjectId: Record<string, unknown[]>
  membersByProjectId: Record<string, unknown[]>
}

type ProjectState = {
  projectList: ProjectSummary[]
  scoped: ProjectScopedState
  setProjectList: (next: ProjectSummary[]) => void
  patchScoped: (projectId: string, patch: Partial<ProjectScopedState>) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    set => ({
      projectList: [] as ProjectSummary[],
      scoped: {
        overviewByProjectId: {},
        targetsByProjectId: {},
        tasksByProjectId: {},
        membersByProjectId: {}
      },
      setProjectList: next => set({ projectList: next }),
      patchScoped: (projectId, patch) =>
        set(state => ({
          scoped: {
            ...state.scoped,
            ...Object.fromEntries(
              Object.entries(patch).map(([k, v]) => [k, { ...(state.scoped as any)[k], [projectId]: v }])
            )
          } as ProjectScopedState
        }))
    }),
    {
      name: STORAGE_KEYS.projectList,
      partialize: s => ({ projectList: s.projectList, scoped: s.scoped }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<ProjectState>) })
    }
  )
)


import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OrgDepartmentNode, OrgMember, OrgRole } from './types'
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys'

type OrgState = {
  members: OrgMember[]
  departments: OrgDepartmentNode[]
  rolesPayload: {
    roles?: OrgRole[]
    groups?: string[]
    membersByRole?: Record<string, string[]>
    permissionsByRole?: Record<string, string[]>
    dataScopeByRole?: Record<string, string>
  }
  setMembers: (next: OrgMember[]) => void
  setDepartments: (next: OrgDepartmentNode[]) => void
  setRolesPayload: (next: OrgState['rolesPayload']) => void
}

export const useOrgStore = create<OrgState>()(
  persist(
    set => ({
      members: [],
      departments: [],
      rolesPayload: {},
      setMembers: next => set({ members: next }),
      setDepartments: next => set({ departments: next }),
      setRolesPayload: next => set({ rolesPayload: next })
    }),
    {
      name: STORAGE_KEYS.orgMembers,
      partialize: s => ({ members: s.members, departments: s.departments, rolesPayload: s.rolesPayload }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<OrgState>) })
    }
  )
)

export function ensureDepartmentsContainMembers(members: OrgMember[], departments: OrgDepartmentNode[]): OrgDepartmentNode[] {
  const memberById = new Map(members.map(m => [m.id, m]))
  const deptNameToMemberIds = new Map<string, string[]>()
  members.forEach(m => {
    const name = m.department || '未分配部门'
    deptNameToMemberIds.set(name, [...(deptNameToMemberIds.get(name) ?? []), m.id])
  })
  const walk = (nodes: OrgDepartmentNode[]): OrgDepartmentNode[] =>
    nodes.map(n => {
      const children = n.children ? walk(n.children) : undefined
      const memberIds = n.memberIds ? n.memberIds.filter(id => memberById.has(id)) : undefined
      const byName = deptNameToMemberIds.get(n.name)
      const merged = byName ? Array.from(new Set([...(memberIds ?? []), ...byName])) : memberIds
      return { ...n, children, memberIds: merged }
    })
  return walk(departments)
}


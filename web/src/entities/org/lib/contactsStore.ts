import { ensureDepartmentsContainMembers as normalizeDeptMembers, useOrgStore } from '../model/useOrgStore'
import type { OrgDepartmentNode, OrgMember } from '../model/types'

export type { OrgDepartmentNode, OrgMember }

export function loadOrgMembers(): OrgMember[] {
  return useOrgStore.getState().members
}

export function saveOrgMembers(next: OrgMember[]) {
  useOrgStore.getState().setMembers(next)
}

export function loadOrgDepartments(): OrgDepartmentNode[] {
  return useOrgStore.getState().departments
}

export function saveOrgDepartments(next: OrgDepartmentNode[]) {
  useOrgStore.getState().setDepartments(next)
}

export function ensureDepartmentsContainMembers(members: OrgMember[], departments: OrgDepartmentNode[]): OrgDepartmentNode[] {
  return normalizeDeptMembers(members, departments)
}

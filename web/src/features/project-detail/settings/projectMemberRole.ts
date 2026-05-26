export type ProjectMemberRecord = {
  key: string
  name: string
  role: string
  dept: string
  action: string
}

export type ProjectMemberRoleDraft = '管理员' | '只读成员' | '普通成员'

export const projectRoleLabelToKey = (role: ProjectMemberRecord['role']): 'admin' | 'observer' | 'normal' => {
  if (role === '管理员') return 'admin'
  if (role === '只读成员') return 'observer'
  return 'normal'
}

export const projectRoleKeyToLabel = (roleKey?: string): ProjectMemberRecord['role'] => {
  if (roleKey === 'admin' || roleKey === 'owner') return '管理员'
  if (roleKey === 'observer') return '只读成员'
  return '普通成员'
}

export function mapBackendMemberRows(
  rows: Array<{
    userId: string
    name: string
    email: string | null
    mobile: string | null
    departmentName?: string | null
    roleKey: string | null
  }>
): ProjectMemberRecord[] {
  return rows.map(r => ({
    key: r.userId,
    name: r.name,
    role: projectRoleKeyToLabel(r.roleKey || 'normal'),
    dept: (r.departmentName ?? '').trim() || '未分配部门',
    action: '设定 移除'
  }))
}

export type OrgMember = {
  id: string
  name: string
  role?: string
  code?: string
  phone?: string
  email?: string
  /** 后端部门 id，本地模式可不填 */
  departmentId?: string | null
  /** 登录用户名（后端账号） */
  username?: string | null
  department: string
  title?: string
  letter: string
  avatarText?: string
  avatarColor?: string
  disabled?: boolean
  label?: string
  /** 后端系统角色：owner | admin | member */
  systemRoleKey?: string
}

export type OrgDepartmentNode = {
  id: string
  name: string
  children?: OrgDepartmentNode[]
  memberIds?: string[]
}

export type OrgRole = {
  key: string
  name: string
  note: string
  isDefault: boolean
  group: string
}


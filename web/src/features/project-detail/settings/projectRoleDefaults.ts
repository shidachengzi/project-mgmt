export type ProjectRoleItem = {
  key: string
  name: string
  note: string
  isDefault: boolean
}

/** 内置角色不可删除 */
export const BUILTIN_PROJECT_ROLE_KEYS = new Set(['admin', 'normal', 'observer'])

export const isCustomProjectRoleKey = (key: string) => !BUILTIN_PROJECT_ROLE_KEYS.has(key)

export const resolveDefaultMemberRoleKey = (
  roles: Array<{ key: string; isDefault: boolean }> | undefined
): 'admin' | 'normal' | 'observer' => {
  const key = roles?.find(r => r.isDefault)?.key ?? 'normal'
  if (key === 'admin' || key === 'observer') return key
  return 'normal'
}

export const DEFAULT_PROJECT_ROLES: ProjectRoleItem[] = [
  { key: 'observer', name: '只读成员', note: '只读成员', isDefault: false },
  { key: 'normal', name: '普通成员', note: '普通成员', isDefault: true },
  { key: 'admin', name: '管理员', note: '管理员', isDefault: false }
]

export const DEFAULT_PROJECT_ROLE_PERMISSIONS: Record<string, string[]> = {
  normal: ['目标管理::新建目标', '目标管理::编辑目标']
}

import { NextRequest } from 'next/server'
import { ACCESS_COOKIE_KEY } from './cookies'
import { verifyAccessToken } from './auth'
import { fail } from './http'
import { hasProjectPermission, hasSystemPermission } from './rbac'

export type AuthContext = {
  userId: string
}

export const requireAuth = (req: NextRequest): AuthContext | Response => {
  const token = req.cookies.get(ACCESS_COOKIE_KEY)?.value
  if (!token) return fail(401, '未登录')

  try {
    const payload = verifyAccessToken(token)
    return { userId: payload.sub }
  } catch {
    return fail(401, '登录已过期')
  }
}

export const requireSystemPermission = async (ctx: AuthContext, permissionKey: string): Promise<true | Response> => {
  const ok = await hasSystemPermission(ctx.userId, permissionKey)
  if (!ok) return fail(403, '无系统权限', { permissionKey })
  return true
}

/** 成员列表 / 部门树只读：成员管理员或角色管理员均可（便于在角色管理中选人） */
export const requireMemberManageOrRoleManage = async (ctx: AuthContext): Promise<true | Response> => {
  if (await hasSystemPermission(ctx.userId, 'member.manage')) return true
  if (await hasSystemPermission(ctx.userId, 'role.manage')) return true
  return fail(403, '无系统权限', { permissionKey: 'member.manage | role.manage' })
}

export const requireProjectPermission = async (ctx: AuthContext, projectId: string, permissionKey: string): Promise<true | Response> => {
  const ok = await hasProjectPermission(projectId, ctx.userId, permissionKey)
  if (!ok) return fail(403, '无项目权限', { permissionKey, projectId })
  return true
}


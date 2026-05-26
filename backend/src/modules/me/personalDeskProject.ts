import { prisma } from '@/lib/prisma'
import { ensureProjectRbacSeeds } from '@/lib/projectRbacBootstrap'
import { PROJECT_PERMISSION_SECTIONS, buildProjectPermissionKey } from '@/lib/permissionMap'
import { assignProjectMemberRole } from '@/modules/project-rbac/service'
import { createProjectForUser } from '@/modules/projects/projectCatalog'
import { parseWorkspace } from '@/modules/projects/projectWorkspaceService'

/** 个人工作台协作者（普通成员）：可查看/编辑任务与目标及工作区相关能力，不含成员/角色/删项目等管理项 */
function personalDeskCollaboratorPermissionKeys(): string[] {
  const keys: string[] = []
  for (const section of PROJECT_PERMISSION_SECTIONS) {
    if (section.title === '目标管理' || section.title === '任务管理') {
      for (const item of section.items) {
        keys.push(buildProjectPermissionKey(section.title, item))
      }
    }
  }
  for (const item of ['基本设置', '修改项目状态', '管理项目附件'] as const) {
    keys.push(buildProjectPermissionKey('项目权限', item))
  }
  return keys
}

/**
 * 为个人工作台项目的「普通成员」角色挂载协作权限（幂等）。
 * 受邀负责人/参与人使用 normal 角色，依赖此处权限方可编辑任务与目标。
 */
export async function ensurePersonalDeskCollaboratorRolePermissions(projectId: string) {
  if (!isPersonalDeskProjectId(projectId)) return
  await ensureProjectRbacSeeds(projectId)
  const normalRole = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId, key: 'normal' } }
  })
  if (!normalRole) return

  const keys = personalDeskCollaboratorPermissionKeys()
  const permissions = await prisma.projectPermission.findMany({
    where: { projectId, key: { in: keys } },
    select: { id: true }
  })
  if (permissions.length === 0) return

  const permIds = permissions.map(p => p.id)
  const existing = await prisma.projectRolePermission.findMany({
    where: { roleId: normalRole.id, permissionId: { in: permIds } },
    select: { permissionId: true }
  })
  const have = new Set(existing.map(e => e.permissionId))
  const missing = permissions.filter(p => !have.has(p.id))
  if (missing.length === 0) return

  await prisma.projectRolePermission.createMany({
    data: missing.map(p => ({ roleId: normalRole.id, permissionId: p.id }))
  })
}

/** 与前端 `backendPersonalDeskProjectId` 一致：每人一个私有「个人工作台」项目，用于未归属业务项目的任务/目标 */
export function personalDeskProjectId(userId: string) {
  const id = `pd-${userId}`
  if (id.length > 36) {
    throw new Error('personal desk project id exceeds 36 chars')
  }
  return id
}

const DESK_STAGE_TITLES = ['执行阶段', '验收阶段', '结项阶段', '启动阶段']

async function seedDeskStagesIfEmpty(projectId: string) {
  const n = await prisma.projectTask.count({ where: { projectId } })
  if (n > 0) return
  for (let i = 0; i < DESK_STAGE_TITLES.length; i++) {
    await prisma.projectTask.create({
      data: {
        projectId,
        parentId: null,
        sortOrder: i,
        kind: 'stage',
        title: DESK_STAGE_TITLES[i],
        status: '未开始',
        priority: '普通'
      }
    })
  }
}

/** 确保当前用户拥有个人工作台项目（私有 + 管理员角色 + 默认阶段） */
export async function ensurePersonalDeskProject(userId: string) {
  const id = personalDeskProjectId(userId)
  let project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    try {
      const created = await createProjectForUser({
        id,
        title: '个人工作台',
        visibility: 'private',
        creatorId: userId
      })
      if ('error' in created) {
        throw new Error(created.error)
      }
    } catch {
      // 并发创建时可能已存在
    }
    project = await prisma.project.findUnique({ where: { id } })
    if (!project) throw new Error('personal desk create failed')
  }
  await seedDeskStagesIfEmpty(id)
  await ensurePersonalDeskCollaboratorRolePermissions(id)
  return project
}

export function isPersonalDeskProjectId(projectId: string) {
  return projectId.startsWith('pd-')
}

/**
 * 个人工作台：把任务参与人（姓名）解析为系统用户并加入项目「普通成员」，便于对方查看与编辑任务。
 */
export async function invitePersonalDeskParticipantsFromWorkspace(projectId: string) {
  if (!isPersonalDeskProjectId(projectId)) return
  const ownerUserId = projectId.slice(3)
  if (!ownerUserId) return

  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace: true }
  })
  if (!row) return

  const ws = parseWorkspace(row.workspace)
  const names = new Set<string>()
  for (const arr of Object.values(ws.taskParticipantsByKey)) {
    for (const n of arr) {
      const t = typeof n === 'string' ? n.trim() : ''
      if (t) names.add(t)
    }
  }

  for (const displayName of names) {
    const user = await prisma.user.findFirst({
      where: { status: 'active', name: displayName }
    })
    if (!user || user.id === ownerUserId) continue
    const assigned = await assignProjectMemberRole(projectId, user.id, 'normal')
    if ('error' in assigned) {
      // 角色种子异常时跳过，避免阻断工作区保存
      continue
    }
  }
  await ensurePersonalDeskCollaboratorRolePermissions(projectId)
}

/**
 * 个人工作台：把任务/子任务/目标的负责人（非桌面所有者）加入项目「普通成员」。
 * 仅改负责人、未触发工作区参与人同步时也需要调用，否则对方对私有项目无成员会 403。
 */
export async function invitePersonalDeskTaskOwnersFromDb(projectId: string) {
  if (!isPersonalDeskProjectId(projectId)) return
  const deskOwnerId = projectId.slice(3)
  if (!deskOwnerId) return

  const rows = await prisma.projectTask.findMany({
    where: {
      projectId,
      kind: { in: ['target', 'task', 'subtask'] },
      ownerUserId: { not: null }
    },
    select: { ownerUserId: true }
  })
  const seen = new Set<string>()
  for (const r of rows) {
    const uid = r.ownerUserId
    if (!uid || uid === deskOwnerId || seen.has(uid)) continue
    seen.add(uid)
    const assigned = await assignProjectMemberRole(projectId, uid, 'normal')
    if ('error' in assigned) continue
  }
  await ensurePersonalDeskCollaboratorRolePermissions(projectId)
}

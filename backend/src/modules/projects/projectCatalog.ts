import { prisma } from '@/lib/prisma'
import { ensureProjectRbacSeeds } from '@/lib/projectRbacBootstrap'
import { isPersonalDeskProjectId } from '@/modules/me/personalDeskProject'
import { parseWorkspace } from './projectWorkspaceService'

const PROGRESS_STATUSES = ['未开始', '进行中', '验收中', '已完成', '关闭'] as const
export type ProjectProgressStatusZh = (typeof PROGRESS_STATUSES)[number]

/** 列表/详情展示用：与工作区 overview.progressStatus 一致；未设置时视为「进行中」（与列表默认筛选项一致） */
export const progressStatusFromWorkspace = (workspace: unknown): ProjectProgressStatusZh => {
  const o = parseWorkspace(workspace).overview
  const ps = o.progressStatus
  if (typeof ps === 'string' && (PROGRESS_STATUSES as readonly string[]).includes(ps)) {
    return ps as ProjectProgressStatusZh
  }
  return '进行中'
}

const HEALTH_STATUSES = ['正常', '有风险', '失控'] as const

/** 项目列表/工作台用：从已加载的 workspace JSON 提取概览摘要，避免 N 次单独拉 workspace */
export const overviewLiteFromWorkspace = (workspace: unknown) => {
  const o = parseWorkspace(workspace).overview
  const hs = o.healthStatus
  const healthStatus =
    typeof hs === 'string' && (HEALTH_STATUSES as readonly string[]).includes(hs.trim())
      ? hs.trim()
      : '正常'
  return {
    owner: typeof o.owner === 'string' ? o.owner.trim() : '',
    startDate: typeof o.startDate === 'string' ? o.startDate.trim() : '',
    endDate: typeof o.endDate === 'string' ? o.endDate.trim() : '',
    progressStatus: progressStatusFromWorkspace(workspace),
    healthStatus,
  }
}

/** 可见项目列表（不含 `pd-*` 个人工作台容器，避免出现在「全部项目」） */
export const listProjectsVisibleToUser = async (userId: string) => {
  const rows = await prisma.project.findMany({
    where: {
      OR: [{ visibility: 'public' }, { members: { some: { userId } } }],
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.filter(p => !isPersonalDeskProjectId(p.id))
}

export const createProjectForUser = async (input: {
  id: string
  title: string
  visibility: 'public' | 'private'
  creatorId: string
}) => {
  await prisma.project.create({
    data: {
      id: input.id,
      title: input.title,
      visibility: input.visibility,
      ownerUserId: input.creatorId,
    },
  })
  await ensureProjectRbacSeeds(input.id)
  const adminRole = await prisma.projectRole.findUnique({
    where: { projectId_key: { projectId: input.id, key: 'admin' } },
  })
  if (!adminRole) return { error: 'NO_ADMIN_ROLE' as const }
  const member = await prisma.projectMember.create({
    data: { projectId: input.id, userId: input.creatorId },
  })
  await prisma.projectMemberRole.create({
    data: { memberId: member.id, roleId: adminRole.id },
  })
  return { id: input.id }
}

export const listProjectMembers = async (projectId: string, viewerUserId: string) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return { error: 'NOT_FOUND' as const }

  if (project.visibility !== 'public') {
    const viewerMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: viewerUserId } },
    })
    if (!viewerMember) return { error: 'FORBIDDEN' as const }
  }

  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          department: { select: { name: true } },
        },
      },
      roles: { include: { role: true } },
    },
    orderBy: { joinedAt: 'asc' },
  })

  return {
    members: rows.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      mobile: m.user.mobile,
      departmentName: m.user.department?.name?.trim() || null,
      roleKey: m.roles[0]?.role.key ?? null,
    })),
  }
}

export const searchUsers = async (q: string | undefined, take = 80) => {
  const term = (q ?? '').trim()
  const select = {
    id: true,
    name: true,
    email: true,
    mobile: true,
    username: true,
    employeeCode: true,
    jobTitle: true,
    department: { select: { id: true, name: true } },
  } as const
  if (!term) {
    return prisma.user.findMany({
      where: { status: 'active' },
      select,
      take,
      orderBy: { name: 'asc' },
    })
  }
  return prisma.user.findMany({
    where: {
      status: 'active',
      OR: [
        { name: { contains: term } },
        { email: { contains: term } },
        { mobile: { contains: term } },
        { username: { contains: term } },
        { employeeCode: { contains: term } },
      ],
    },
    select,
    take,
    orderBy: { name: 'asc' },
  })
}

export type ProjectDetailDTO = {
  id: string
  title: string
  visibility: string
  ownerUserId: string | null
  ownerName: string | null
  archived: boolean
  progressStatus: ProjectProgressStatusZh
  coverKind: 'gradient' | 'image'
  coverImageData: string | null
  createdAt: string
  updatedAt: string
}

export const getProjectDetailForViewer = async (projectId: string, viewerUserId: string) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return { error: 'NOT_FOUND' as const }

  if (project.visibility !== 'public') {
    const viewerMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: viewerUserId } },
    })
    if (!viewerMember) return { error: 'FORBIDDEN' as const }
  }

  const owner =
    project.ownerUserId == null
      ? null
      : await prisma.user.findUnique({
          where: { id: project.ownerUserId },
          select: { id: true, name: true },
        })

  const ck = project.coverKind === 'image' ? 'image' : 'gradient'
  const detail: ProjectDetailDTO = {
    id: project.id,
    title: project.title,
    visibility: project.visibility,
    ownerUserId: project.ownerUserId,
    ownerName: owner?.name ?? null,
    archived: project.archived,
    progressStatus: progressStatusFromWorkspace(project.workspace),
    coverKind: ck,
    coverImageData: ck === 'image' ? project.coverImageData ?? null : null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
  return { detail }
}

/** 是否为该项目成员（含只读角色）；公开项目下「仅浏览」的非成员为 false */
export const isUserProjectMember = async (projectId: string, userId: string) => {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  })
  return Boolean(member)
}

export const updateProjectFields = async (
  projectId: string,
  patch: {
    title?: string
    visibility?: 'public' | 'private'
    ownerUserId?: string | null
    coverKind?: 'gradient' | 'image'
    coverImageData?: string | null
    archived?: boolean
  },
) => {
  const existing = await prisma.project.findUnique({ where: { id: projectId } })
  if (!existing) return { error: 'NOT_FOUND' as const }

  const data: {
    title?: string
    visibility?: string
    ownerUserId?: string | null
    coverKind?: string
    coverImageData?: string | null
    archived?: boolean
  } = {}

  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) return { error: 'EMPTY_TITLE' as const }
    data.title = t.slice(0, 191)
  }
  if (patch.visibility !== undefined) {
    data.visibility = patch.visibility
  }
  if (patch.ownerUserId !== undefined) {
    if (patch.ownerUserId) {
      const u = await prisma.user.findUnique({ where: { id: patch.ownerUserId } })
      if (!u) return { error: 'OWNER_NOT_FOUND' as const }
    }
    data.ownerUserId = patch.ownerUserId
  }
  if (patch.coverKind !== undefined) {
    data.coverKind = patch.coverKind
    if (patch.coverKind === 'gradient') {
      data.coverImageData = null
    }
  }
  if (patch.coverImageData !== undefined) {
    data.coverImageData = patch.coverImageData
    if (patch.coverImageData) {
      data.coverKind = 'image'
    }
  }
  if (patch.archived !== undefined) {
    data.archived = patch.archived
  }

  if (Object.keys(data).length === 0) {
    return { ok: true as const }
  }

  await prisma.project.update({
    where: { id: projectId },
    data,
  })
  return { ok: true as const }
}

export const deleteProjectById = async (projectId: string) => {
  const existing = await prisma.project.findUnique({ where: { id: projectId } })
  if (!existing) return { error: 'NOT_FOUND' as const }
  await prisma.project.delete({ where: { id: projectId } })
  return { ok: true as const }
}

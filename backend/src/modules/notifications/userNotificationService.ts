import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const IN_APP_NOTIFICATION_SYSTEM_TYPES = ['maintenance', 'security', 'announcement'] as const
/** 项目类通知 type（不含任务/目标状态变更） */
export const IN_APP_NOTIFICATION_PROJECT_TYPES = [
  'calendar_event',
  'calendar_event_reminder',
  'project_member_added',
  'task_owner_assigned',
  'target_owner_assigned',
  'task_participant_added',
  'target_participant_added',
  'project_start_reminder',
  'project_end_reminder',
  'task_start_reminder',
  'task_end_reminder',
  'target_start_reminder',
  'target_end_reminder',
  'project_overview_custom_reminder'
] as const

/** 截止/开始提醒（用于去重查询） */
export const DEADLINE_REMINDER_NOTIFICATION_TYPES = ['project_start_reminder', 'project_end_reminder', 'task_start_reminder', 'task_end_reminder', 'target_start_reminder', 'target_end_reminder', 'project_overview_custom_reminder', 'calendar_event_reminder'] as const

export type InAppSystemNotificationType = (typeof IN_APP_NOTIFICATION_SYSTEM_TYPES)[number]
export type InAppProjectNotificationType = (typeof IN_APP_NOTIFICATION_PROJECT_TYPES)[number]

export type InAppNotificationCategory = 'system' | 'project'

export type InAppNotificationDTO = {
  id: string
  category: InAppNotificationCategory
  type: string
  title: string
  body: string | null
  read: boolean
  projectId: string | null
  taskId: string | null
  eventId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

function toDto(row: { id: string; category: string; type: string; title: string; body: string | null; readAt: Date | null; projectId: string | null; taskId: string | null; eventId: string | null; metadata: unknown; createdAt: Date }): InAppNotificationDTO {
  const meta = row.metadata != null && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : null
  return {
    id: row.id,
    category: row.category === 'project' ? 'project' : 'system',
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.readAt != null,
    projectId: row.projectId,
    taskId: row.taskId,
    eventId: row.eventId,
    metadata: meta,
    createdAt: row.createdAt.toISOString()
  }
}

async function projectTitle(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { title: true } })
  return p?.title?.trim() || '项目'
}

/** projects.owner_user_id 等字段可无 FK，孤儿 userId 会导致整批 createMany 外键失败，合法用户也收不到站内信 */
async function existingUserIdSet(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const out = new Set<string>()
  const batch = 800
  for (let i = 0; i < unique.length; i += batch) {
    const slice = unique.slice(i, i + batch)
    const found = await prisma.user.findMany({
      where: { id: { in: slice } },
      select: { id: true }
    })
    for (const r of found) out.add(r.id)
  }
  return out
}

export async function insertNotifications(
  rows: Array<{
    userId: string
    category: 'system' | 'project'
    type: string
    title: string
    body: string | null
    projectId?: string | null
    taskId?: string | null
    eventId?: string | null
    metadata?: Prisma.InputJsonValue
  }>
) {
  if (!rows.length) return
  const allowed = await existingUserIdSet(rows.map(r => r.userId))
  const sanitized = rows.filter(r => allowed.has(r.userId))
  if (!sanitized.length) return
  if (sanitized.length < rows.length) {
    console.warn('[insertNotifications] skipped rows (userId not in users)', rows.length - sanitized.length)
  }
  const chunk = 200
  for (let i = 0; i < sanitized.length; i += chunk) {
    await prisma.userNotification.createMany({
      data: sanitized.slice(i, i + chunk).map(r => ({
        userId: r.userId,
        category: r.category,
        type: r.type,
        title: r.title.slice(0, 191),
        body: r.body,
        projectId: r.projectId ?? null,
        taskId: r.taskId ?? null,
        eventId: r.eventId ?? null,
        metadata: r.metadata
      }))
    })
  }
}

/** 将参与人展示名解析为项目成员 userId；重名则跳过 */
export async function resolveMemberIdsByNames(projectId: string, names: string[]): Promise<string[]> {
  const trimmed = [...new Set(names.map(n => n.trim()).filter(Boolean))]
  if (!trimmed.length) return []
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true } } }
  })
  const byNorm = new Map<string, string[]>()
  for (const m of members) {
    const k = m.user.name.trim()
    if (!byNorm.has(k)) byNorm.set(k, [])
    byNorm.get(k)!.push(m.userId)
  }
  const out: string[] = []
  for (const n of trimmed) {
    const ids = byNorm.get(n)
    if (ids?.length === 1) out.push(ids[0])
  }
  return out
}

export async function notifyUserJoinedProject(input: { projectId: string; userId: string; actorUserId: string }) {
  const pt = await projectTitle(input.projectId)
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } })
  const actorName = actor?.name?.trim() || '管理员'
  await insertNotifications([
    {
      userId: input.userId,
      category: 'project',
      type: 'project_member_added',
      title: '你已被加入项目',
      body: `已将你加入「${pt.slice(0, 120)}」。邀请人：${actorName}`,
      projectId: input.projectId,
      metadata: { actorUserId: input.actorUserId }
    }
  ])
}

export async function notifyTaskOrTargetOwnerAssigned(input: { projectId: string; taskId: string; taskTitle: string; kind: string; newOwnerUserId: string; actorUserId: string }) {
  if (!input.newOwnerUserId || input.newOwnerUserId === input.actorUserId) return
  const pt = await projectTitle(input.projectId)
  const isTarget = input.kind === 'target'
  const type = isTarget ? 'target_owner_assigned' : 'task_owner_assigned'
  const label = isTarget ? '目标' : '任务'
  await insertNotifications([
    {
      userId: input.newOwnerUserId,
      category: 'project',
      type,
      title: `你已被指派为${label}负责人`,
      body: `项目「${pt}」中的${label}「${input.taskTitle.slice(0, 120)}」已将你设为负责人。`,
      projectId: input.projectId,
      taskId: input.taskId,
      metadata: { actorUserId: input.actorUserId }
    }
  ])
}

export function parseTargetParticipantsFromDescription(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const o = JSON.parse(raw) as { v?: number; pmTarget?: boolean; participants?: unknown }
    if (o && o.v === 1 && o.pmTarget === true && Array.isArray(o.participants)) {
      return o.participants.filter((x): x is string => typeof x === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

export async function notifyTargetParticipantNamesDelta(input: { projectId: string; taskId: string; taskTitle: string; previousDescription: string | null; nextDescription: string | null; actorUserId: string }) {
  const prev = parseTargetParticipantsFromDescription(input.previousDescription)
  const next = parseTargetParticipantsFromDescription(input.nextDescription)
  const prevSet = new Set(prev.map(s => s.trim()))
  const addedNames = next.map(s => s.trim()).filter(s => s && !prevSet.has(s))
  if (!addedNames.length) return
  const userIds = await resolveMemberIdsByNames(input.projectId, addedNames)
  const pt = await projectTitle(input.projectId)
  const rows = userIds
    .filter(uid => uid !== input.actorUserId)
    .map(userId => ({
      userId,
      category: 'project' as const,
      type: 'target_participant_added',
      title: '你已被加入目标参与人',
      body: `项目「${pt}」的目标「${input.taskTitle.slice(0, 120)}」将你添加为参与人。`,
      projectId: input.projectId,
      taskId: input.taskId,
      metadata: { actorUserId: input.actorUserId }
    }))
  await insertNotifications(rows)
}

/** 工作区 taskParticipantsByKey：展示名列表，对比新增后按项目成员姓名解析并通知 */
export async function notifyWorkspaceTaskParticipantsDelta(input: { projectId: string; before: Record<string, string[]>; after: Record<string, string[]>; actorUserId: string }) {
  const keys = new Set([...Object.keys(input.before), ...Object.keys(input.after)])
  const tasks = await prisma.projectTask.findMany({
    where: { projectId: input.projectId, id: { in: [...keys] } },
    select: { id: true, title: true, kind: true }
  })
  const pt = await projectTitle(input.projectId)

  const rows: Parameters<typeof insertNotifications>[0] = []
  for (const key of keys) {
    const oldArr = input.before[key] ?? []
    const newArr = input.after[key] ?? []
    const oldSet = new Set(oldArr.map(s => s.trim()))
    const addedNames = newArr.map(s => s.trim()).filter(s => s && !oldSet.has(s))
    if (!addedNames.length) continue
    const taskRow = tasks.find(t => t.id === key)
    if (!taskRow) continue
    if (taskRow.kind === 'stage') continue
    const userIds = await resolveMemberIdsByNames(input.projectId, addedNames)
    const taskTitle = taskRow.title
    const isTarget = taskRow.kind === 'target'
    const type = isTarget ? 'target_participant_added' : 'task_participant_added'
    const label = isTarget ? '目标' : '任务'
    for (const userId of userIds) {
      if (userId === input.actorUserId) continue
      rows.push({
        userId,
        category: 'project',
        type,
        title: `你已被加入${label}参与人`,
        body: `项目「${pt}」的${label}「${taskTitle.slice(0, 120)}」将你添加为参与人。`,
        projectId: input.projectId,
        taskId: key,
        metadata: { actorUserId: input.actorUserId }
      })
    }
  }
  await insertNotifications(rows)
}

export async function notifyCalendarEventChange(input: { action: 'created' | 'updated'; actorUserId: string; eventId: string; calendarId: string; title: string; startAt: Date; participantIds: string[] }) {
  const ids = [...new Set([...input.participantIds, input.actorUserId])].filter(Boolean)
  if (!ids.length) return

  const title = input.action === 'created' ? `日程已创建：${input.title.slice(0, 100)}` : `日程已更新：${input.title.slice(0, 100)}`
  const startStr = input.startAt.toLocaleString('zh-CN', { hour12: false })
  const body = `时间：${startStr}`

  const metadata: Prisma.InputJsonValue = {
    action: input.action,
    actorUserId: input.actorUserId,
    calendarId: input.calendarId,
    startAt: input.startAt.toISOString()
  }

  const rows = ids.map(userId => ({
    userId,
    category: 'project' as const,
    type: 'calendar_event' as const,
    title: title.slice(0, 191),
    body,
    projectId: null as string | null,
    taskId: null as string | null,
    eventId: input.eventId,
    metadata
  }))

  const chunk = 200
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.userNotification.createMany({ data: rows.slice(i, i + chunk) })
  }
}

export async function broadcastSystemNotifications(input: { type: InAppSystemNotificationType; title: string; body: string; createdByUserId: string }) {
  const users = await prisma.user.findMany({
    where: { status: 'active' },
    select: { id: true }
  })
  const meta: Prisma.InputJsonValue = { createdByUserId: input.createdByUserId }
  const rows = users.map(u => ({
    userId: u.id,
    category: 'system' as const,
    type: input.type,
    title: input.title.trim().slice(0, 191),
    body: input.body.trim().slice(0, 20000),
    projectId: null as string | null,
    taskId: null as string | null,
    eventId: null as string | null,
    metadata: meta
  }))
  const chunk = 300
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.userNotification.createMany({ data: rows.slice(i, i + chunk) })
  }
  return { count: rows.length }
}

export async function listUserNotifications(input: { userId: string; category?: InAppNotificationCategory; type?: string; read?: 'all' | 'read' | 'unread'; page: number; pageSize: number }): Promise<{ items: InAppNotificationDTO[]; total: number }> {
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const where: Prisma.UserNotificationWhereInput = { userId: input.userId }
  if (input.category) where.category = input.category
  if (input.type) where.type = input.type
  if (input.read === 'read') where.readAt = { not: null }
  if (input.read === 'unread') where.readAt = null

  const [total, rows] = await prisma.$transaction([
    prisma.userNotification.count({ where }),
    prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  return { items: rows.map(toDto), total }
}

export async function unreadSummaryForUser(userId: string): Promise<{ system: number; project: number }> {
  const [system, project] = await prisma.$transaction([prisma.userNotification.count({ where: { userId, category: 'system', readAt: null } }), prisma.userNotification.count({ where: { userId, category: 'project', readAt: null } })])
  return { system, project }
}

export async function markNotificationRead(userId: string, id: string): Promise<{ ok: true } | { error: 'NOT_FOUND' }> {
  const res = await prisma.userNotification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() }
  })
  if (res.count === 0) return { error: 'NOT_FOUND' }
  return { ok: true }
}

export async function markAllNotificationsRead(input: { userId: string; category?: InAppNotificationCategory; type?: string }): Promise<{ updated: number }> {
  const where: Prisma.UserNotificationWhereInput = {
    userId: input.userId,
    readAt: null
  }
  if (input.category) where.category = input.category
  if (input.type) where.type = input.type

  const res = await prisma.userNotification.updateMany({
    where,
    data: { readAt: new Date() }
  })
  return { updated: res.count }
}

export async function deleteNotificationForUser(userId: string, id: string): Promise<{ ok: true } | { error: 'NOT_FOUND' }> {
  const res = await prisma.userNotification.deleteMany({
    where: { id, userId }
  })
  if (res.count === 0) return { error: 'NOT_FOUND' }
  return { ok: true }
}

export async function clearAllNotificationsForUser(input: { userId: string; category?: InAppNotificationCategory; type?: string }): Promise<{ deleted: number }> {
  const where: Prisma.UserNotificationWhereInput = { userId: input.userId }
  if (input.category) where.category = input.category
  if (input.type) where.type = input.type
  const res = await prisma.userNotification.deleteMany({ where })
  return { deleted: res.count }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 批量查询已存在的开始/截止提醒 dedupeKey（userId + dedupeKey 组合） */
export async function findExistingDeadlineReminderDedupes(pairs: { userId: string; dedupeKey: string }[]): Promise<Set<string>> {
  const types = [...DEADLINE_REMINDER_NOTIFICATION_TYPES]
  const out = new Set<string>()
  if (!pairs.length) return out
  /** 类型名来自本文件常量，仅拼进 IN 字面量；userId/dedupeKey 仍走参数化占位符 */
  const typeInListSql = `(${types.map((t) => `'${t.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`).join(',')})`

  for (const batch of chunkArray(pairs, 30)) {
    let orPart: Prisma.Sql | null = null
    for (const p of batch) {
      const cond = Prisma.sql`(\`userId\` = ${p.userId} AND JSON_UNQUOTE(JSON_EXTRACT(\`metadata\`, '$.dedupeKey')) = ${p.dedupeKey})`
      orPart = orPart === null ? cond : Prisma.sql`${orPart} OR ${cond}`
    }
    if (!orPart) continue

    const rows = await prisma.$queryRaw<Array<{ userId: string; dk: string | null }>>(
      Prisma.sql`
        SELECT \`userId\`, JSON_UNQUOTE(JSON_EXTRACT(\`metadata\`, '$.dedupeKey')) AS dk
        FROM \`user_notifications\`
        WHERE \`category\` = 'project'
          AND \`type\` IN ${Prisma.raw(typeInListSql)}
          AND (${orPart})
      `,
    )
    for (const r of rows) {
      if (typeof r.dk === 'string' && r.dk.length) out.add(`${r.userId}|${r.dk}`)
    }
  }
  return out
}

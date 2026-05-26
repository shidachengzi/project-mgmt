import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { parseDateInput } from '@/modules/projects/projectTaskService'
import { parseWorkspace } from '@/modules/projects/projectWorkspaceService'
import {
  findExistingDeadlineReminderDedupes,
  insertNotifications,
  parseTargetParticipantsFromDescription,
  resolveMemberIdsByNames,
} from '@/modules/notifications/userNotificationService'

const SHANGHAI_TZ = 'Asia/Shanghai'

function scanIntervalMs(): number {
  const n = Number(process.env.DEADLINE_REMINDER_INTERVAL_MS)
  if (Number.isFinite(n) && n >= 15_000 && n <= 3_600_000) return Math.floor(n)
  return 60_000
}

function leadMinutes(): number {
  const n = Number(process.env.DEADLINE_REMINDER_LEAD_MINUTES)
  if (Number.isFinite(n) && n >= 1 && n <= 7 * 24 * 60) return Math.floor(n)
  return 10
}

/** 当前时刻是否处于「里程碑前 lead 分钟内、且尚未到点」 */
function inReminderWindow(now: Date, eventAt: Date, leadMs: number): boolean {
  const t = now.getTime()
  const e = eventAt.getTime()
  return t >= e - leadMs && t < e
}

/** 自定义概览提醒：计划提醒点前后宽窗口，避免 60s 扫描错过原先仅 120s 的「火后」窄窗导致用户收不到通知 */
function inCustomFireWindow(now: Date, fireAt: Date): boolean {
  const t = now.getTime()
  const f = fireAt.getTime()
  const interval = scanIntervalMs()
  const beforeSlack = Math.min(180_000, interval * 2 + 30_000)
  const afterMs = Math.max(600_000, interval * 6)
  return t >= f - beforeSlack && t < f + afterMs
}

/**
 * 概览开始/截止：前端展示为「M月D日」等中文后写回 workspace，parseDateInput 无法识别会导致提醒永远不触发。
 * 与前端 parseDateValue 语义对齐：优先 ISO，其次中文完整/当年月日。
 */
function overviewDateToEvent(raw: unknown): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const iso = parseDateInput(s)
  if (iso != null && !Number.isNaN(iso.getTime())) return iso
  const zhFull = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s)
  if (zhFull) {
    const y = Number(zhFull[1])
    const mo = Number(zhFull[2])
    const da = Number(zhFull[3])
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da) && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(Date.UTC(y, mo - 1, da))
      return Number.isNaN(d.getTime()) ? null : d
    }
  }
  const mdOnly = /^(\d{1,2})月(\d{1,2})日$/.exec(s)
  if (mdOnly) {
    const y = Number.parseInt(
      new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI_TZ, year: 'numeric' }).format(new Date()),
      10,
    )
    const mo = Number(mdOnly[1])
    const da = Number(mdOnly[2])
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da) && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(Date.UTC(y, mo - 1, da))
      return Number.isNaN(d.getTime()) ? null : d
    }
  }
  return null
}

function dedupeKey(parts: string[]): string {
  return parts.join(':')
}

type ParsedOverviewReminder = {
  id: string
  anchorTime: 'start' | 'end'
  offsetSide: 'before' | 'after'
  offsetValue: number
  offsetUnit: 'minutes' | 'hours' | 'days'
  channel: 'system' | 'email' | 'both'
  remindAt: string
}

const OFFSET_UNITS = new Set(['minutes', 'hours', 'days'])

function parseOverviewReminders(raw: unknown): ParsedOverviewReminder[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): ParsedOverviewReminder | null => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const id = typeof o.id === 'string' && o.id ? o.id : null
      if (!id) return null
      const anchorTime = o.anchorTime === 'end' ? 'end' : 'start'
      const offsetSide = o.offsetSide === 'after' ? 'after' : 'before'
      const rawOff = o.offsetValue
      let offsetValue = 0
      if (typeof rawOff === 'number' && Number.isFinite(rawOff) && rawOff >= 0) offsetValue = Math.floor(rawOff)
      else if (typeof rawOff === 'string' && rawOff.trim()) {
        const n = Number.parseInt(rawOff.trim(), 10)
        if (Number.isFinite(n) && n >= 0) offsetValue = n
      }
      const u = o.offsetUnit
      const offsetUnit = OFFSET_UNITS.has(u as string) ? (u as ParsedOverviewReminder['offsetUnit']) : 'days'
      const chRaw = o.channel
      let channel: ParsedOverviewReminder['channel'] = 'system'
      if (typeof chRaw === 'string') {
        const s = chRaw.trim()
        const norm = s.toLowerCase()
        const hasSys = norm === 'system' || norm === 'both' || s.includes('系统')
        const hasMail = norm === 'email' || norm === 'both' || s.includes('邮件')
        if (norm === 'both' || (hasSys && hasMail)) channel = 'both'
        else if (hasMail) channel = 'email'
      }
      const remindAt = typeof o.remindAt === 'string' && /^\d{1,2}:\d{2}$/.test(o.remindAt) ? o.remindAt : '09:00'
      return { id, anchorTime, offsetSide, offsetValue, offsetUnit, channel, remindAt }
    })
    .filter((x): x is ParsedOverviewReminder => x !== null)
}

function shiftInstant(anchor: Date, side: 'before' | 'after', value: number, unit: ParsedOverviewReminder['offsetUnit']): Date {
  const sign = side === 'before' ? -1 : 1
  const mult = unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000
  return new Date(anchor.getTime() + sign * value * mult)
}

function ymdInShanghai(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function parseHm(s: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}

function shanghaiWallInstantFromYmd(ymd: string, hh: number, mm: number): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function computeOverviewReminderFireAt(
  anchorDate: Date,
  row: ParsedOverviewReminder,
): Date | null {
  const shifted = shiftInstant(anchorDate, row.offsetSide, row.offsetValue, row.offsetUnit)
  const ymd = ymdInShanghai(shifted)
  const hm = parseHm(row.remindAt)
  if (!hm) return null
  return shanghaiWallInstantFromYmd(ymd, hm.h, hm.m)
}

function unitLabel(u: ParsedOverviewReminder['offsetUnit']): string {
  return u === 'minutes' ? '分钟' : u === 'hours' ? '小时' : '天'
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002'
}

async function tryClaimDispatchSlot(dedupeKey: string): Promise<boolean> {
  try {
    await prisma.reminderDispatchLog.create({ data: { dedupeKey } })
    return true
  } catch (e) {
    if (isUniqueViolation(e)) return false
    throw e
  }
}

async function projectMemberIds(projectId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

/** 含负责人：导入或历史数据可能仅有 ownerUserId 而无 project_members 行，否则概览提醒无人可收 */
function mergeProjectOwnerRecipientIds(memberIds: string[], ownerUserId: string | null): string[] {
  const s = new Set<string>()
  for (const id of memberIds) {
    const t = id.trim()
    if (t) s.add(t)
  }
  const ow = ownerUserId?.trim()
  if (ow) s.add(ow)
  return [...s]
}

async function projectMembersWithEmail(
  projectId: string,
  ownerUserId: string | null,
): Promise<{ userId: string; email: string; name: string }[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, email: true, name: true } } },
  })
  const out: { userId: string; email: string; name: string }[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const em = r.user.email?.trim()
    if (em) {
      out.push({ userId: r.userId, email: em, name: r.user.name?.trim() || '成员' })
      seen.add(r.userId)
    }
  }
  if (ownerUserId && !seen.has(ownerUserId)) {
    const u = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { email: true, name: true },
    })
    const em = u?.email?.trim()
    if (em) out.push({ userId: ownerUserId, email: em, name: u?.name?.trim() || '成员' })
  }
  return out
}

async function taskReminderRecipientIds(input: {
  projectId: string
  taskId: string
  kind: string
  ownerUserId: string | null
  createdByUserId: string | null
  description: string | null
  taskParticipantsByKey: Record<string, string[]>
}): Promise<string[]> {
  const ids = new Set<string>()
  if (input.ownerUserId) ids.add(input.ownerUserId)
  if (input.createdByUserId) ids.add(input.createdByUserId)
  const wsNames = input.taskParticipantsByKey[input.taskId] ?? []
  for (const u of await resolveMemberIdsByNames(input.projectId, wsNames)) ids.add(u)
  if (input.kind === 'target') {
    const descNames = parseTargetParticipantsFromDescription(input.description)
    for (const u of await resolveMemberIdsByNames(input.projectId, descNames)) ids.add(u)
  }
  return [...ids]
}

function fmtWhen(d: Date): string {
  return d.toLocaleString('zh-CN', { hour12: false })
}

type ParsedCalendarEventReminder = {
  channel: 'system' | 'email' | 'both'
  value: number
  unit: 'minutes' | 'hours' | 'days'
}

function parseCalendarEventRemindersFromJson(raw: unknown): ParsedCalendarEventReminder[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): ParsedCalendarEventReminder | null => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const chRaw = typeof o.channel === 'string' ? o.channel.trim().toLowerCase() : 'system'
      let channel: ParsedCalendarEventReminder['channel'] = 'system'
      if (chRaw === 'email') channel = 'email'
      else if (chRaw === 'both') channel = 'both'
      let value = 15
      if (typeof o.value === 'number' && Number.isFinite(o.value)) value = Math.max(1, Math.floor(o.value))
      else if (typeof o.value === 'string' && o.value.trim()) {
        const n = Number.parseInt(o.value.trim(), 10)
        if (Number.isFinite(n)) value = Math.max(1, n)
      }
      const u = o.unit === 'hours' || o.unit === 'days' ? o.unit : 'minutes'
      return { channel, value, unit: u }
    })
    .filter((x): x is ParsedCalendarEventReminder => x !== null)
}

function calendarReminderOffsetMs(value: number, unit: ParsedCalendarEventReminder['unit']): number {
  const v = Math.max(1, Math.floor(value))
  if (unit === 'hours') return v * 3_600_000
  if (unit === 'days') return v * 86_400_000
  return v * 60_000
}

function parseCalendarParticipantUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()))]
}

async function calendarEventRecipientsWithEmail(userIds: string[]): Promise<{ userId: string; email: string; name: string }[]> {
  const uniq = [...new Set(userIds.filter(Boolean))]
  if (!uniq.length) return []
  const users = await prisma.user.findMany({
    where: { id: { in: uniq }, status: 'active' },
    select: { id: true, email: true, name: true },
  })
  const out: { userId: string; email: string; name: string }[] = []
  for (const u of users) {
    const em = u.email?.trim()
    if (em) out.push({ userId: u.id, email: em, name: u.name?.trim() || '成员' })
  }
  return out
}

export type DeadlineReminderScanResult = {
  leadMinutes: number
  planned: number
  inserted: number
  skippedDedupe: number
  emailsSent: number
  emailsSkipped: number
}

/**
 * 扫描项目概览开始/截止、任务/目标的开始/截止、**日历日程**的自定义提醒，在计划提醒点写入站内通知并按规则发送邮件（去重）。
 * 项目若配置了 overviewReminders 则按自定义规则（系统消息/邮件）；否则仍用全局提前量。
 */
export async function runDeadlineReminderScan(now: Date = new Date()): Promise<DeadlineReminderScanResult> {
  const lead = leadMinutes()
  const leadMs = lead * 60 * 1000

  type Planned = {
    userId: string
    dedupeKey: string
    type: string
    title: string
    body: string
    projectId: string | null
    taskId: string | null
    eventId?: string | null
    metadataExtra?: Record<string, unknown>
  }

  const planned: Planned[] = []
  let emailsSent = 0
  let emailsSkipped = 0

  const projects = await prisma.project.findMany({
    where: { archived: false },
    select: { id: true, title: true, workspace: true, ownerUserId: true },
  })

  for (const p of projects) {
    const ws = parseWorkspace(p.workspace).overview
    const startAt = overviewDateToEvent(ws.startDate)
    const endAt = overviewDateToEvent(ws.endDate)
    const pt = p.title.trim() || '项目'
    const memberIds = mergeProjectOwnerRecipientIds(await projectMemberIds(p.id), p.ownerUserId)
    const customRows = parseOverviewReminders(ws.overviewReminders)

    if (customRows.length > 0) {
      const membersWithEmail = await projectMembersWithEmail(p.id, p.ownerUserId)
      let smtpMod: typeof import('@/lib/smtpMail') | null = null
      let smtpReady: boolean | null = null
      const ensureSmtp = async () => {
        if (smtpReady === null) {
          smtpMod = await import('@/lib/smtpMail')
          smtpReady = await smtpMod.isSmtpMailConfiguredAsync()
        }
        return { smtpMod: smtpMod!, ready: smtpReady }
      }
      for (const row of customRows) {
        const anchorDate = row.anchorTime === 'end' ? endAt : startAt
        if (!anchorDate) continue
        const fireAt = computeOverviewReminderFireAt(anchorDate, row)
        if (!fireAt || !inCustomFireWindow(now, fireAt)) continue

        const anchorLabel = row.anchorTime === 'end' ? '结束时间' : '开始时间'
        const sideLabel = row.offsetSide === 'before' ? '前' : '后'
        const ruleText = `${anchorLabel}${sideLabel} ${row.offsetValue} ${unitLabel(row.offsetUnit)}，${row.remindAt} 提醒`
        const fireIso = fireAt.toISOString()

        const wantInApp = row.channel === 'system' || row.channel === 'both'
        const wantEmail = row.channel === 'email' || row.channel === 'both'

        if (wantInApp) {
          for (const userId of memberIds) {
            planned.push({
              userId,
              dedupeKey: dedupeKey(['ovr', 'i', p.id, row.id, fireIso, userId]),
              type: 'project_overview_custom_reminder',
              title: '项目概览提醒',
              body: `「${pt.slice(0, 120)}」${ruleText}（计划提醒点：${fmtWhen(fireAt)}）`,
              projectId: p.id,
              taskId: null,
              metadataExtra: {
                reminderId: row.id,
                anchorTime: row.anchorTime,
                fireAt: fireIso,
                channel: row.channel,
              },
            })
          }
        }

        if (wantEmail) {
          const { smtpMod: smtp, ready } = await ensureSmtp()
          if (ready) {
            const subject = `项目提醒：${pt.slice(0, 120)}`
            const text = `您好，\n\n项目「${pt}」有一条概览提醒：${ruleText}。\n计划提醒点（服务器时区换算）：${fmtWhen(fireAt)}\n\n（系统自动发送）`
            for (const m of membersWithEmail) {
              const mailKey = dedupeKey(['ovr', 'e', p.id, row.id, fireIso, m.userId])
              const claimed = await tryClaimDispatchSlot(mailKey)
              if (!claimed) {
                emailsSkipped++
                continue
              }
              const r = await smtp.sendSmtpMail({ to: m.email, subject, text: `${m.name}，\n\n${text}` })
              if (r.ok) emailsSent++
              else emailsSkipped++
            }
          }
        }
      }
    } else {
      if (startAt && inReminderWindow(now, startAt, leadMs)) {
        const iso = startAt.toISOString()
        for (const userId of memberIds) {
          planned.push({
            userId,
            dedupeKey: dedupeKey(['proj', p.id, 'ostart', iso]),
            type: 'project_start_reminder',
            title: `项目即将开始（${lead} 分钟内）`,
            body: `「${pt.slice(0, 120)}」计划开始：${fmtWhen(startAt)}`,
            projectId: p.id,
            taskId: null,
          })
        }
      }
      if (endAt && inReminderWindow(now, endAt, leadMs)) {
        const iso = endAt.toISOString()
        for (const userId of memberIds) {
          planned.push({
            userId,
            dedupeKey: dedupeKey(['proj', p.id, 'oend', iso]),
            type: 'project_end_reminder',
            title: `项目即将截止（${lead} 分钟内）`,
            body: `「${pt.slice(0, 120)}」计划截止：${fmtWhen(endAt)}`,
            projectId: p.id,
            taskId: null,
          })
        }
      }
    }
  }

  const tasks = await prisma.projectTask.findMany({
    where: {
      kind: { in: ['task', 'subtask', 'target'] },
      OR: [{ startDate: { not: null } }, { endDate: { not: null } }],
      project: { archived: false },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      kind: true,
      startDate: true,
      endDate: true,
      ownerUserId: true,
      createdByUserId: true,
      description: true,
      project: { select: { title: true, workspace: true } },
    },
  })

  for (const t of tasks) {
    const pt = t.project.title.trim() || '项目'
    const taskTitle = t.title.trim() || (t.kind === 'target' ? '目标' : '任务')
    const wsDto = parseWorkspace(t.project.workspace)
    const participantsByKey = wsDto.taskParticipantsByKey
    const recipients = await taskReminderRecipientIds({
      projectId: t.projectId,
      taskId: t.id,
      kind: t.kind,
      ownerUserId: t.ownerUserId,
      createdByUserId: t.createdByUserId,
      description: t.description,
      taskParticipantsByKey: participantsByKey,
    })
    if (!recipients.length) continue

    const isTarget = t.kind === 'target'
    const startType = isTarget ? 'target_start_reminder' : 'task_start_reminder'
    const endType = isTarget ? 'target_end_reminder' : 'task_end_reminder'
    const label = isTarget ? '目标' : '任务'

    if (t.startDate && inReminderWindow(now, t.startDate, leadMs)) {
      const iso = t.startDate.toISOString()
      for (const userId of recipients) {
        planned.push({
          userId,
          dedupeKey: dedupeKey(['task', t.projectId, t.id, 'start', iso]),
          type: startType,
          title: `${label}即将开始（${lead} 分钟内）`,
          body: `项目「${pt}」的${label}「${taskTitle.slice(0, 120)}」计划开始：${fmtWhen(t.startDate)}`,
          projectId: t.projectId,
          taskId: t.id,
        })
      }
    }
    if (t.endDate && inReminderWindow(now, t.endDate, leadMs)) {
      const iso = t.endDate.toISOString()
      for (const userId of recipients) {
        planned.push({
          userId,
          dedupeKey: dedupeKey(['task', t.projectId, t.id, 'end', iso]),
          type: endType,
          title: `${label}即将截止（${lead} 分钟内）`,
          body: `项目「${pt}」的${label}「${taskTitle.slice(0, 120)}」计划截止：${fmtWhen(t.endDate)}`,
          projectId: t.projectId,
          taskId: t.id,
        })
      }
    }
  }

  const evWindowStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const evWindowEnd = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
  const calEvents = await prisma.userCalendarEvent.findMany({
    where: { startAt: { gte: evWindowStart, lte: evWindowEnd } },
    select: {
      id: true,
      title: true,
      startAt: true,
      ownerUserId: true,
      participantIds: true,
      reminders: true,
    },
  })

  let calSmtpMod: typeof import('@/lib/smtpMail') | null = null
  let calSmtpReady: boolean | null = null
  const ensureCalSmtp = async () => {
    if (calSmtpReady === null) {
      calSmtpMod = await import('@/lib/smtpMail')
      calSmtpReady = await calSmtpMod.isSmtpMailConfiguredAsync()
    }
    return { smtpMod: calSmtpMod!, ready: calSmtpReady }
  }

  for (const ev of calEvents) {
    const rules = parseCalendarEventRemindersFromJson(ev.reminders)
    if (!rules.length) continue
    const participantIds = parseCalendarParticipantUserIds(ev.participantIds)
    const recipientSet = new Set<string>()
    if (ev.ownerUserId?.trim()) recipientSet.add(ev.ownerUserId.trim())
    for (const pid of participantIds) recipientSet.add(pid)
    const recipients = [...recipientSet]
    if (!recipients.length) continue

    const et = ev.title.trim() || '日程'
    const startStr = fmtWhen(ev.startAt)
    const startIso = ev.startAt.toISOString()

    for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
      const rule = rules[ruleIdx]!
      const offsetMs = calendarReminderOffsetMs(rule.value, rule.unit)
      const fireAt = new Date(ev.startAt.getTime() - offsetMs)
      if (!inCustomFireWindow(now, fireAt)) continue

      const unitCn = rule.unit === 'hours' ? '小时' : rule.unit === 'days' ? '天' : '分钟'
      const title = `日程提醒：${et.slice(0, 100)}`
      const body = `「${et.slice(0, 120)}」将于 ${startStr} 开始（提前 ${rule.value} ${unitCn}）。`

      const wantInApp = rule.channel === 'system' || rule.channel === 'both'
      const wantEmail = rule.channel === 'email' || rule.channel === 'both'

      if (wantInApp) {
        for (const userId of recipients) {
          planned.push({
            userId,
            dedupeKey: dedupeKey(['calevt', 'i', ev.id, String(ruleIdx), startIso, userId]),
            type: 'calendar_event_reminder',
            title,
            body,
            projectId: null,
            taskId: null,
            eventId: ev.id,
          })
        }
      }

      if (wantEmail) {
        const { smtpMod: smtp, ready } = await ensureCalSmtp()
        if (ready) {
          const membersWithEmail = await calendarEventRecipientsWithEmail(recipients)
          const subject = `日程提醒：${et.slice(0, 120)}`
          const textBase = `${body}\n\n开始时间：${startStr}\n\n（系统自动发送）`
          for (const m of membersWithEmail) {
            const mailKey = dedupeKey(['calevt', 'e', ev.id, String(ruleIdx), startIso, m.userId])
            const claimed = await tryClaimDispatchSlot(mailKey)
            if (!claimed) {
              emailsSkipped++
              continue
            }
            const r = await smtp.sendSmtpMail({
              to: m.email,
              subject,
              text: `${m.name}，\n\n您好，\n\n${textBase}`,
            })
            if (r.ok) emailsSent++
            else emailsSkipped++
          }
        }
      }
    }
  }

  const pairs = [...new Map(planned.map((x) => [`${x.userId}|${x.dedupeKey}`, { userId: x.userId, dedupeKey: x.dedupeKey }])).values()]
  const existing = await findExistingDeadlineReminderDedupes(pairs)
  let skippedDedupe = 0

  const rows: Parameters<typeof insertNotifications>[0] = []
  for (const x of planned) {
    const k = `${x.userId}|${x.dedupeKey}`
    if (existing.has(k)) {
      skippedDedupe++
      continue
    }
    const metadata: Prisma.InputJsonValue =
      x.type === 'project_overview_custom_reminder' && x.metadataExtra
        ? {
            dedupeKey: x.dedupeKey,
            reminderKind: x.type,
            ...x.metadataExtra,
          }
        : x.type === 'calendar_event_reminder'
          ? {
              dedupeKey: x.dedupeKey,
              reminderKind: x.type,
              eventId: x.eventId ?? undefined,
            }
          : {
              dedupeKey: x.dedupeKey,
              leadMinutes: lead,
              reminderKind: x.type,
            }
    rows.push({
      userId: x.userId,
      category: 'project',
      type: x.type,
      title: x.title.slice(0, 191),
      body: x.body,
      projectId: x.projectId,
      taskId: x.taskId,
      eventId: x.eventId ?? null,
      metadata,
    })
  }

  await insertNotifications(rows)

  return {
    leadMinutes: lead,
    planned: planned.length,
    inserted: rows.length,
    skippedDedupe,
    emailsSent,
    emailsSkipped,
  }
}

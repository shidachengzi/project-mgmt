import dayjs from 'dayjs'
import type { ProjectTaskTreeDTO } from '../../../shared/api/projectTasksApi'

export type TaskManageRecordLike = {
  key: string
  kind: 'stage' | 'task' | 'subtask'
  seq?: number
  title: string
  status: '未开始' | '进行中' | '搁置中' | '已完成' | '关闭'
  owner?: string
  ownerUserId?: string | null
  stage?: string
  priority: '最高' | '较高' | '普通' | '较低' | '最低'
  start: string
  end: string
  description?: string
  /** 与 description 约定一致：「任务」「部门会议」用于详情标题/隐藏项目阶段；与本地 bizLabel 同源 */
  bizLabel?: string
  attachments: number
  progress: number
  /** 服务端 ISO 时间，用于详情页脚展示 */
  createdAt?: string
  updatedAt?: string
  /** 展示用创建人姓名（API 可扩展） */
  createdBy?: string
  children?: TaskManageRecordLike[]
}

const STATUSES: TaskManageRecordLike['status'][] = ['未开始', '进行中', '搁置中', '已完成', '关闭']
const PRIORITIES: TaskManageRecordLike['priority'][] = ['最高', '较高', '普通', '较低', '最低']

function normalizeStatus(s: string): TaskManageRecordLike['status'] {
  return STATUSES.includes(s as TaskManageRecordLike['status']) ? (s as TaskManageRecordLike['status']) : '未开始'
}

function normalizePriority(p: string): TaskManageRecordLike['priority'] {
  return PRIORITIES.includes(p as TaskManageRecordLike['priority']) ? (p as TaskManageRecordLike['priority']) : '普通'
}

/** API 日期 YYYY-MM-DD → 界面展示：同年用「M月D日」，跨年用「YYYY年M月D日」 */
export function isoDateToMonthDay(iso: string): string {
  if (!iso?.trim()) return ''
  const d = dayjs(iso.trim(), 'YYYY-MM-DD', true)
  if (!d.isValid()) return iso
  const y = dayjs().year()
  return d.year() === y ? `${d.month() + 1}月${d.date()}日` : `${d.year()}年${d.month() + 1}月${d.date()}日`
}

/** 界面「M月D日」「YYYY年M月D日」或 YYYY-MM-DD → API 用 ISO 日期 */
export function uiTaskDateToIso(text: string): string | null {
  if (!text?.trim()) return null
  const t = text.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const ymd = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (ymd) {
    const d = dayjs(`${ymd[1]}-${ymd[2]}-${ymd[3]}`, 'YYYY-M-D', true)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }
  const m = t.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (!m) return null
  const year = dayjs().year()
  const d = dayjs(`${year}-${Number(m[1])}-${Number(m[2])}`, 'YYYY-M-D', true)
  return d.isValid() ? d.format('YYYY-MM-DD') : null
}

/** 活动记录中的日期统一为 YYYY-MM-DD，跨年变更可一眼对比 */
export function formatActivityLogDate(raw: string | null | undefined): string {
  if (raw == null) return '无'
  const t = String(raw).trim()
  if (!t || t === '无') return '无'
  const iso = uiTaskDateToIso(t)
  return iso ?? t
}

const ACTIVITY_DATE_FIELD_LABELS = new Set(['开始时间', '截止时间'])

/** 活动列表展示：日期类字段用 ISO，其余保持原文 */
export function formatActivityFieldDisplay(fieldLabel: string, value: string): string {
  if (ACTIVITY_DATE_FIELD_LABELS.has(fieldLabel)) return formatActivityLogDate(value)
  return value
}

export function projectTaskDtosToRecords(nodes: ProjectTaskTreeDTO[]): TaskManageRecordLike[] {
  return nodes.map(dtoToRecord)
}

function inferBizLabelFromDescription(kind: string, rawDescription: string | undefined): string | undefined {
  if (kind !== 'task' && kind !== 'subtask') return undefined
  const t = (rawDescription ?? '').trim()
  if (t === '任务') return '任务'
  if (t === '部门会议') return '部门会议'
  return undefined
}

function dtoToRecord(dto: ProjectTaskTreeDTO): TaskManageRecordLike {
  const kind = dto.kind === 'stage' || dto.kind === 'task' || dto.kind === 'subtask' ? dto.kind : 'task'
  const rawDesc = dto.description
  const descTrim = (rawDesc ?? '').trim()
  const descriptionForUi = descTrim === '' ? '无' : descTrim
  const bizLabel = inferBizLabelFromDescription(kind, rawDesc)
  return {
    key: dto.key,
    kind,
    seq: dto.sortOrder,
    title: dto.title,
    status: normalizeStatus(dto.status),
    priority: normalizePriority(dto.priority),
    owner: dto.ownerName ?? undefined,
    ownerUserId: dto.ownerUserId,
    stage: dto.stage ?? undefined,
    start: isoDateToMonthDay(dto.start),
    end: isoDateToMonthDay(dto.end),
    description: descriptionForUi,
    bizLabel,
    attachments: dto.attachments,
    progress: dto.progress,
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : undefined,
    updatedAt: typeof dto.updatedAt === 'string' ? dto.updatedAt : undefined,
    children: dto.children?.length ? dto.children.map(dtoToRecord) : undefined,
  }
}

export function taskManageDeltaToApi(
  patch: Partial<TaskManageRecordLike>,
  members: { key: string; name: string }[],
  stages: TaskManageRecordLike[],
  opts?: { /** 仅同步 stageTitle，不把 parentId 挂到阶段（用于子任务跟随父任务改阶段） */ stageTitleOnly?: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.status !== undefined) body.status = patch.status
  if (patch.priority !== undefined) body.priority = patch.priority
  if (patch.description !== undefined) body.description = patch.description === '无' ? '' : patch.description
  if (patch.progress !== undefined) body.progress = patch.progress
  if (patch.attachments !== undefined) body.attachments = patch.attachments
  if (patch.kind !== undefined) body.kind = patch.kind
  if ('owner' in patch) {
    if (!patch.owner) body.ownerUserId = null
    else {
      const m = members.find(x => x.name === patch.owner)
      body.ownerUserId = m?.key ?? null
    }
  }
  if (patch.start !== undefined) {
    body.startDate = patch.start ? uiTaskDateToIso(patch.start) : null
  }
  if (patch.end !== undefined) {
    body.endDate = patch.end ? uiTaskDateToIso(patch.end) : null
  }
  if (patch.stage !== undefined) {
    body.stageTitle = patch.stage
    if (!opts?.stageTitleOnly) {
      const st = stages.filter(s => s.kind === 'stage').find(s => s.title === patch.stage)
      if (st) body.parentId = st.key
    }
  }
  return body
}

/** 存于 project_tasks.description 的 JSON，用于 kind=target 的扩展字段 */
export type TargetPayloadV1 = {
  v: 1
  pmTarget: true
  type: string
  meta?: string
  metricUnit?: string
  metricStart?: string
  metricTarget?: string
  metricCurrent?: string
  acceptanceCriteria?: string
  deliveryNote?: string
  acceptanceFeedback?: string
  participants?: string[]
  textDescription?: string
}

const TARGET_STATUSES = ['未开始', '进行中', '验收中', '已完成', '关闭'] as const

function normalizeTargetStatus(s: string): (typeof TARGET_STATUSES)[number] {
  return TARGET_STATUSES.includes(s as (typeof TARGET_STATUSES)[number]) ? (s as (typeof TARGET_STATUSES)[number]) : '未开始'
}

export function encodeTargetPayload(p: Partial<Omit<TargetPayloadV1, 'v' | 'pmTarget'>> & { type: string }): string {
  const payload: TargetPayloadV1 = {
    v: 1,
    pmTarget: true,
    type: p.type,
    meta: p.meta ?? '',
    metricUnit: p.metricUnit ?? '无',
    metricStart: p.metricStart ?? '无',
    metricTarget: p.metricTarget ?? '无',
    metricCurrent: p.metricCurrent ?? '无',
    acceptanceCriteria: p.acceptanceCriteria ?? '无',
    deliveryNote: p.deliveryNote ?? '无',
    acceptanceFeedback: p.acceptanceFeedback ?? '无',
    participants: Array.isArray(p.participants) ? p.participants : [],
    textDescription: p.textDescription ?? '',
  }
  return JSON.stringify(payload)
}

export function decodeTargetPayload(raw: string | null | undefined): TargetPayloadV1 | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as TargetPayloadV1
    if (o && o.v === 1 && o.pmTarget === true && typeof o.type === 'string') return o
  } catch {
    /* ignore */
  }
  return null
}

export function splitProjectTaskTree(nodes: ProjectTaskTreeDTO[]) {
  const targets: ProjectTaskTreeDTO[] = []
  const taskRoots: ProjectTaskTreeDTO[] = []
  for (const n of nodes) {
    if (n.kind === 'target') targets.push(n)
    else taskRoots.push(n)
  }
  return { targets, taskRoots }
}

/** 根据任务 stage / 树位置归入模板规定的阶段，始终输出固定顺序的阶段行（即使某阶段无任务） */
export function normalizeTaskManageTreeByStages(
  rows: TaskManageRecordLike[],
  canonicalStageTitles: string[],
): TaskManageRecordLike[] {
  if (!canonicalStageTitles.length) return rows

  const stageKeyByTitle = new Map<string, string>()
  const collectStageKeys = (nodes: TaskManageRecordLike[]) => {
    for (const n of nodes) {
      if (n.kind === 'stage') {
        stageKeyByTitle.set(n.title, n.key)
        collectStageKeys(n.children ?? [])
      }
    }
  }
  collectStageKeys(rows)

  type Extracted = { task: TaskManageRecordLike; inferredStage: string; order: number }
  const extracted: Extracted[] = []
  let ord = 0

  const visit = (nodes: TaskManageRecordLike[], stageCtx: string) => {
    for (const n of nodes) {
      if (n.kind === 'stage') {
        visit(n.children ?? [], n.title)
      } else if (n.kind === 'task') {
        const subtasks = (n.children ?? []).filter(c => c.kind === 'subtask')
        extracted.push({
          task: {
            ...n,
            children: subtasks.length ? subtasks : undefined,
          },
          inferredStage: stageCtx,
          order: ord++,
        })
      }
    }
  }
  visit(rows, canonicalStageTitles[0] ?? '')

  const resolveCanonicalStage = (task: TaskManageRecordLike, inferred: string): string => {
    const tryRaw = (raw: string): string | null => {
      const t = raw.trim()
      if (!t) return null
      if (canonicalStageTitles.includes(t)) return t
      const base = t.replace(/阶段$/, '')
      const byBase = canonicalStageTitles.find(c => c.replace(/阶段$/, '') === base)
      if (byBase) return byBase
      const shortAlias: Record<string, string | undefined> = {
        启动: canonicalStageTitles.find(s => s.includes('启动')),
        执行: canonicalStageTitles.find(s => s.includes('执行')),
        验收: canonicalStageTitles.find(s => s.includes('验收')),
        结项: canonicalStageTitles.find(s => s.includes('结项')),
      }
      return shortAlias[t] ?? null
    }

    for (const raw of [task.stage, inferred]) {
      const hit = tryRaw(raw ?? '')
      if (hit) return hit
    }
    return canonicalStageTitles[0]
  }

  const buckets = new Map<string, TaskManageRecordLike[]>()
  for (const t of canonicalStageTitles) buckets.set(t, [])

  extracted.sort((a, b) => a.order - b.order)
  for (const { task, inferredStage } of extracted) {
    const st = resolveCanonicalStage(task, inferredStage)
    const bucket = buckets.get(st) ?? buckets.get(canonicalStageTitles[0])!
    bucket.push({ ...task, stage: st })
  }

  return canonicalStageTitles.map((title, index) => ({
    key: stageKeyByTitle.get(title) ?? `stage-template-${index + 1}`,
    kind: 'stage' as const,
    title,
    status: '未开始',
    priority: '普通',
    start: '',
    end: '',
    attachments: 0,
    progress: 0,
    children: buckets.get(title) ?? [],
  }))
}

export function normalizeParentTaskStatusLike(rows: TaskManageRecordLike[]): TaskManageRecordLike[] {
  return rows.map(row => {
    const nextChildren = row.children?.length ? normalizeParentTaskStatusLike(row.children) : row.children
    if (row.kind !== 'task') {
      return nextChildren ? { ...row, children: nextChildren } : row
    }
    if (!nextChildren?.length || row.status === '关闭') {
      return nextChildren ? { ...row, children: nextChildren } : row
    }
    const allChildrenDone = nextChildren.every(child => child.status === '已完成' || child.status === '关闭')
    if (allChildrenDone && row.status !== '已完成') {
      return { ...row, status: '已完成', children: nextChildren }
    }
    if (!allChildrenDone && row.status === '已完成') {
      return { ...row, status: '进行中', children: nextChildren }
    }
    return nextChildren ? { ...row, children: nextChildren } : row
  })
}

export function finalizeTaskManageTree(
  rows: TaskManageRecordLike[],
  canonicalStageTitles: string[],
): TaskManageRecordLike[] {
  return normalizeParentTaskStatusLike(normalizeTaskManageTreeByStages(rows, canonicalStageTitles))
}

/** 单条任务/子任务在阶段统计中的贡献：仅「已完成」「关闭」计为 100，其余不计入进度 */
export function effectiveTaskProgressRollup(task: TaskManageRecordLike): number {
  if (task.status === '已完成' || task.status === '关闭') return 100
  return 0
}

/**
 * 阶段汇总进度：每个父任务一条代表值（有子任务则为子任务均值，否则为父任务自身），再对父任务算术平均。
 */
export function computeStageTasksProgressPercent(stageChildren: TaskManageRecordLike[]): number {
  const parents = stageChildren.filter(c => c.kind === 'task')
  if (!parents.length) return 0
  let sum = 0
  for (const t of parents) {
    const subs = (t.children ?? []).filter(c => c.kind === 'subtask')
    if (subs.length) {
      sum += subs.reduce((acc, s) => acc + effectiveTaskProgressRollup(s), 0) / subs.length
    } else {
      sum += effectiveTaskProgressRollup(t)
    }
  }
  return Math.round(sum / parents.length)
}

/** 与模板阶段顺序对齐的进度条配色序号（0–7 循环） */
export function stageProgressBarModIndex(stageTitle: string, canonicalStageTitles: string[]): number {
  const i = canonicalStageTitles.indexOf(stageTitle)
  if (i >= 0) return i % 8
  let h = 0
  for (let j = 0; j < stageTitle.length; j++) h = (h * 31 + stageTitle.charCodeAt(j)) >>> 0
  return h % 8
}

export type TargetRecordFromApi = {
  key: string
  title: string
  status: (typeof TARGET_STATUSES)[number]
  type: string
  owner?: string
  startDate?: string
  endDate?: string
  priority?: '最高' | '较高' | '普通' | '较低' | '最低'
  metricUnit?: string
  metricStart?: string
  metricTarget?: string
  metricCurrent?: string
  acceptanceCriteria?: string
  deliveryNote?: string
  acceptanceFeedback?: string
  participants?: string[]
  meta: string
  risky?: boolean
  description?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export function projectTargetDtoToRecord(dto: ProjectTaskTreeDTO, typeFallback: string): TargetRecordFromApi {
  const payload = decodeTargetPayload(dto.description)
  return {
    key: dto.key,
    title: dto.title,
    status: normalizeTargetStatus(dto.status),
    type: payload?.type ?? typeFallback,
    owner: dto.ownerName ?? undefined,
    startDate: dto.start || undefined,
    endDate: dto.end || undefined,
    priority: normalizePriority(dto.priority),
    metricUnit: payload?.metricUnit,
    metricStart: payload?.metricStart,
    metricTarget: payload?.metricTarget,
    metricCurrent: payload?.metricCurrent,
    acceptanceCriteria: payload?.acceptanceCriteria,
    deliveryNote: payload?.deliveryNote,
    acceptanceFeedback: payload?.acceptanceFeedback,
    participants: payload?.participants?.length ? payload.participants : [],
    meta: payload?.meta ?? `优先级: ${dto.priority}`,
    description: payload?.textDescription || undefined,
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : undefined,
    updatedAt: typeof dto.updatedAt === 'string' ? dto.updatedAt : undefined,
  }
}

export function projectTargetDtosToRecords(dtos: ProjectTaskTreeDTO[], typeFallback: string): TargetRecordFromApi[] {
  return dtos.map(d => projectTargetDtoToRecord(d, typeFallback))
}

export function targetRecordToApiPatch(
  r: TargetRecordFromApi,
  members: { key: string; name: string }[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: r.title,
    status: r.status,
    priority: r.priority ?? '普通',
    startDate: r.startDate ? uiTaskDateToIso(r.startDate) : null,
    endDate: r.endDate ? uiTaskDateToIso(r.endDate) : null,
    description: encodeTargetPayload({
      type: r.type,
      meta: r.meta,
      metricUnit: r.metricUnit,
      metricStart: r.metricStart,
      metricTarget: r.metricTarget,
      metricCurrent: r.metricCurrent,
      acceptanceCriteria: r.acceptanceCriteria,
      deliveryNote: r.deliveryNote,
      acceptanceFeedback: r.acceptanceFeedback,
      participants: r.participants,
      textDescription: r.description ?? '',
    }),
  }
  if (r.owner !== undefined) {
    if (!r.owner) body.ownerUserId = null
    else {
      const m = members.find(x => x.name === r.owner)
      body.ownerUserId = m?.key ?? null
    }
  }
  return body
}

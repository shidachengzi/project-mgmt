import dayjs from 'dayjs'
import { uiTaskDateToIso } from './tasks/projectTaskAdapter'

/** 支持 YYYY-MM-DD、YYYY年M月D日、M月D日（与任务列表/适配器展示一致） */
function parseFlexibleDateToDayjs(raw: string | null | undefined): dayjs.Dayjs | null {
  const t = raw?.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = dayjs(t, 'YYYY-MM-DD', true)
    return d.isValid() ? d : null
  }
  const iso = uiTaskDateToIso(t)
  if (!iso) return null
  const d = dayjs(iso, 'YYYY-MM-DD', true)
  return d.isValid() ? d : null
}

/** 项目起止均可解析且 截止 ≥ 开始时返回 [min,max]（含边界） */
export function getNormalizedProjectBounds(
  projectStartIso: string,
  projectEndIso: string
): { min: dayjs.Dayjs; max: dayjs.Dayjs } | null {
  const a = parseFlexibleDateToDayjs(projectStartIso)
  const b = parseFlexibleDateToDayjs(projectEndIso)
  if (!a || !b) return null
  if (b.isBefore(a, 'day')) return null
  return { min: a, max: b }
}

export function validateProjectWindow(
  projectStartIso: string,
  projectEndIso: string
): { ok: true } | { ok: false; message: string } {
  const a = parseFlexibleDateToDayjs(projectStartIso)
  const b = parseFlexibleDateToDayjs(projectEndIso)
  if (!a || !b) return { ok: false, message: '项目开始或截止时间格式无效' }
  if (b.isBefore(a, 'day')) return { ok: false, message: '项目截止时间不能早于开始时间' }
  return { ok: true }
}

export type EntityDateValidationMode = 'withinProjectWindow' | 'startEndOrderOnly'

export function validateEntityDatesAgainstProject(params: {
  projectStartIso: string
  projectEndIso: string
  entityStartIso?: string | null
  entityEndIso?: string | null
  /**
   * `withinProjectWindow`：须在项目起止范围内且截止不早于开始（默认）。
   * `startEndOrderOnly`：个人工作台等无业务项目周期场景，仅校验截止不早于开始（及可解析性）。
   */
  mode?: EntityDateValidationMode
}): { ok: true } | { ok: false; message: string } {
  const mode = params.mode ?? 'withinProjectWindow'
  const es = params.entityStartIso?.trim()
  const ee = params.entityEndIso?.trim()
  if (!es && !ee) return { ok: true }

  const dS = es ? parseFlexibleDateToDayjs(es) : null
  const dE = ee ? parseFlexibleDateToDayjs(ee) : null
  if (es && !dS) return { ok: false, message: '开始时间格式无效' }
  if (ee && !dE) return { ok: false, message: '截止时间格式无效' }

  if (dS && dE && dE.isBefore(dS, 'day')) {
    return { ok: false, message: '截止时间不能早于开始时间' }
  }

  if (mode === 'startEndOrderOnly') {
    return { ok: true }
  }

  const range = getNormalizedProjectBounds(params.projectStartIso, params.projectEndIso)
  if (!range) {
    return { ok: false, message: '项目周期无效，请先在项目中设置有效的开始与截止时间' }
  }
  const { min, max } = range

  const rangeLabel = `${min.format('YYYY-MM-DD')} ~ ${max.format('YYYY-MM-DD')}`

  if (dS && (dS.isBefore(min, 'day') || dS.isAfter(max, 'day'))) {
    return { ok: false, message: `开始时间须在项目周期内（${rangeLabel}）` }
  }
  if (dE && (dE.isBefore(min, 'day') || dE.isAfter(max, 'day'))) {
    return { ok: false, message: `截止时间须在项目周期内（${rangeLabel}）` }
  }
  return { ok: true }
}

export type FleetTargetLike = { title: string; startDate?: string | null; endDate?: string | null }
export type FleetTaskLike = { kind: string; title: string; start?: string; end?: string }

/** 校验项目窗口本身，并收集所有目标/任务中与窗口或起止先后矛盾的问题（用于缩小项目周期前的拦截） */
export function collectFleetDateViolationsForProjectWindow(
  projectStartIso: string,
  projectEndIso: string,
  targets: FleetTargetLike[],
  tasks: FleetTaskLike[]
): string[] {
  const out: string[] = []
  const w = validateProjectWindow(projectStartIso, projectEndIso)
  if (!w.ok) {
    out.push(w.message)
    return out
  }
  for (const t of targets) {
    const v = validateEntityDatesAgainstProject({
      projectStartIso,
      projectEndIso,
      entityStartIso: t.startDate,
      entityEndIso: t.endDate
    })
    if (!v.ok) out.push(`目标「${t.title}」：${v.message}`)
  }
  for (const row of tasks) {
    if (row.kind === 'stage') continue
    const v = validateEntityDatesAgainstProject({
      projectStartIso,
      projectEndIso,
      entityStartIso: row.start,
      entityEndIso: row.end
    })
    if (!v.ok) {
      const label = row.kind === 'subtask' ? '子任务' : '任务'
      out.push(`${label}「${row.title}」：${v.message}`)
    }
  }
  return out
}

export function clampDayToInclusiveRange(d: dayjs.Dayjs, min: dayjs.Dayjs, max: dayjs.Dayjs): dayjs.Dayjs {
  if (max.isBefore(min, 'day')) return d
  if (d.isBefore(min, 'day')) return min
  if (d.isAfter(max, 'day')) return max
  return d
}

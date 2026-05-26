export type TaskPriorityLevel = '最高' | '较高' | '普通' | '较低' | '最低'

export const TASK_PRIORITY_LEVELS: readonly TaskPriorityLevel[] = ['最高', '较高', '普通', '较低', '最低']

const MARK_STYLE: Record<TaskPriorityLevel, { count: number; bangClass: string }> = {
  最高: { count: 3, bangClass: 'wt-priority-with-marks__bang--highest' },
  较高: { count: 3, bangClass: 'wt-priority-with-marks__bang--high' },
  普通: { count: 2, bangClass: 'wt-priority-with-marks__bang--normal' },
  较低: { count: 1, bangClass: 'wt-priority-with-marks__bang--low' },
  最低: { count: 1, bangClass: 'wt-priority-with-marks__bang--lowest' }
}

export function normalizeTaskPriority(raw: string | undefined | null): TaskPriorityLevel {
  const t = (raw ?? '').trim()
  if (!t) return '普通'
  for (const level of TASK_PRIORITY_LEVELS) {
    if (t === level) return level
  }
  for (const level of TASK_PRIORITY_LEVELS) {
    if (t.includes(level)) return level
  }
  return '普通'
}

type PriorityWithMarksProps = {
  priority: TaskPriorityLevel | string | undefined | null
  className?: string
}

export function PriorityWithMarks({ priority, className }: PriorityWithMarksProps) {
  const p =
    typeof priority === 'string' && (TASK_PRIORITY_LEVELS as readonly string[]).includes(priority)
      ? (priority as TaskPriorityLevel)
      : normalizeTaskPriority(priority)
  const { count, bangClass } = MARK_STYLE[p]
  return (
    <span className={['wt-priority-with-marks', className].filter(Boolean).join(' ')} title={`优先级：${p}`}>
      <span className="wt-priority-with-marks__marks" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={`wt-priority-with-marks__bang ${bangClass}`}>
            !
          </span>
        ))}
      </span>
      <span className="wt-priority-with-marks__label">{p}</span>
    </span>
  )
}

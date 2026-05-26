import type { ScheduledTask } from 'node-cron'

let started = false
/** 防止在 node-cron 异步加载完成前重复启动 */
let scheduling = false
let scheduledTask: ScheduledTask | null = null

/** 运行时再用 Node 解析 node-cron，避免 Next instrumentation 的 Webpack 跟进其内部 require('path') 等导致编译失败 */
async function loadNodeCron(): Promise<typeof import('node-cron')> {
  const m = (await import(/* webpackIgnore: true */ 'node-cron')) as typeof import('node-cron') & {
    default?: typeof import('node-cron')
  }
  // CJS module.exports → dynamic import 的 default；@types/node-cron 仅有命名导出
  return m.default ?? m
}

const tickMs = () => {
  const n = Number(process.env.DEADLINE_REMINDER_INTERVAL_MS)
  if (Number.isFinite(n) && n >= 15_000 && n <= 3_600_000) return Math.floor(n)
  return 60_000
}

/**
 * 将 DEADLINE_REMINDER_INTERVAL_MS 映射为 node-cron 表达式（含秒字段）。
 * 与原先 setInterval 语义接近；也可用 DEADLINE_REMINDER_CRON 完全覆盖。
 */
export function cronExpressionFromIntervalMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 15_000) ms = 60_000
  if (ms <= 30_000) return '*/15 * * * * *'
  if (ms <= 60_000) return '*/30 * * * * *'
  if (ms <= 120_000) return '0 * * * * *'
  const minutes = Math.min(60, Math.max(1, Math.round(ms / 60_000)))
  return `0 */${minutes} * * * *`
}

const runScan = () =>
  void import('@/modules/notifications/deadlineReminderScan')
    .then((m) => m.runDeadlineReminderScan())
    .catch((e) => console.error('[deadline-reminder]', e))

/**
 * 在 Node 进程中用 node-cron 注册定时扫描（每进程最多一次）；扫描逻辑仍为动态 import，减轻与 Next 打包链耦合。
 */
export function scheduleDeadlineReminderTicks(): void {
  if (started || scheduling) return
  scheduling = true
  void scheduleDeadlineReminderTicksAsync()
    .catch((e) => {
      console.error('[deadline-reminder] failed to start node-cron', e)
      scheduledTask = null
    })
    .finally(() => {
      scheduling = false
    })
}

async function scheduleDeadlineReminderTicksAsync(): Promise<void> {
  const cron = await loadNodeCron()

  const rawCron = process.env.DEADLINE_REMINDER_CRON?.trim()
  const ms = tickMs()
  const pattern = rawCron && rawCron.length > 0 ? rawCron : cronExpressionFromIntervalMs(ms)

  if (!cron.validate(pattern)) {
    console.error(`[deadline-reminder] invalid DEADLINE_REMINDER_CRON / derived pattern: ${pattern}, fallback to */30 * * * * *`)
    scheduledTask = cron.schedule('*/30 * * * * *', runScan)
  } else {
    scheduledTask = cron.schedule(pattern, runScan)
  }

  started = true
  console.log(`[deadline-reminder] node-cron started: ${pattern} (override with DEADLINE_REMINDER_CRON)`)

  void runScan()
}

/** 测试或热切换时可调用（一般不需要） */
export function stopDeadlineReminderTicks(): void {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
  }
  started = false
  scheduling = false
}

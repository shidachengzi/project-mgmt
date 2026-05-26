/**
 * Next 服务端 instrumentation。
 *
 * 截止/日历等提醒扫描由 `node-cron` 在 **本进程** 内调度（动态 import scan 链，避免静态打包拉满 nodemailer 子图）。
 * - 仅 `npm run dev` / `next start`：在 `.env` 中设置 **`DEADLINE_REMINDER_IN_NEXT=true`** 即可定时扫描。
 * - `npm run dev:stack`：默认仍由 **IM 进程**（`imSocketServer`）调度；请保持 **`DEADLINE_REMINDER_IN_NEXT` 未开启或 false**，以免双进程重复扫描。若希望只由 Next 跑，设 `DEADLINE_REMINDER_IN_IM=false` 且 `DEADLINE_REMINDER_IN_NEXT=true`。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.DEADLINE_REMINDER_IN_NEXT !== 'true') return

  try {
    const mod = await import('@/modules/notifications/deadlineReminderScheduler')
    mod.scheduleDeadlineReminderTicks()
    console.log('[instrumentation] deadline reminder: node-cron started (DEADLINE_REMINDER_IN_NEXT=true)')
  } catch (e) {
    console.error('[instrumentation] deadline reminder cron failed to start', e)
  }
}

/**
 * 单次执行开始/截止提醒扫描。在 backend 目录：npx tsx scripts/run-deadline-reminders-once.ts
 */
import { prisma } from '../src/lib/prisma'
import { runDeadlineReminderScan } from '../src/modules/notifications/deadlineReminderScan'

void runDeadlineReminderScan()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2))
  })
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect().finally(() => process.exit(process.exitCode ?? 0))
  })

/**
 * 删除超过保留天数的 im_direct_messages，控制 MySQL 体积。
 * 在 backend 目录执行：node scripts/prune-im-direct-messages.mjs
 * 默认保留 30 天（约 1 个月），可用 IM_RETENTION_DAYS=60 覆盖。
 * 仅统计不删：IM_PRUNE_DRY_RUN=1 node scripts/prune-im-direct-messages.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(name) {
  const p = resolve(backendRoot, name)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const retentionDays = Math.max(1, Math.min(3650, Number(process.env.IM_RETENTION_DAYS) || 30))
const dryRun = process.env.IM_PRUNE_DRY_RUN === '1' || process.env.IM_PRUNE_DRY_RUN === 'true'

const prisma = new PrismaClient()

async function main() {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const count = await prisma.imDirectMessage.count({ where: { createdAt: { lt: cutoff } } })
  console.log(
    `[prune-im] retention=${retentionDays}d cutoff=${cutoff.toISOString()} rowsToDelete=${count} dryRun=${dryRun}`,
  )
  if (dryRun || count === 0) {
    await prisma.$disconnect()
    return
  }
  const res = await prisma.imDirectMessage.deleteMany({ where: { createdAt: { lt: cutoff } } })
  console.log(`[prune-im] deleted ${res.count} rows`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

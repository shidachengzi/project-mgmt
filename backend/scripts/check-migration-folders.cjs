/**
 * 列出 prisma/migrations 下缺少 migration.sql 的子目录（会导致 prisma migrate deploy 报 P3015）。
 * 多为「migrate 建了一半」或误建的重复目录，可整目录删除；不要删带 migration.sql 的正式迁移（如 20260513100000_project_task_created_by）。
 *
 * 用法（在 backend 目录）：
 *   npm run db:check-migrations
 *   npm run db:prune-empty-migrations
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'prisma', 'migrations')
const wantFix = process.argv.includes('--fix')
const missing = []

for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const sql = path.join(root, ent.name, 'migration.sql')
  if (!fs.existsSync(sql)) missing.push(ent.name)
}

if (missing.length > 0) {
  if (wantFix) {
    for (const name of missing.sort()) {
      const dir = path.join(root, name)
      fs.rmSync(dir, { recursive: true, force: true })
      console.log('[db:prune-empty-migrations] 已删除:', name)
    }
    console.log('[db:prune-empty-migrations] 完成。可再执行 npm run db:check-migrations 与 npx prisma migrate deploy。')
    process.exit(0)
  }

  console.error('[db:check-migrations] 以下目录缺少 migration.sql，Prisma 会报 P3015：')
  console.error('（多半是半截/重复迁移空目录，不要与正式迁移混淆：例如创建人字段应在 20260513100000_project_task_created_by）\n')
  for (const name of missing.sort()) console.error('  -', name)
  console.error('\n可选：在 backend 目录执行 npm run db:prune-empty-migrations 自动删除上述空目录。')
  console.error('\n或手动删除（PowerShell）：')
  for (const name of missing.sort()) {
    console.error(`  Remove-Item -Recurse -Force ".\\prisma\\migrations\\${name}"`)
  }
  process.exit(1)
}

console.log('[db:check-migrations] 正常：所有迁移目录均包含 migration.sql')

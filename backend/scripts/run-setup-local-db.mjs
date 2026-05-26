/**
 * 本地一键：建库（root/root）→ generate → migrate deploy → seed
 * 使用方式：在 backend 目录执行 npm run db:setup:local
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, '..')

process.chdir(backendRoot)

const run = (cmd, env = process.env) => {
  execSync(cmd, { stdio: 'inherit', env, shell: true })
}

console.log('[db:setup:local] Creating database (mysql2, avoids Prisma on system DB mysql → P3004)...')
run('node scripts/create-database.mjs')

console.log('[db:setup:local] prisma generate...')
run('npx prisma generate')

console.log('[db:setup:local] prune empty migration folders (avoid P3015)...')
run('node scripts/check-migration-folders.cjs --fix')

console.log('[db:setup:local] prisma migrate deploy...')
run('npx prisma migrate deploy')

console.log('[db:setup:local] seed...')
run('node prisma/seed.js')

console.log('[db:setup:local] Done.')

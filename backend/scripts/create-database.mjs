/**
 * 直连 MySQL 创建业务库（不经过 Prisma），避免对系统库 `mysql` 使用 prisma migrate/db execute 触发 P3004。
 * 从 backend/.env 读取 DATABASE_URL，并创建 URL 中的数据库名（默认 project_mgmt）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, '..')
const envPath = path.join(backendRoot, '.env')

function readDatabaseUrl() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`缺少 ${envPath}，请先复制 .env.example 为 .env 并配置 DATABASE_URL`)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const line = text.split(/\r?\n/).find((l) => {
    const t = l.trim()
    return t && !t.startsWith('#') && t.startsWith('DATABASE_URL')
  })
  if (!line) throw new Error('.env 中未找到 DATABASE_URL')
  const eq = line.indexOf('=')
  if (eq === -1) throw new Error('DATABASE_URL 格式错误')
  let raw = line.slice(eq + 1).trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1)
  }
  return raw
}

const dbUrl = readDatabaseUrl()
const u = new URL(dbUrl)
const dbName = u.pathname.replace(/^\//, '').split('?')[0]
if (!dbName) throw new Error('DATABASE_URL 中缺少数据库名，例如 .../project_mgmt')

const conn = await mysql.createConnection({
  host: u.hostname || '127.0.0.1',
  port: u.port ? Number(u.port) : 3306,
  user: decodeURIComponent(u.username || 'root'),
  password: u.password != null ? decodeURIComponent(u.password) : '',
})

await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
)
await conn.end()
console.log(`[create-database] OK: database "${dbName}" is ready.`)

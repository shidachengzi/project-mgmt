/**
 * 独立进程 `dev:im-socket` 不会自动加载 Next 的 .env，需在任意读 JWT/DB 配置的 import 之前执行。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function isValidEnvKey(key: string): boolean {
  if (!key.length) return false
  const first = key.codePointAt(0)!
  const okFirst = (first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95
  if (!okFirst) return false
  for (let i = 1; i < key.length; i++) {
    const c = key.codePointAt(i)!
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) return false
  }
  return true
}

function parseAndApply(raw: string, overrideExisting: boolean) {
  const lines = raw.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    if (!isValidEnvKey(key)) continue
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (overrideExisting || process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

function loadFile(name: string, overrideExisting: boolean) {
  const p = resolve(backendRoot, name)
  if (!existsSync(p)) return
  parseAndApply(readFileSync(p, 'utf8'), overrideExisting)
}

loadFile('.env', false)
loadFile('.env.local', true)

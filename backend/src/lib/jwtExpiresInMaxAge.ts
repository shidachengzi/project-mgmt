/**
 * 将 jwt 常用 expiresIn（如 15m、7d）转为 Cookie maxAge（秒）；无法解析时用 fallbackSec。
 */
export function jwtExpiresInToMaxAgeSeconds(raw: string | undefined, fallbackSec: number): number {
  if (!raw || typeof raw !== 'string') return fallbackSec
  const s = raw.trim()
  const m = /^(\d+)(s|m|h|d)$/i.exec(s)
  if (!m) return fallbackSec
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n < 0) return fallbackSec
  switch (m[2].toLowerCase()) {
    case 's':
      return n
    case 'm':
      return n * 60
    case 'h':
      return n * 3600
    case 'd':
      return n * 86400
    default:
      return fallbackSec
  }
}

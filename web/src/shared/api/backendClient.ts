/**
 * 后端 API 基址：
 * - 生产或未配代理：设置 VITE_BACKEND_API_BASE（完整 origin，如 https://api.example.com）
 * - 本地开发：留空则使用同源相对路径 /api/*，由 Vite 代理到 Next（见 vite.config.ts）
 */
export function resolveBackendUrl(path: string): string | null {
  const base = (import.meta.env.VITE_BACKEND_API_BASE || '').trim()
  const p = path.startsWith('/') ? path : `/${path}`
  if (base) return `${base.replace(/\/$/, '')}${p}`
  if (import.meta.env.DEV) return p
  return null
}

/** 是否走后端登录 / Cookie 会话（与权限接口同源） */
export function isBackendAuthEnabled(): boolean {
  return resolveBackendUrl('/api/auth/login') != null
}

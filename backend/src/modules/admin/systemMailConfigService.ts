import { prisma } from '@/lib/prisma'
import { decryptSettingSecret, encryptSettingSecret } from '@/lib/settingsCrypto'

const SINGLETON_ID = 'default'

/** Prisma Client 未执行 generate 时 delegate 不存在，避免运行期崩溃 */
type SystemMailRow = {
  smtpHost: string | null
  smtpPort: number
  smtpSecure: boolean
  smtpTlsSkipVerify?: boolean
  smtpFrom: string | null
  smtpUser: string | null
  smtpPassCipher: string | null
}

type SystemMailDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<SystemMailRow | null>
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
}

function systemMailDelegate(): SystemMailDelegate | null {
  const d = (prisma as unknown as { systemMailConfig?: SystemMailDelegate }).systemMailConfig
  return d ?? null
}

export function isSystemMailPrismaAvailable(): boolean {
  return systemMailDelegate() != null
}

async function findSystemMailRow(): Promise<SystemMailRow | null> {
  const m = systemMailDelegate()
  if (!m) return null
  return m.findUnique({ where: { id: SINGLETON_ID } })
}

export type ResolvedSmtp = {
  host: string
  port: number
  secure: boolean
  /** true：不校验服务端证书（自签/内网 CA；慎用） */
  tlsSkipVerify: boolean
  from: string
  user?: string
  pass?: string
  source: 'database' | 'environment'
}

function smtpFromEnv(): ResolvedSmtp | null {
  const host = process.env.SMTP_HOST?.trim()
  const from = process.env.SMTP_FROM?.trim()
  if (!host || !from) return null
  const port = Math.max(1, Math.min(65535, Number(process.env.SMTP_PORT) || 587))
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const tlsSkipVerify =
    process.env.SMTP_TLS_SKIP_VERIFY === 'true' || process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false'
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  return {
    host,
    port,
    secure,
    tlsSkipVerify,
    from,
    user: user || undefined,
    pass: pass || undefined,
    source: 'environment',
  }
}

/** 数据库行完整（host+from）则仅用库；否则回退环境变量 */
export async function resolveEffectiveSmtp(): Promise<ResolvedSmtp | null> {
  const row = await findSystemMailRow()
  const h = row?.smtpHost?.trim()
  const f = row?.smtpFrom?.trim()
  if (row && h && f) {
    let pass: string | undefined
    if (row.smtpPassCipher) {
      const d = decryptSettingSecret(row.smtpPassCipher)
      if (d) pass = d
    }
    const port = row.smtpPort ?? 587
    const nport = Math.max(1, Math.min(65535, port))
    return {
      host: h,
      port: nport,
      secure: row.smtpSecure ?? nport === 465,
      tlsSkipVerify: Boolean(row.smtpTlsSkipVerify),
      from: f,
      user: row.smtpUser?.trim() || undefined,
      pass,
      source: 'database',
    }
  }
  return smtpFromEnv()
}

export type AdminMailSnapshot = {
  configured: boolean
  source: 'database' | 'environment' | 'none'
  host: string | null
  port: number
  secure: boolean
  tlsSkipVerify: boolean
  from: string | null
  authUserSet: boolean
  authPassSet: boolean
  formInitial: {
    smtpHost: string
    smtpPort: number
    smtpSecure: boolean
    smtpTlsSkipVerify: boolean
    smtpFrom: string
    smtpUser: string
    hasSavedPassword: boolean
  }
}

export async function getAdminMailSnapshot(): Promise<AdminMailSnapshot> {
  const resolved = await resolveEffectiveSmtp()
  const row = await findSystemMailRow()
  const dbReady = Boolean(row?.smtpHost?.trim() && row?.smtpFrom?.trim())
  if (!resolved) {
    return {
      configured: false,
      source: 'none',
      host: null,
      port: 587,
      secure: false,
      tlsSkipVerify: false,
      from: null,
      authUserSet: false,
      authPassSet: false,
      formInitial: {
        smtpHost: row?.smtpHost?.trim() ?? '',
        smtpPort: row?.smtpPort ?? 587,
        smtpSecure: row?.smtpSecure ?? false,
        smtpTlsSkipVerify: Boolean(row?.smtpTlsSkipVerify),
        smtpFrom: row?.smtpFrom?.trim() ?? '',
        smtpUser: row?.smtpUser?.trim() ?? '',
        hasSavedPassword: Boolean(row?.smtpPassCipher),
      },
    }
  }
  return {
    configured: true,
    source: resolved.source,
    host: resolved.host,
    port: resolved.port,
    secure: resolved.secure,
    tlsSkipVerify: resolved.tlsSkipVerify,
    from: resolved.from,
    authUserSet: Boolean(resolved.user?.trim()),
    authPassSet: Boolean(resolved.pass?.trim()),
    formInitial: {
      smtpHost: dbReady ? (row!.smtpHost ?? '').trim() : resolved.host,
      smtpPort: dbReady ? (row!.smtpPort ?? resolved.port) : resolved.port,
      smtpSecure: dbReady ? Boolean(row!.smtpSecure) : resolved.secure,
      smtpTlsSkipVerify: dbReady ? Boolean(row!.smtpTlsSkipVerify) : resolved.tlsSkipVerify,
      smtpFrom: dbReady ? (row!.smtpFrom ?? '').trim() : resolved.from,
      smtpUser: dbReady ? (row!.smtpUser ?? '').trim() : (resolved.user ?? ''),
      hasSavedPassword: Boolean(row?.smtpPassCipher),
    },
  }
}

export type PatchSystemMailInput = {
  smtpHost: string | null
  smtpPort: number
  smtpSecure: boolean
  smtpTlsSkipVerify: boolean
  smtpFrom: string | null
  smtpUser: string | null
  /** 非空则更新口令 */
  authPass?: string
  /** true 时清空已存口令（与 authPass 互斥，优先清空） */
  clearAuthPass?: boolean
}

export async function upsertSystemMailConfig(input: PatchSystemMailInput) {
  const m = systemMailDelegate()
  if (!m) {
    throw new Error('PRISMA_SYSTEM_MAIL_UNAVAILABLE')
  }

  const existing = await m.findUnique({ where: { id: SINGLETON_ID } })

  const passUpdate: { smtpPassCipher?: string | null } = {}
  if (input.clearAuthPass) {
    passUpdate.smtpPassCipher = null
  } else if (input.authPass !== undefined) {
    const t = input.authPass.trim()
    if (t.length > 0) passUpdate.smtpPassCipher = encryptSettingSecret(t)
  }

  const base = {
    smtpHost: input.smtpHost?.trim() || null,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    smtpTlsSkipVerify: input.smtpTlsSkipVerify,
    smtpFrom: input.smtpFrom?.trim() || null,
    smtpUser: input.smtpUser?.trim() || null,
  }

  if (existing) {
    await m.update({
      where: { id: SINGLETON_ID },
      data: { ...base, ...passUpdate },
    })
  } else {
    await m.create({
      data: {
        id: SINGLETON_ID,
        ...base,
        smtpPassCipher: passUpdate.smtpPassCipher !== undefined ? passUpdate.smtpPassCipher : null,
      },
    })
  }
}

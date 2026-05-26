import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { signPasswordResetToken, validatePassword, verifyPasswordResetToken } from '@/lib/auth'
import { sendSmtpMail } from '@/lib/smtpMail'
import { isSmtpMailConfiguredAsync } from '@/lib/smtpMail'

const CODE_TTL_MS = 10 * 60 * 1000

function normalizeEmailInput(raw: string) {
  return raw.trim().toLowerCase()
}

/** 按邮箱查找用户（不区分大小写） */
export async function findUserIdByEmailForReset(emailRaw: string) {
  const norm = normalizeEmailInput(emailRaw)
  if (!norm) return null
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM users WHERE email IS NOT NULL AND LOWER(TRIM(email)) = ${norm} LIMIT 1`)
  const id = rows[0]?.id
  if (!id) return null
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true }
  })
  if (!user?.email || user.status !== 'active') return null
  return { id: user.id, email: user.email, status: user.status }
}

function randomSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export type RequestPasswordResetResult = { ok: true; sent: boolean } | { ok: false; error: 'SMTP_NOT_CONFIGURED' | 'MAIL_SEND_FAILED' | 'INVALID_EMAIL' }

export async function requestPasswordResetCode(emailRaw: string): Promise<RequestPasswordResetResult> {
  const trimmed = emailRaw.trim()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'INVALID_EMAIL' }
  }

  const user = await findUserIdByEmailForReset(trimmed)
  if (!user) {
    return { ok: true, sent: false }
  }

  const smtpOk = await isSmtpMailConfiguredAsync()
  if (!smtpOk) {
    return { ok: false, error: 'SMTP_NOT_CONFIGURED' }
  }

  const plainCode = randomSixDigitCode()
  const codeHash = await bcrypt.hash(plainCode, 10)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.$transaction(async tx => {
    await tx.passwordResetCode.deleteMany({
      where: { userId: user.id, usedAt: null }
    })
    await tx.passwordResetCode.create({
      data: {
        userId: user.id,
        email: user.email,
        codeHash,
        expiresAt
      }
    })
  })

  const send = await sendSmtpMail({
    to: user.email,
    subject: '找回密码验证码',
    text: `您正在申请重置登录密码。\n\n验证码：${plainCode}\n\n${Math.floor(CODE_TTL_MS / 60000)} 分钟内有效。如非本人操作请忽略本邮件。`
  })

  if (!send.ok) {
    await prisma.passwordResetCode.deleteMany({ where: { userId: user.id, usedAt: null } })
    console.error('[password-reset] mail send failed', send.error)
    return { ok: false, error: 'MAIL_SEND_FAILED' }
  }

  return { ok: true, sent: true }
}

export type VerifyPasswordResetCodeResult = { ok: true; resetToken: string } | { ok: false; error: 'INVALID_CODE' | 'INVALID_EMAIL' }

export async function verifyPasswordResetCode(emailRaw: string, codeRaw: string): Promise<VerifyPasswordResetCodeResult> {
  const trimmed = emailRaw.trim()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'INVALID_EMAIL' }
  }
  const code = String(codeRaw ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
  if (code.length !== 6) {
    return { ok: false, error: 'INVALID_CODE' }
  }

  const user = await findUserIdByEmailForReset(trimmed)
  if (!user) {
    return { ok: false, error: 'INVALID_CODE' }
  }

  const record = await prisma.passwordResetCode.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!record) {
    return { ok: false, error: 'INVALID_CODE' }
  }

  const match = await validatePassword(code, record.codeHash)
  if (!match) {
    return { ok: false, error: 'INVALID_CODE' }
  }

  await prisma.passwordResetCode.deleteMany({ where: { userId: user.id } })

  const resetToken = signPasswordResetToken(user.id)
  return { ok: true, resetToken }
}

export type FinalizePasswordResetResult = { ok: true } | { ok: false; error: 'INVALID_TOKEN' | 'WEAK_PASSWORD' | 'USER_NOT_FOUND' }

export async function finalizePasswordReset(resetToken: string, newPassword: string): Promise<FinalizePasswordResetResult> {
  const pwd = String(newPassword ?? '')
  if (pwd.length < 6) {
    return { ok: false, error: 'WEAK_PASSWORD' }
  }

  let userId: string
  try {
    userId = verifyPasswordResetToken(resetToken)
  } catch {
    return { ok: false, error: 'INVALID_TOKEN' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    return { ok: false, error: 'USER_NOT_FOUND' }
  }

  const passwordHash = await bcrypt.hash(pwd, 10)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.passwordResetCode.deleteMany({ where: { userId } })
  ])

  return { ok: true }
}

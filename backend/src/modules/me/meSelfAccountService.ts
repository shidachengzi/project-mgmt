import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { validatePassword } from '@/lib/auth'

export type PatchOwnProfileInput = {
  name?: string
  username?: string | null
  email?: string | null
  mobile?: string | null
}

export async function patchOwnProfile(
  userId: string,
  patch: PatchOwnProfileInput,
): Promise<{ ok: true } | { error: 'NOT_FOUND' | 'CONTACT_REQUIRED' | 'DUPLICATE' | 'INVALID' }> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) return { error: 'NOT_FOUND' }

  const data: { name?: string; username?: string | null; email?: string | null; mobile?: string | null } = {}
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.username !== undefined) {
    const username = patch.username === '' || patch.username == null ? null : String(patch.username).trim()
    if (!username) return { error: 'INVALID' }
    data.username = username
  }
  if (patch.email !== undefined) data.email = patch.email === '' || patch.email == null ? null : String(patch.email).trim()
  if (patch.mobile !== undefined) data.mobile = patch.mobile === '' || patch.mobile == null ? null : String(patch.mobile).trim()

  const nextEmail = patch.email !== undefined ? data.email ?? null : u.email
  const nextMobile = patch.mobile !== undefined ? data.mobile ?? null : u.mobile
  if (!nextEmail && !nextMobile) return { error: 'CONTACT_REQUIRED' }

  if (Object.keys(data).length === 0) return { ok: true }

  try {
    await prisma.user.update({ where: { id: userId }, data })
    return { ok: true }
  } catch {
    return { error: 'DUPLICATE' }
  }
}

export async function changeOwnPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { error: 'NOT_FOUND' | 'BAD_OLD' | 'WEAK' }> {
  if (String(newPassword).length < 6) return { error: 'WEAK' }
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) return { error: 'NOT_FOUND' }
  const matched = await validatePassword(oldPassword, u.passwordHash)
  if (!matched) return { error: 'BAD_OLD' }
  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId } }),
  ])
  return { ok: true }
}

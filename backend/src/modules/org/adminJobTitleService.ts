import { prisma } from '@/lib/prisma'

export type JobTitleDTO = {
  id: string
  name: string
  sortOrder: number
}

export async function listJobTitles(): Promise<JobTitleDTO[]> {
  const rows = await prisma.jobTitle.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))
}

export async function createJobTitle(name: string) {
  const n = name.trim()
  if (!n) return { error: 'EMPTY_NAME' as const }
  const agg = await prisma.jobTitle.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (agg._max.sortOrder ?? -1) + 1
  try {
    const row = await prisma.jobTitle.create({
      data: { name: n.slice(0, 191), sortOrder },
    })
    return { ok: true as const, id: row.id }
  } catch {
    return { error: 'DUPLICATE_NAME' as const }
  }
}

export async function updateJobTitle(id: string, name: string) {
  const n = name.trim()
  if (!n) return { error: 'EMPTY_NAME' as const }
  const row = await prisma.jobTitle.findUnique({ where: { id } })
  if (!row) return { error: 'NOT_FOUND' as const }
  try {
    await prisma.jobTitle.update({
      where: { id },
      data: { name: n.slice(0, 191) },
    })
    return { ok: true as const }
  } catch {
    return { error: 'DUPLICATE_NAME' as const }
  }
}

export async function deleteJobTitle(id: string) {
  const row = await prisma.jobTitle.findUnique({ where: { id } })
  if (!row) return { error: 'NOT_FOUND' as const }
  await prisma.jobTitle.delete({ where: { id } })
  return { ok: true as const }
}

export async function reorderJobTitles(orderedIds: string[]) {
  const ids = orderedIds.filter(Boolean)
  if (!ids.length) return { ok: true as const }
  const rows = await prisma.jobTitle.findMany({ where: { id: { in: ids } } })
  if (rows.length !== ids.length) return { error: 'NOT_FOUND' as const }
  await prisma.$transaction(ids.map((id, idx) => prisma.jobTitle.update({ where: { id }, data: { sortOrder: idx } })))
  return { ok: true as const }
}

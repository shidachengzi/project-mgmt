/** 从 PATCH / GET workspace 解析目标关联、附件映射（与 ProjectDetailPage 原逻辑一致） */

export type TargetRelatedTaskLink = {
  taskKey: string
  relation: '依赖'
}

export type WorkspaceAttachmentItem = {
  id: string
  name: string
  sizeBytes: number
  uploader: string
  createdAt: string
  dataUrl: string
}

export function parseWorkspaceTargetRelatedTasks(raw: unknown): Record<string, TargetRelatedTaskLink[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, TargetRelatedTaskLink[]> = {}
  for (const [k, val] of Object.entries(raw)) {
    if (!Array.isArray(val)) continue
    const links: TargetRelatedTaskLink[] = []
    for (const item of val) {
      if (!item || typeof item !== 'object') continue
      const t = item as Record<string, unknown>
      const taskKey = typeof t.taskKey === 'string' ? t.taskKey : ''
      if (taskKey) links.push({ taskKey, relation: '依赖' })
    }
    out[k] = links
  }
  return out
}

export function parseWorkspaceTargetAttachments(raw: unknown): Record<string, WorkspaceAttachmentItem[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, WorkspaceAttachmentItem[]> = {}
  for (const [k, val] of Object.entries(raw)) {
    if (!Array.isArray(val)) continue
    const items: WorkspaceAttachmentItem[] = []
    for (const item of val) {
      if (!item || typeof item !== 'object') continue
      const a = item as Record<string, unknown>
      const id = typeof a.id === 'string' ? a.id : ''
      const name = typeof a.name === 'string' ? a.name : '未命名'
      const sizeBytes = typeof a.sizeBytes === 'number' && Number.isFinite(a.sizeBytes) ? a.sizeBytes : 0
      const uploader = typeof a.uploader === 'string' ? a.uploader : ''
      const createdAt = typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString()
      const dataUrl = typeof a.dataUrl === 'string' ? a.dataUrl : ''
      if (id) items.push({ id, name, sizeBytes, uploader, createdAt, dataUrl })
    }
    out[k] = items
  }
  return out
}

export function parseWorkspaceTaskAttachments(raw: unknown): Record<string, WorkspaceAttachmentItem[]> {
  return parseWorkspaceTargetAttachments(raw)
}

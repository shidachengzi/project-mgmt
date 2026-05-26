import type { WorkspaceAttachmentItem } from '../hooks/useProjectDetailWorkspace'

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })

export function newWorkspaceAttachmentItem(prefix: string, file: File, uploader: string): WorkspaceAttachmentItem {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: file.name,
    sizeBytes: file.size,
    uploader,
    createdAt: new Date().toISOString(),
    dataUrl: ''
  }
}

export function triggerDownloadAttachment(item: { dataUrl: string; name: string }) {
  const a = document.createElement('a')
  a.href = item.dataUrl
  a.download = item.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function triggerDownloadAllAttachments(items: Array<{ dataUrl: string; name: string }>, delayMs = 350) {
  items.forEach((item, i) => {
    window.setTimeout(() => triggerDownloadAttachment(item), i * delayMs)
  })
}

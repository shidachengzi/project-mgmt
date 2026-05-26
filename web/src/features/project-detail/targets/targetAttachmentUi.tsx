import { FileOutlined, FileWordOutlined } from '@ant-design/icons'

export const formatTargetAttachmentSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TargetAttachmentFileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'doc' || ext === 'docx') {
    return (
      <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--word">
        <FileWordOutlined />
      </span>
    )
  }
  if (ext === 'txt') {
    return <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--txt">TXT</span>
  }
  return (
    <span className="wt-target-attachment-file-icon wt-target-attachment-file-icon--generic">
      <FileOutlined />
    </span>
  )
}

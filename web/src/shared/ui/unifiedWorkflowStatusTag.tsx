import { CheckCircleFilled, ClockCircleFilled, MinusCircleFilled } from '@ant-design/icons'

export const UNIFIED_OWNER_AVATAR_CLASS = 'wt-reports-detail__owner-avatar'

export function unifiedOwnerAvatarInitials(name: string): string {
  const t = name.trim()
  if (!t) return ''
  return t.slice(0, 2).toUpperCase()
}

export type WorkflowStatusTone = 'done' | 'doing' | 'todo'

export function workflowStatusTone(status?: string | null): WorkflowStatusTone {
  const v = (status ?? '').trim() || '未开始'
  if (v === '已完成' || v === '关闭') return 'done'
  if (v === '进行中' || v === '验收中' || v === '搁置中') return 'doing'
  return 'todo'
}

type UnifiedWorkflowStatusTagProps = {
  status?: string | null
  className?: string
}

export function UnifiedWorkflowStatusTag({ status, className }: UnifiedWorkflowStatusTagProps) {
  const display = (status ?? '').trim() || '未开始'
  const tone = workflowStatusTone(display)
  const mod = tone === 'done' ? 'done' : tone === 'doing' ? 'doing' : 'todo'
  const icon =
    tone === 'done' ? (
      <CheckCircleFilled />
    ) : tone === 'doing' ? (
      <ClockCircleFilled />
    ) : (
      <MinusCircleFilled />
    )
  return (
    <span className={['wt-reports-detail__status', `wt-reports-detail__status--${mod}`, className].filter(Boolean).join(' ')}>
      {icon}
      {display}
    </span>
  )
}

export function WorkflowStatusEditorRing({ status }: { status?: string | null }) {
  const display = (status ?? '').trim() || '未开始'
  const tone = workflowStatusTone(display)
  const mod = tone === 'done' ? 'done' : tone === 'doing' ? 'doing' : 'todo'
  const icon =
    tone === 'done' ? (
      <CheckCircleFilled />
    ) : tone === 'doing' ? (
      <ClockCircleFilled />
    ) : (
      <MinusCircleFilled />
    )
  return (
    <span className={`wt-workflow-status-editor-ring wt-workflow-status-editor-ring--${mod}`} aria-hidden>
      {icon}
    </span>
  )
}

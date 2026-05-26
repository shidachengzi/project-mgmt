/**
 * Target editor modal — extracted from ProjectDetailPage.
 * If sections are missing after a partial migration, restore from git history.
 */
import { CalendarOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, FileTextOutlined, FolderFilled, PlusOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Checkbox, DatePicker, Dropdown, Empty, Input, Modal, Select, Space, Tag, Typography, Upload, message } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useState, type Dispatch, SetStateAction } from 'react'
import { ActivityParticipantActivityBody } from '../shared/activityParticipantActivity'
import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials, WorkflowStatusEditorRing } from '../../../shared/ui/unifiedWorkflowStatusTag'
import { formatActivityFieldDisplay } from '../tasks/projectTaskAdapter'
import { TargetFeedCommentComposer } from '../TargetFeedCommentComposer'
import { formatAuditZh } from './targetMeta'
import { TARGET_STATUS_OPTIONS } from './targetStatusOptions'
import { formatTargetAttachmentSize, TargetAttachmentFileIcon } from './targetAttachmentUi'
import type { TargetEditingField, TargetEditorTab, TargetRecord, TargetSideTab } from './targetTypes'

const TARGET_SIDE_PANEL_PAGE_SIZE = 10

type MemberRecord = { key: string; name: string; role: string; dept: string; action: string }

type TargetAttachmentItem = {
  id: string
  name: string
  sizeBytes: number
  uploader: string
  createdAt: string
  dataUrl: string
}

type RelatedTaskLink = { taskKey: string; relation: string }

type FlatTask = {
  key: string
  title: string
  seq?: number
  priority: TaskPriorityLevel
  status: string
  end: string
}

type TargetActivityItem = {
  id: string
  actor: string
  fieldLabel: string
  before: string
  after: string
  createdAt: string
}

type StatusFlowItem = {
  id: string
  actor: string
  before: string
  after: string
  createdAt: string
}

export type ProjectTargetEditorModalProps = {
  editingTarget: TargetRecord | null
  setEditingTarget: Dispatch<SetStateAction<TargetRecord | null>>
  editingTargetField: TargetEditingField | null
  setEditingTargetField: Dispatch<SetStateAction<TargetEditingField | null>>
  targetTypeLabel: string
  projectOverview: { title: string }
  detailFromExternal?: { kind: 'target' | 'task'; key: string } | null
  onExternalDetailClose?: () => void
  canDeleteTarget: boolean
  deleteTargetByKey: (key: string) => void
  projectReadonly: boolean
  canEditTargetDetailFields: boolean
  canEditTargetStatusFields: boolean
  updateEditingTarget: (patch: Partial<TargetRecord>) => void
  members: MemberRecord[]
  parseDateValue: (value: string) => Dayjs | null
  formatDateText: (value: string) => string
  editorTab: TargetEditorTab
  setEditorTab: Dispatch<SetStateAction<TargetEditorTab>>
  relatedLinksForTarget: RelatedTaskLink[]
  targetAttachmentsForEditor: TargetAttachmentItem[]
  targetDescriptionDraft: string
  setTargetDescriptionDraft: Dispatch<SetStateAction<string>>
  commitTargetDescription: () => void
  hideCompletedRelated: boolean
  setHideCompletedRelated: Dispatch<SetStateAction<boolean>>
  relatedTasksOverallPercent: number
  canLinkTargetTasks: boolean
  setRelatedPickerOpen: Dispatch<SetStateAction<boolean>>
  setRelatedPickerPendingKeys: Dispatch<SetStateAction<string[]>>
  setRelatedPickerSearch: Dispatch<SetStateAction<string>>
  displayedRelatedLinks: RelatedTaskLink[]
  manageFlatTasks: FlatTask[]
  openRelatedTaskDetailByKey: (key: string) => void
  removeRelatedTaskLink: (targetKey: string, taskKey: string) => void
  relatedPickerOpen: boolean
  relatedPickerSearch: string
  pickerRecentTasks: FlatTask[]
  pickerRestTasks: FlatTask[]
  relatedPickerPendingKeys: string[]
  toggleRelatedPickerPending: (key: string) => void
  cancelRelatedPicker: () => void
  confirmRelatedPicker: () => void
  canManageTargetTabAttachments: boolean
  triggerDownloadAllTargetAttachments: (items: TargetAttachmentItem[]) => void
  addTargetAttachmentFromFile: (file: File) => void
  triggerDownloadTargetAttachment: (item: TargetAttachmentItem) => void
  removeTargetAttachmentItem: (targetKey: string, attachmentId: string) => void
  targetSideTab: TargetSideTab
  setTargetSideTab: Dispatch<SetStateAction<TargetSideTab>>
  totalCommentsForSide: number
  visibleCommentsForSide: TargetCommentRecord[]
  hasMoreCommentsForSide: boolean
  setTargetSidePanelVisibleCount: Dispatch<SetStateAction<number>>
  activityFeedForSide: TargetActivityItem[]
  visibleActivityFeedForSide: TargetActivityItem[]
  hasMoreActivityFeedForSide: boolean
  statusFlowForSide: StatusFlowItem[]
  visibleStatusFlowForSide: StatusFlowItem[]
  hasMoreStatusFlowForSide: boolean
  targetCommentInput: string
  setTargetCommentInput: Dispatch<SetStateAction<string>>
  blockTargetFeedCommentInput: boolean
  currentSideKey: string
  addTargetComment: (key: string) => void
  formatDateTime: (iso: string) => string
}

export function ProjectTargetEditorModal({
  editingTarget,
  setEditingTarget,
  editingTargetField,
  setEditingTargetField,
  targetTypeLabel,
  projectOverview,
  detailFromExternal,
  onExternalDetailClose,
  canDeleteTarget,
  deleteTargetByKey,
  projectReadonly,
  canEditTargetDetailFields,
  canEditTargetStatusFields,
  updateEditingTarget,
  members,
  parseDateValue,
  formatDateText,
  editorTab,
  setEditorTab,
  relatedLinksForTarget,
  targetAttachmentsForEditor,
  targetDescriptionDraft,
  setTargetDescriptionDraft,
  commitTargetDescription,
  hideCompletedRelated,
  setHideCompletedRelated,
  relatedTasksOverallPercent,
  canLinkTargetTasks,
  setRelatedPickerOpen,
  setRelatedPickerPendingKeys,
  setRelatedPickerSearch,
  displayedRelatedLinks,
  manageFlatTasks,
  openRelatedTaskDetailByKey,
  removeRelatedTaskLink,
  relatedPickerOpen,
  relatedPickerSearch,
  pickerRecentTasks,
  pickerRestTasks,
  relatedPickerPendingKeys,
  toggleRelatedPickerPending,
  cancelRelatedPicker,
  confirmRelatedPicker,
  canManageTargetTabAttachments,
  triggerDownloadAllTargetAttachments,
  addTargetAttachmentFromFile,
  triggerDownloadTargetAttachment,
  removeTargetAttachmentItem,
  targetSideTab,
  setTargetSideTab,
  totalCommentsForSide,
  visibleCommentsForSide,
  hasMoreCommentsForSide,
  setTargetSidePanelVisibleCount,
  activityFeedForSide,
  visibleActivityFeedForSide,
  hasMoreActivityFeedForSide,
  statusFlowForSide,
  visibleStatusFlowForSide,
  hasMoreStatusFlowForSide,
  targetCommentInput,
  setTargetCommentInput,
  blockTargetFeedCommentInput,
  currentSideKey,
  addTargetComment,
  formatDateTime
}: ProjectTargetEditorModalProps) {
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    setTitleDraft(editingTarget?.title ?? '')
  }, [editingTarget?.key])

  const commitTitle = () => {
    if (!editingTarget) return
    if (projectReadonly || !canEditTargetDetailFields) {
      setEditingTargetField(null)
      return
    }
    const trimmed = titleDraft.trim()
    const nextTitle = trimmed || editingTarget.title
    if (nextTitle !== editingTarget.title) {
      updateEditingTarget({ title: nextTitle })
    }
    setEditingTargetField(null)
  }

  const closeEditor = () => {
    setEditingTarget(null)
    setEditingTargetField(null)
    setTargetSideTab('评论')
    setTargetCommentInput('')
    if (detailFromExternal) onExternalDetailClose?.()
  }

  return (
    <Modal open={Boolean(editingTarget)} onCancel={closeEditor} footer={null} width={1320} centered title={null} className="wt-target-editor-modal" destroyOnHidden closable={false}>
      {editingTarget && (
        <div className="wt-target-editor-modal__content">
          <div className="wt-target-editor-modal__header">
            <div className="wt-target-editor-modal__header-left">
              <div className="wt-target-editor-modal__header-top">
                <span className="wt-target-editor-modal__badge">
                  <FolderFilled />
                  <span>{targetTypeLabel}</span>
                </span>
                <span className="wt-target-editor-modal__project-name">{projectOverview.title}</span>
              </div>
            </div>
            <Space size={4}>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [{ key: 'delete', label: '删除目标', icon: <DeleteOutlined />, danger: true }],
                  onClick: ({ key }) => {
                    if (key !== 'delete' || !editingTarget) return
                    if (!canDeleteTarget) {
                      message.warning('当前角色暂无「删除目标」权限')
                      return
                    }
                    Modal.confirm({
                      title: '删除目标',
                      content: `确认删除目标「${editingTarget.title}」吗？`,
                      okText: '删除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => {
                        deleteTargetByKey(editingTarget.key)
                        message.success('目标删除成功')
                      }
                    })
                  }
                }}
              >
                <Button type="text" icon={<EllipsisOutlined />} disabled={!canDeleteTarget} />
              </Dropdown>
              <Button type="text" icon={<CloseOutlined />} onClick={closeEditor} />
            </Space>
          </div>
          <div className="wt-project-detail wt-target-editor">
            <div className="wt-target-editor__main">
              <div className="wt-target-editor__header">
                <div className="wt-target-editor__path">
                  {targetTypeLabel} / {editingTarget.key.toUpperCase()}
                </div>
                <Typography.Title level={3} ellipsis={false}>
                  {editingTargetField === 'title' ? (
                    <Input
                      autoFocus
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={commitTitle}
                      onPressEnter={commitTitle}
                      style={{ padding: 0, width: 420 }}
                    />
                  ) : (
                    <span
                      style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'text' }}
                      onClick={() => {
                        if (projectReadonly || !canEditTargetDetailFields) return
                        setTitleDraft(editingTarget.title)
                        setEditingTargetField('title')
                      }}
                    >
                      {editingTarget.title}
                    </span>
                  )}
                </Typography.Title>
              </div>
              <div className="wt-target-editor__meta">
                <div className="wt-target-editor__meta-grid">
                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack wt-target-editor__meta-item--status">
                    <WorkflowStatusEditorRing status={editingTarget.status} />
                    <span className="wt-target-editor__meta-text">
                      <span className="wt-target-editor__meta-main">
                        {editingTargetField === 'status' ? (
                          <Select
                            autoFocus
                            size="small"
                            open
                            value={editingTarget.status}
                            onChange={value => {
                              updateEditingTarget({ status: value as TargetRecord['status'] })
                              setEditingTargetField(null)
                            }}
                            onBlur={() => setEditingTargetField(null)}
                            options={TARGET_STATUS_OPTIONS}
                            style={{ width: 120 }}
                          />
                        ) : (
                          <span style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('status')}>
                            {editingTarget.status}
                          </span>
                        )}
                      </span>
                      <span className="wt-target-editor__meta-sub">当前状态</span>
                    </span>
                  </span>
                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <Avatar size={34} className={`wt-target-editor__meta-avatar ${UNIFIED_OWNER_AVATAR_CLASS}${(editingTarget.owner || '').trim() ? '' : ' wt-reports-detail__owner-avatar--empty'}`}>
                      {(editingTarget.owner || '').trim() ? unifiedOwnerAvatarInitials(editingTarget.owner ?? '') : <UserOutlined />}
                    </Avatar>
                    <span className="wt-target-editor__meta-text">
                      <span className="wt-target-editor__meta-main">
                        {editingTargetField === 'owner' ? (
                          <Select
                            autoFocus
                            size="small"
                            value={editingTarget.owner}
                            onChange={value => {
                              updateEditingTarget({ owner: value })
                              setEditingTargetField(null)
                            }}
                            onBlur={() => setEditingTargetField(null)}
                            options={members.map(member => ({
                              value: member.name,
                              label: member.name
                            }))}
                            style={{ minWidth: 150 }}
                          />
                        ) : (
                          <span style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('owner')}>
                            {editingTarget.owner || '未分配'}
                          </span>
                        )}
                      </span>
                      <span className="wt-target-editor__meta-sub">负责人</span>
                    </span>
                  </span>
                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    {editingTargetField === 'startDate' ? (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <DatePicker
                            autoFocus
                            size="small"
                            open
                            value={parseDateValue(editingTarget.startDate ?? '')}
                            format="YYYY年M月D日"
                            onChange={date => {
                              if (date) updateEditingTarget({ startDate: date.format('YYYY-MM-DD') })
                              setEditingTargetField(null)
                            }}
                            onOpenChange={open => {
                              if (!open) setEditingTargetField(null)
                            }}
                          />
                        </span>
                      </span>
                    ) : !editingTarget.startDate ? (
                      <span className="wt-target-editor__meta-text wt-target-editor__meta-text--single" style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('startDate')}>
                        开始时间
                      </span>
                    ) : (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <span style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('startDate')}>
                            {formatDateText(editingTarget.startDate)}
                          </span>
                        </span>
                        <span className="wt-target-editor__meta-sub">开始时间</span>
                      </span>
                    )}
                  </span>
                  <span className="wt-target-editor__meta-item wt-target-editor__meta-item--stack">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    {editingTargetField === 'endDate' ? (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <DatePicker
                            autoFocus
                            size="small"
                            open
                            value={parseDateValue(editingTarget.endDate ?? '')}
                            format="YYYY年M月D日"
                            onChange={date => {
                              if (date) updateEditingTarget({ endDate: date.format('YYYY-MM-DD') })
                              setEditingTargetField(null)
                            }}
                            onOpenChange={open => {
                              if (!open) setEditingTargetField(null)
                            }}
                          />
                        </span>
                      </span>
                    ) : !editingTarget.endDate ? (
                      <span className="wt-target-editor__meta-text wt-target-editor__meta-text--single" style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('endDate')}>
                        截止时间
                      </span>
                    ) : (
                      <span className="wt-target-editor__meta-text">
                        <span className="wt-target-editor__meta-main">
                          <span style={{ cursor: canEditTargetStatusFields ? 'pointer' : 'default' }} onClick={() => canEditTargetStatusFields && setEditingTargetField('endDate')}>
                            {formatDateText(editingTarget.endDate)}
                          </span>
                        </span>
                        <span className="wt-target-editor__meta-sub">截止时间</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="wt-target-editor__tabs">
                <span className={editorTab === '任务信息' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setEditorTab('任务信息')}>
                  任务信息
                </span>
                <span className={editorTab === '关联任务' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setEditorTab('关联任务')}>
                  关联任务 {relatedLinksForTarget.length > 0 ? relatedLinksForTarget.length : ''}
                </span>
                <span className={editorTab === '附件' ? 'wt-target-editor__tab wt-target-editor__tab--active' : 'wt-target-editor__tab'} onClick={() => setEditorTab('附件')}>
                  附件 {targetAttachmentsForEditor.length > 0 ? targetAttachmentsForEditor.length : ''}
                </span>
              </div>

              {editorTab === '任务信息' ? (
                <>
                  <div className="wt-target-editor__section">
                    <div className="wt-target-editor__labels">
                      <span>优先级</span>
                      <span>量化指标-单位</span>
                      <span>量化指标-起始值</span>
                      <span>量化指标-目标值</span>
                    </div>
                    <div className="wt-target-editor__values">
                      {editingTargetField === 'priority' ? (
                        <Select
                          autoFocus
                          size="small"
                          open
                          value={editingTarget.priority ?? '较高'}
                          onChange={value => {
                            updateEditingTarget({ priority: value as TargetRecord['priority'] })
                            setEditingTargetField(null)
                          }}
                          onBlur={() => setEditingTargetField(null)}
                          options={TASK_PRIORITY_LEVELS.map((value: TaskPriorityLevel) => ({
                            value,
                            label: <PriorityWithMarks priority={value} />
                          }))}
                          style={{ width: 152 }}
                        />
                      ) : (
                        <span style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'pointer' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('priority')}>
                          <PriorityWithMarks priority={editingTarget.priority ?? '较高'} />
                        </span>
                      )}
                      {editingTargetField === 'metricUnit' ? (
                        <Input autoFocus size="small" value={editingTarget.metricUnit ?? '无'} onChange={e => updateEditingTarget({ metricUnit: e.target.value })} onBlur={() => setEditingTargetField(null)} onPressEnter={() => setEditingTargetField(null)} style={{ width: 120 }} />
                      ) : (
                        <span style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'pointer' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('metricUnit')}>
                          {editingTarget.metricUnit ?? '无'}
                        </span>
                      )}
                      {editingTargetField === 'metricStart' ? (
                        <Input autoFocus size="small" value={editingTarget.metricStart ?? '无'} onChange={e => updateEditingTarget({ metricStart: e.target.value })} onBlur={() => setEditingTargetField(null)} onPressEnter={() => setEditingTargetField(null)} style={{ width: 120 }} />
                      ) : (
                        <span style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'pointer' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('metricStart')}>
                          {editingTarget.metricStart ?? '无'}
                        </span>
                      )}
                      {editingTargetField === 'metricTarget' ? (
                        <Input autoFocus size="small" value={editingTarget.metricTarget ?? '无'} onChange={e => updateEditingTarget({ metricTarget: e.target.value })} onBlur={() => setEditingTargetField(null)} onPressEnter={() => setEditingTargetField(null)} style={{ width: 120 }} />
                      ) : (
                        <span style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'pointer' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('metricTarget')}>
                          {editingTarget.metricTarget ?? '无'}
                        </span>
                      )}
                    </div>
                    <div className="wt-target-editor__labels" style={{ marginTop: 12 }}>
                      <span>量化指标-当前值</span>
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="wt-target-editor__values">
                      {editingTargetField === 'metricCurrent' ? (
                        <Input autoFocus size="small" value={editingTarget.metricCurrent ?? '无'} onChange={e => updateEditingTarget({ metricCurrent: e.target.value })} onBlur={() => setEditingTargetField(null)} onPressEnter={() => setEditingTargetField(null)} style={{ width: 120 }} />
                      ) : (
                        <span style={{ cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'pointer' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('metricCurrent')}>
                          {editingTarget.metricCurrent ?? '无'}
                        </span>
                      )}
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className="wt-target-editor__field">
                    <Typography.Text strong>描述</Typography.Text>
                    {editingTargetField === 'description' ? (
                      <Input.TextArea
                        autoFocus
                        value={targetDescriptionDraft}
                        onChange={e => setTargetDescriptionDraft(e.target.value)}
                        onBlur={() => commitTargetDescription()}
                        onKeyDown={e => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault()
                            commitTargetDescription()
                          }
                        }}
                        rows={4}
                        style={{ marginTop: 8 }}
                      />
                    ) : (
                      <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'text' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('description')}>
                        {editingTarget.description || '无'}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <div className="wt-target-editor__field">
                    <Typography.Text strong>验收标准</Typography.Text>
                    {editingTargetField === 'acceptanceCriteria' ? (
                      <Input.TextArea autoFocus value={editingTarget.acceptanceCriteria ?? '无'} onChange={e => updateEditingTarget({ acceptanceCriteria: e.target.value })} onBlur={() => setEditingTargetField(null)} rows={3} style={{ marginTop: 8 }} />
                    ) : (
                      <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'text' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('acceptanceCriteria')}>
                        {editingTarget.acceptanceCriteria || '无'}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <div className="wt-target-editor__field">
                    <Typography.Text strong>交付说明</Typography.Text>
                    {editingTargetField === 'deliveryNote' ? (
                      <Input.TextArea autoFocus value={editingTarget.deliveryNote ?? '无'} onChange={e => updateEditingTarget({ deliveryNote: e.target.value })} onBlur={() => setEditingTargetField(null)} rows={3} style={{ marginTop: 8 }} />
                    ) : (
                      <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'text' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('deliveryNote')}>
                        {editingTarget.deliveryNote || '无'}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <div className="wt-target-editor__field">
                    <Typography.Text strong>验收反馈</Typography.Text>
                    {editingTargetField === 'acceptanceFeedback' ? (
                      <Input.TextArea autoFocus value={editingTarget.acceptanceFeedback ?? '无'} onChange={e => updateEditingTarget({ acceptanceFeedback: e.target.value })} onBlur={() => setEditingTargetField(null)} rows={3} style={{ marginTop: 8 }} />
                    ) : (
                      <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, cursor: projectReadonly || !canEditTargetDetailFields ? 'default' : 'text' }} onClick={() => !projectReadonly && canEditTargetDetailFields && setEditingTargetField('acceptanceFeedback')}>
                        {editingTarget.acceptanceFeedback || '无'}
                      </Typography.Paragraph>
                    )}
                  </div>
                </>
              ) : null}

              {editorTab === '关联任务' ? (
                <div className="wt-related-task-block">
                  <div className="wt-related-task-toolbar">
                    <div className="wt-related-task-toolbar__left">
                      <Space size={12}>
                        <Typography.Text type="secondary">共 {relatedLinksForTarget.length} 个任务</Typography.Text>
                        <Typography.Link style={{ fontSize: 12 }} onClick={() => setHideCompletedRelated(v => !v)}>
                          {hideCompletedRelated ? '显示已完成' : '隐藏已完成的'}
                        </Typography.Link>
                      </Space>
                    </div>
                    <div className="wt-related-task-toolbar__right">
                      <div className="wt-related-task-toolbar__progress" aria-label="关联任务完成进度">
                        <div className="wt-related-task-toolbar__progress-bar">
                          <div className="wt-related-task-toolbar__progress-fill" style={{ width: `${relatedTasksOverallPercent}%` }} />
                        </div>
                        <span className="wt-related-task-toolbar__progress-text">{relatedTasksOverallPercent}%</span>
                      </div>
                      <Button
                        size="small"
                        type="text"
                        icon={<PlusOutlined />}
                        disabled={!canLinkTargetTasks}
                        onClick={() => {
                          if (!canLinkTargetTasks) return
                          setRelatedPickerOpen(true)
                          setRelatedPickerPendingKeys([])
                          setRelatedPickerSearch('')
                        }}
                      >
                        新建
                      </Button>
                    </div>
                  </div>
                  {displayedRelatedLinks.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                      <Typography.Text type="secondary">暂无关联任务，点击「新建」从任务管理中选择</Typography.Text>
                    </div>
                  ) : (
                    displayedRelatedLinks.map(link => {
                      const t = manageFlatTasks.find(x => x.key === link.taskKey)
                      if (!t) return null
                      const label = `${t.seq != null ? t.seq : '—'} ${t.title}`
                      return (
                        <div key={link.taskKey} className="wt-related-task-item">
                          <div
                            className="wt-related-task-left"
                            style={{ cursor: projectReadonly ? 'default' : 'pointer', flex: 1, minWidth: 0 }}
                            onClick={() => !projectReadonly && openRelatedTaskDetailByKey(link.taskKey)}
                            role="button"
                            tabIndex={projectReadonly ? -1 : 0}
                            onKeyDown={e => {
                              if (!projectReadonly && (e.key === 'Enter' || e.key === ' ')) openRelatedTaskDetailByKey(link.taskKey)
                            }}
                          >
                            <span className="wt-task-page__task-icon wt-related-task-item__icon">
                              <FileTextOutlined />
                            </span>
                            <Tag className="wt-related-task-relation-tag" color="success">
                              依赖
                            </Tag>
                            <span className="wt-related-task-item__title">{label}</span>
                          </div>
                          <div className="wt-related-task-right">
                            <span>{t.end || '—'}</span>
                            <span className="wt-related-task-priority">
                              <PriorityWithMarks priority={t.priority} />
                            </span>
                            <Tag color={t.status === '进行中' ? 'gold' : t.status === '已完成' ? 'cyan' : 'default'}>{t.status}</Tag>
                            <Avatar size={22} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                              DA
                            </Avatar>
                            <Button
                              type="text"
                              size="small"
                              danger
                              disabled={!canLinkTargetTasks}
                              onClick={e => {
                                e.stopPropagation()
                                if (!canLinkTargetTasks) return
                                removeRelatedTaskLink(editingTarget!.key, link.taskKey)
                              }}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                  {relatedPickerOpen ? (
                    <div className="wt-related-task-picker">
                      <Input className="wt-related-task-picker__search" allowClear prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜索任务名称,编号(编号前需加#)" value={relatedPickerSearch} onChange={e => setRelatedPickerSearch(e.target.value)} />
                      <div className="wt-related-task-picker__list">
                        {pickerRecentTasks.length > 0 ? (
                          <>
                            <div className="wt-related-task-picker__section-title">最近浏览</div>
                            {pickerRecentTasks.map(t => (
                              <div key={`r-${t.key}`} className="wt-related-task-picker__row" onClick={() => canLinkTargetTasks && toggleRelatedPickerPending(t.key)}>
                                <Checkbox disabled={!canLinkTargetTasks} checked={relatedPickerPendingKeys.includes(t.key)} onClick={e => e.stopPropagation()} onChange={() => canLinkTargetTasks && toggleRelatedPickerPending(t.key)} />
                                <span className="wt-task-page__task-icon">
                                  <FileTextOutlined />
                                </span>
                                <span className="wt-related-task-picker__row-title">
                                  {t.seq != null ? t.seq : '—'} {t.title}
                                </span>
                                <span className="wt-related-task-picker__row-priority">
                                  <PriorityWithMarks priority={t.priority} />
                                </span>
                              </div>
                            ))}
                          </>
                        ) : null}
                        <div className="wt-related-task-picker__section-title">任务管理</div>
                        {pickerRestTasks.length === 0 ? (
                          <div className="wt-related-task-picker__empty">
                            <Typography.Text type="secondary">没有可添加的任务</Typography.Text>
                          </div>
                        ) : (
                          pickerRestTasks.map(t => (
                            <div key={t.key} className="wt-related-task-picker__row" onClick={() => canLinkTargetTasks && toggleRelatedPickerPending(t.key)}>
                              <Checkbox disabled={!canLinkTargetTasks} checked={relatedPickerPendingKeys.includes(t.key)} onClick={e => e.stopPropagation()} onChange={() => canLinkTargetTasks && toggleRelatedPickerPending(t.key)} />
                              <span className="wt-task-page__task-icon">
                                <FileTextOutlined />
                              </span>
                              <span className="wt-related-task-picker__row-title">
                                {t.seq != null ? t.seq : '—'} {t.title}
                              </span>
                              <span className="wt-related-task-picker__row-priority">
                                <PriorityWithMarks priority={t.priority} />
                              </span>
                            </div>
                          ))
                        )}
                        <Typography.Link className="wt-related-task-picker__more" onClick={() => setRelatedPickerSearch('')}>
                          更多任务
                        </Typography.Link>
                      </div>
                      <div className="wt-related-task-picker__footer">
                        <Space style={{ marginLeft: 'auto' }}>
                          <Button size="small" onClick={cancelRelatedPicker}>
                            取消
                          </Button>
                          <Button type="primary" size="small" disabled={!canLinkTargetTasks || relatedPickerPendingKeys.length === 0} onClick={confirmRelatedPicker}>
                            确定
                          </Button>
                        </Space>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {editorTab === '附件' ? (
                <div className="wt-attachment-block">
                  <div className="wt-attachment-toolbar">
                    <Typography.Text type="secondary">共 {targetAttachmentsForEditor.length} 个附件</Typography.Text>
                    <Space size={4}>
                      <Button type="text" size="small" icon={<DownloadOutlined />} disabled={targetAttachmentsForEditor.length === 0} onClick={() => triggerDownloadAllTargetAttachments(targetAttachmentsForEditor)}>
                        全部下载
                      </Button>
                      <Upload
                        disabled={!canManageTargetTabAttachments}
                        showUploadList={false}
                        multiple
                        beforeUpload={file => {
                          addTargetAttachmentFromFile(file)
                          return false
                        }}
                      >
                        <Button type="text" size="small" disabled={!canManageTargetTabAttachments} icon={<PlusOutlined />}>
                          添加附件
                        </Button>
                      </Upload>
                    </Space>
                  </div>
                  {targetAttachmentsForEditor.length === 0 ? (
                    <div className="wt-attachment-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从未有附件" />
                    </div>
                  ) : (
                    <div className="wt-target-attachment-list">
                      {targetAttachmentsForEditor.map(item => (
                        <div key={item.id} className="wt-target-attachment-row">
                          <TargetAttachmentFileIcon name={item.name} />
                          <div className="wt-target-attachment-row__body">
                            <div className="wt-target-attachment-row__name">{item.name}</div>
                            <div className="wt-target-attachment-row__meta">
                              {formatTargetAttachmentSize(item.sizeBytes)} 来自 {item.uploader} | {dayjs(item.createdAt).format('M月D日 HH:mm')}
                            </div>
                          </div>
                          <div className="wt-target-attachment-row__actions">
                            <Button
                              type="text"
                              size="small"
                              icon={<DownloadOutlined />}
                              aria-label="下载"
                              onClick={e => {
                                e.stopPropagation()
                                triggerDownloadTargetAttachment(item)
                              }}
                            />
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label="删除"
                              disabled={!canManageTargetTabAttachments}
                              onClick={e => {
                                e.stopPropagation()
                                if (!canManageTargetTabAttachments) return
                                removeTargetAttachmentItem(editingTarget!.key, item.id)
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {editorTab === '任务信息' ? (
                <div className="wt-target-editor__footer-meta">
                  <span className="wt-target-editor-modal__meta-text">
                    创建于 {formatAuditZh(editingTarget.createdAt)} · 更新于 {formatAuditZh(editingTarget.updatedAt ?? editingTarget.createdAt)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="wt-target-editor__side">
              <div className="wt-target-editor__side-tabs">
                {(['评论', '活动', '流转', '状态审批'] as TargetSideTab[]).map(tab => (
                  <span key={tab} className={targetSideTab === tab ? 'wt-target-editor__side-tab wt-target-editor__side-tab--active' : 'wt-target-editor__side-tab'} onClick={() => setTargetSideTab(tab)}>
                    {tab}
                  </span>
                ))}
              </div>
              {targetSideTab === '评论' ? (
                <div className="wt-target-activity">
                  {totalCommentsForSide === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论" />
                    </div>
                  ) : (
                    <>
                      {visibleCommentsForSide.map(item => (
                        <div key={item.id} className="wt-target-activity__item">
                          <div className="wt-target-activity__head">
                            <Avatar size={24} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                              {item.actor.slice(0, 2)}
                            </Avatar>
                            <span className="wt-target-activity__actor">{item.actor}</span>
                            <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <div className="wt-target-activity__body">
                            <div className="wt-target-activity__line">{item.content}</div>
                          </div>
                        </div>
                      ))}
                      {hasMoreCommentsForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : targetSideTab === '活动' ? (
                <div className="wt-target-activity">
                  {activityFeedForSide.length === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动记录" />
                    </div>
                  ) : (
                    <>
                      {visibleActivityFeedForSide.map(item => (
                        <div key={item.id} className="wt-target-activity__item">
                          <div className="wt-target-activity__head">
                            <Avatar size={24} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                              {item.actor.slice(0, 2)}
                            </Avatar>
                            <span className="wt-target-activity__actor">{item.actor}</span>
                            <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <div className="wt-target-activity__body">
                            {item.fieldLabel === '参与人' ? (
                              <ActivityParticipantActivityBody before={item.before} after={item.after} />
                            ) : (
                              <>
                                <div className="wt-target-activity__line">{item.fieldLabel}</div>
                                <div className="wt-target-activity__change">
                                  <span>{formatActivityFieldDisplay(item.fieldLabel, item.before)}</span>
                                  <span className="wt-target-activity__arrow">→</span>
                                  <span>{formatActivityFieldDisplay(item.fieldLabel, item.after)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      {hasMoreActivityFeedForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : targetSideTab === '流转' ? (
                <div className="wt-target-flow">
                  {statusFlowForSide.length === 0 ? (
                    <div className="wt-target-editor__side-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无状态流转记录" />
                    </div>
                  ) : (
                    <>
                      {visibleStatusFlowForSide.map((item, idx) => (
                        <div key={item.id} className="wt-target-flow__item">
                          <div className="wt-target-flow__left">
                            <WorkflowStatusEditorRing status={item.before} />
                            <span className="wt-target-flow__dot" />
                            {idx < visibleStatusFlowForSide.length - 1 ? <span className="wt-target-flow__line" /> : null}
                          </div>
                          <div className="wt-target-flow__right">
                            <div className="wt-target-flow__head">
                              <Avatar size={24} className={UNIFIED_OWNER_AVATAR_CLASS}>
                                {unifiedOwnerAvatarInitials(item.actor)}
                              </Avatar>
                              <span className="wt-target-activity__actor">{item.actor}</span>
                              <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                            </div>
                            <div className="wt-target-flow__change">
                              <UnifiedWorkflowStatusTag status={item.before} />
                              <span className="wt-target-activity__arrow">→</span>
                              <UnifiedWorkflowStatusTag status={item.after} />
                            </div>
                          </div>
                        </div>
                      ))}
                      {hasMoreStatusFlowForSide ? (
                        <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => setTargetSidePanelVisibleCount(c => c + TARGET_SIDE_PANEL_PAGE_SIZE)}>
                            显示更多
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="wt-target-editor__side-empty">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${targetSideTab}`} />
                  </div>
                  <div className="wt-target-editor__comment-box">按 "M" 键输入评论</div>
                </>
              )}
              {targetSideTab === '评论' ? (
                <div className="wt-target-editor__comment-box">
                  <TargetFeedCommentComposer
                    value={targetCommentInput}
                    onChange={setTargetCommentInput}
                    disabled={blockTargetFeedCommentInput}
                    hotkeyEnabled={Boolean(editingTarget)}
                    onSubmit={() => {
                      if (!currentSideKey || blockTargetFeedCommentInput) return
                      addTargetComment(currentSideKey)
                    }}
                  />
                </div>
              ) : null}
              <div className="wt-target-editor__participants">
                <span className="wt-target-editor__participants-label">参与人</span>
                {((editingTarget?.participants ?? []) as string[]).map(name => (
                  <span key={name} className="wt-target-editor__participant">
                    <Avatar size={20} style={{ background: '#7b8cff', fontSize: 11 }}>
                      {name.slice(0, 2)}
                    </Avatar>
                    <Button
                      type="text"
                      size="small"
                      className="wt-target-editor__participant-remove"
                      onClick={() => {
                        updateEditingTarget({
                          participants: (editingTarget?.participants ?? []).filter(p => p !== name)
                        })
                      }}
                    >
                      ×
                    </Button>
                  </span>
                ))}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: members
                      .map(m => m.name)
                      .filter(n => !(editingTarget?.participants ?? []).includes(n))
                      .map(n => ({ key: n, label: n })),
                    onClick: ({ key }) => {
                      updateEditingTarget({
                        participants: [...(editingTarget?.participants ?? []), String(key)]
                      })
                    }
                  }}
                >
                  <Button type="text" size="small" style={{ padding: 0, minWidth: 20 }}>
                    +
                  </Button>
                </Dropdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

import { AppstoreOutlined, CalendarOutlined, ClockCircleOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Checkbox, Col, DatePicker, Divider, Empty, Input, Modal, Progress, Row, Select, Space, Table, Tooltip, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import { formatActivityFieldDisplay } from '../tasks/projectTaskAdapter'
import { formatAuditZh } from '../targets'
import { formatTargetAttachmentSize, TargetAttachmentFileIcon } from '../targets/targetAttachmentUi'
import type { ProjectOverviewReminderModalsProps } from './ProjectOverviewReminderModals'
import { ProjectOverviewReminderModals } from './ProjectOverviewReminderModals'
import { formatDateText, formatDateTime, parseDateValue, PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE, stripHtmlToPlain } from './projectOverviewDisplayUtils'
import type { OverviewEditingField, OverviewMemberRecord, OverviewTaskStats, ProjectOverviewActivityItem, ProjectOverviewAttachmentItem, ProjectOverviewInfo } from './overviewTypes'

export type ProjectOverviewTabViewProps = {
  readonlyBlockStyle?: CSSProperties
  project: Pick<ProjectSummary, 'image' | 'createdAt' | 'updatedAt'>
  projectReadonly: boolean
  canConfigureOverviewReminders: boolean
  canEditProjectBasicFields: boolean
  canEditProjectStatusFields: boolean
  canManageProjectMembers: boolean
  projectOverview: ProjectOverviewInfo
  editingOverviewField: OverviewEditingField
  setEditingOverviewField: Dispatch<SetStateAction<OverviewEditingField>>
  overviewTitleDraft: string
  setOverviewTitleDraft: Dispatch<SetStateAction<string>>
  onBeginEditOverviewTitle: () => void
  finishOverviewTitleEdit: () => void
  overviewDescriptionDraft: string
  setOverviewDescriptionDraft: Dispatch<SetStateAction<string>>
  finishOverviewDescriptionEdit: () => void
  onBeginEditOverviewDescription: () => void
  onOverviewStartDatePick: (date: Dayjs | null) => void
  onOverviewEndDatePick: (date: Dayjs | null) => void
  members: OverviewMemberRecord[]
  memberColumns: ColumnsType<OverviewMemberRecord>
  addMemberModalEl: ReactNode
  memberRoleModalOpen: boolean
  setMemberRoleModalOpen: Dispatch<SetStateAction<boolean>>
  memberRoleTarget: OverviewMemberRecord | null
  setMemberRoleTarget: Dispatch<SetStateAction<OverviewMemberRecord | null>>
  memberRoleDraft: '管理员' | '只读成员' | '普通成员'
  setMemberRoleDraft: Dispatch<SetStateAction<'管理员' | '只读成员' | '普通成员'>>
  handleConfirmMemberRole: () => void
  onOpenAddMemberModal: () => void
  projectAttachments: ProjectOverviewAttachmentItem[]
  addProjectAttachmentFromFile: (file: File) => void
  triggerDownloadProjectAttachment: (item: ProjectOverviewAttachmentItem) => void
  removeProjectAttachmentItem: (id: string) => void
  projectOverviewActivityRecords: ProjectOverviewActivityItem[]
  visibleProjectOverviewActivityRecords: ProjectOverviewActivityItem[]
  hasMoreProjectOverviewActivity: boolean
  overviewActivityVisibleCount: number
  setOverviewActivityVisibleCount: Dispatch<SetStateAction<number>>
  isEditingStatusDescription: boolean
  overviewStatusDescriptionDraft: string
  setOverviewStatusDescriptionDraft: Dispatch<SetStateAction<string>>
  onBeginEditStatusDescription: () => void
  finishOverviewStatusDescriptionEdit: () => void
  commitOverviewStatusField: (patch: Partial<Pick<ProjectOverviewInfo, 'progressStatus' | 'healthStatus'>>) => void
  commitOverviewOwner: (owner: string) => void
  overviewTaskStats: OverviewTaskStats
  overviewActualGoalProgressPercent: number
  projectServerAudit: { createdAt: string; updatedAt: string } | null
  taskManageEditorModalEl: ReactNode
} & ProjectOverviewReminderModalsProps

export function ProjectOverviewTabView({
  readonlyBlockStyle,
  project,
  projectReadonly,
  canConfigureOverviewReminders,
  canEditProjectBasicFields,
  canEditProjectStatusFields,
  canManageProjectMembers,
  projectOverview,
  editingOverviewField,
  setEditingOverviewField,
  overviewTitleDraft,
  setOverviewTitleDraft,
  onBeginEditOverviewTitle,
  finishOverviewTitleEdit,
  overviewDescriptionDraft,
  setOverviewDescriptionDraft,
  finishOverviewDescriptionEdit,
  onBeginEditOverviewDescription,
  onOverviewStartDatePick,
  onOverviewEndDatePick,
  members,
  memberColumns,
  addMemberModalEl,
  memberRoleModalOpen,
  setMemberRoleModalOpen,
  memberRoleTarget,
  setMemberRoleTarget,
  memberRoleDraft,
  setMemberRoleDraft,
  handleConfirmMemberRole,
  onOpenAddMemberModal,
  projectAttachments,
  addProjectAttachmentFromFile,
  triggerDownloadProjectAttachment,
  removeProjectAttachmentItem,
  projectOverviewActivityRecords,
  visibleProjectOverviewActivityRecords,
  hasMoreProjectOverviewActivity,
  setOverviewActivityVisibleCount,
  isEditingStatusDescription,
  overviewStatusDescriptionDraft,
  setOverviewStatusDescriptionDraft,
  onBeginEditStatusDescription,
  finishOverviewStatusDescriptionEdit,
  commitOverviewStatusField,
  commitOverviewOwner,
  overviewTaskStats,
  overviewActualGoalProgressPercent,
  projectServerAudit,
  taskManageEditorModalEl,
  overviewReminderSettingsOpen,
  setOverviewReminderSettingsOpen,
  overviewReminderEditorOpen,
  setOverviewReminderEditorOpen,
  overviewReminderEditingId,
  setOverviewReminderEditingId,
  overviewReminderForm,
  overviewReminderAnchorDatesReady,
  projectOverviewReminders,
  setProjectOverviewReminders,
  overviewReminderTableColumns,
  membersWithEmailCount,
  flushWorkspaceNow
}: ProjectOverviewTabViewProps) {
  return (
    <>
      <div className="wt-project-detail" style={readonlyBlockStyle}>
        <div className="wt-project-detail__titlebar">
          <Typography.Text>项目概览</Typography.Text>
          <Space>
            <Tooltip title={projectReadonly ? '当前为只读，无法配置提醒' : canConfigureOverviewReminders ? '自定义系统消息 / 邮件提醒（写入项目工作区，由服务端定时扫描投递）' : '查看提醒规则；修改需「项目权限 · 基本设置」'}>
              <span>
                <Button type="default" icon={<ClockCircleOutlined />} disabled={projectReadonly} onClick={() => setOverviewReminderSettingsOpen(true)}>
                  提醒
                </Button>
              </span>
            </Tooltip>
          </Space>
        </div>

        <div className="wt-project-detail__body">
          <div className="wt-project-detail__main">
            <Card variant="borderless" className="wt-panel">
              <div className="wt-project-hero">
                <div className="wt-project-hero__head-row">
                  <div className="wt-project-hero__cover" style={project.image ? { background: `url(${project.image}) center/cover no-repeat` } : undefined}>
                    {!project.image && <AppstoreOutlined className="wt-project-hero__cover-icon" />}
                  </div>
                  <div className="wt-project-hero__title-block">
                    <Typography.Title level={2} ellipsis={{ tooltip: projectOverview.title }}>
                      {editingOverviewField === 'title' ? (
                        <Input
                          autoFocus
                          size="small"
                          value={overviewTitleDraft}
                          onChange={e => setOverviewTitleDraft(e.target.value)}
                          onBlur={finishOverviewTitleEdit}
                          onPressEnter={finishOverviewTitleEdit}
                          style={{ maxWidth: 560, width: '100%' }}
                        />
                      ) : (
                        <span style={{ cursor: canEditProjectBasicFields ? 'text' : 'default' }} onClick={() => canEditProjectBasicFields && onBeginEditOverviewTitle()}>
                          {projectOverview.title}
                        </span>
                      )}
                    </Typography.Title>
                  </div>
                </div>
                <div className="wt-project-hero__info-grid">
                  <div className="wt-hero-field">
                    <Avatar style={{ background: '#ffccc7', color: '#cf1322' }}>{(projectOverview.owner || '—').slice(0, 2)}</Avatar>
                    <div>
                      {editingOverviewField === 'owner' ? (
                        <Select
                          autoFocus
                          size="small"
                          value={projectOverview.owner}
                          style={{ minWidth: 160 }}
                          onBlur={() => setEditingOverviewField(null)}
                          onChange={value => {
                            commitOverviewOwner(value)
                            setEditingOverviewField(null)
                          }}
                          options={members.map(member => ({
                            value: member.name,
                            label: member.name
                          }))}
                        />
                      ) : (
                        <Typography.Text style={{ cursor: canEditProjectStatusFields ? 'pointer' : 'default' }} onClick={() => canEditProjectStatusFields && setEditingOverviewField('owner')}>
                          {projectOverview.owner}
                        </Typography.Text>
                      )}
                      <div className="wt-muted">负责人</div>
                    </div>
                  </div>
                  <div className="wt-hero-field">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    <div>
                      {editingOverviewField === 'startDate' ? (
                        <DatePicker
                          autoFocus
                          open
                          size="small"
                          value={parseDateValue(projectOverview.startDate)}
                          format="YYYY年M月D日"
                          onChange={onOverviewStartDatePick}
                          onOpenChange={open => {
                            if (!open) setEditingOverviewField(null)
                          }}
                        />
                      ) : (
                        <Typography.Text style={{ cursor: canEditProjectStatusFields ? 'text' : 'default' }} onClick={() => canEditProjectStatusFields && setEditingOverviewField('startDate')}>
                          {formatDateText(projectOverview.startDate)}
                        </Typography.Text>
                      )}
                      <div className="wt-muted">开始时间</div>
                    </div>
                  </div>
                  <div className="wt-hero-field">
                    <span className="wt-target-editor__meta-date-ring" aria-hidden>
                      <CalendarOutlined />
                    </span>
                    <div>
                      {editingOverviewField === 'endDate' ? (
                        <DatePicker
                          autoFocus
                          open
                          size="small"
                          value={parseDateValue(projectOverview.endDate)}
                          format="YYYY年M月D日"
                          onChange={onOverviewEndDatePick}
                          onOpenChange={open => {
                            if (!open) setEditingOverviewField(null)
                          }}
                        />
                      ) : (
                        <Typography.Text style={{ cursor: canEditProjectStatusFields ? 'text' : 'default' }} onClick={() => canEditProjectStatusFields && setEditingOverviewField('endDate')}>
                          {formatDateText(projectOverview.endDate)}
                        </Typography.Text>
                      )}
                      <div className="wt-muted">截止时间</div>
                    </div>
                  </div>
                </div>
                <div className="wt-project-hero__desc">
                  <Typography.Text type="secondary">项目描述</Typography.Text>
                  {editingOverviewField === 'description' ? (
                    <div style={{ marginTop: 8 }}>
                      <Input.TextArea autoFocus rows={5} maxLength={5000} showCount value={overviewDescriptionDraft} onChange={e => setOverviewDescriptionDraft(e.target.value)} onBlur={finishOverviewDescriptionEdit} placeholder="请输入项目描述（纯文本）" />
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 8,
                        marginBottom: 0,
                        minHeight: 24,
                        whiteSpace: 'pre-wrap',
                        cursor: canEditProjectBasicFields ? 'text' : 'default'
                      }}
                      onClick={() => {
                        if (!canEditProjectBasicFields) return
                        onBeginEditOverviewDescription()
                      }}
                    >
                      {(() => {
                        const t = stripHtmlToPlain(projectOverview.description === '无' ? '' : projectOverview.description)
                        return t.trim() ? t : '无'
                      })()}
                    </div>
                  )}
                  <Typography.Text className="wt-muted" style={{ display: 'block', marginTop: 8 }}>
                    {projectServerAudit ? (
                      <>
                        创建于 {formatAuditZh(projectServerAudit.createdAt)} · 更新于 {formatAuditZh(projectServerAudit.updatedAt)}
                      </>
                    ) : (
                      <>
                        {(project.createdAt || project.updatedAt) && (
                          <>
                            创建于 {formatAuditZh(project.createdAt)} · 更新于 {formatAuditZh(project.updatedAt)}
                          </>
                        )}
                      </>
                    )}
                  </Typography.Text>
                </div>
              </div>
            </Card>

            <Card
              variant="borderless"
              className="wt-panel"
              title="成员"
              extra={
                <Space>
                  <Button type="text" icon={<PlusOutlined />} disabled={!canManageProjectMembers} onClick={onOpenAddMemberModal} />
                </Space>
              }
            >
              <div className="wt-panel-table-scroll">
                <Table<OverviewMemberRecord> columns={memberColumns} dataSource={members} pagination={false} size="small" rowKey="key" tableLayout="fixed" />
              </div>
            </Card>

            {addMemberModalEl}

            <Modal
              title="设置成员角色"
              open={memberRoleModalOpen}
              onCancel={() => {
                setMemberRoleModalOpen(false)
                setMemberRoleTarget(null)
              }}
              onOk={handleConfirmMemberRole}
              okText="确定"
              cancelText="取消"
              destroyOnHidden
            >
              <div style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 18 }}>设置成员【{memberRoleTarget?.name || '成员'}】在项目中所属的角色</div>
              <div style={{ marginBottom: 10, fontWeight: 500 }}>通用角色模式</div>
              <Checkbox.Group
                value={[memberRoleDraft]}
                onChange={values => {
                  const next = values[values.length - 1]
                  if (!next) return
                  setMemberRoleDraft(next as '管理员' | '只读成员' | '普通成员')
                }}
                style={{ width: '100%' }}
              >
                <Row gutter={[24, 24]}>
                  <Col span={8}>
                    <Checkbox value="管理员">管理员</Checkbox>
                  </Col>
                  <Col span={8}>
                    <Checkbox value="只读成员">只读成员</Checkbox>
                  </Col>
                  <Col span={8}>
                    <Checkbox value="普通成员">普通成员</Checkbox>
                  </Col>
                </Row>
              </Checkbox.Group>
            </Modal>

            <Card
              variant="borderless"
              className="wt-panel"
              styles={{ body: { overflow: 'hidden', minWidth: 0 } }}
              title="附件"
              extra={
                <Upload
                  disabled={!canEditProjectStatusFields}
                  multiple
                  showUploadList={false}
                  beforeUpload={file => {
                    addProjectAttachmentFromFile(file)
                    return false
                  }}
                >
                  <Button type="text" disabled={projectReadonly} icon={<PlusOutlined />}>
                    添加附件
                  </Button>
                </Upload>
              }
            >
              {projectAttachments.length === 0 ? (
                <div className="wt-attachments-empty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从未有附件" />
                </div>
              ) : (
                <div className="wt-target-attachment-list">
                  {projectAttachments.map(item => (
                    <div key={item.id} className="wt-target-attachment-row">
                      <TargetAttachmentFileIcon name={item.name} />
                      <div className="wt-target-attachment-row__body">
                        <div className="wt-target-attachment-row__name">{item.name}</div>
                        <div className="wt-target-attachment-row__meta">
                          {formatTargetAttachmentSize(item.sizeBytes)} 来自 {item.uploader} | {formatDateTime(item.createdAt)}
                        </div>
                      </div>
                      <div className="wt-target-attachment-row__actions" style={{ opacity: 1 }}>
                        <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => triggerDownloadProjectAttachment(item)} />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeProjectAttachmentItem(item.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card variant="borderless" className="wt-panel" styles={{ body: { overflow: 'hidden', minWidth: 0 } }} title="活动记录">
              {projectOverviewActivityRecords.length === 0 ? (
                <div className="wt-attachments-empty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动记录" />
                </div>
              ) : (
                <div className="wt-target-activity">
                  {visibleProjectOverviewActivityRecords.map(item => (
                    <div key={item.id} className="wt-target-activity__item">
                      <div className="wt-target-activity__head">
                        <Avatar size={24} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 10 }}>
                          {item.actor.slice(0, 2)}
                        </Avatar>
                        <span className="wt-target-activity__actor">{item.actor}</span>
                        <span className="wt-target-activity__time">{formatDateTime(item.createdAt)}</span>
                      </div>
                      <div className="wt-target-activity__body">
                        <div className="wt-target-activity__line">{item.fieldLabel}</div>
                        <div className="wt-target-activity__change">
                          <span>{formatActivityFieldDisplay(item.fieldLabel, item.before)}</span>
                          <span className="wt-target-activity__arrow">→</span>
                          <span>{formatActivityFieldDisplay(item.fieldLabel, item.after)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMoreProjectOverviewActivity ? (
                    <div style={{ padding: '6px 0 2px', textAlign: 'center' }}>
                      <Button type="link" size="small" onClick={() => setOverviewActivityVisibleCount(c => c + PROJECT_OVERVIEW_ACTIVITY_PAGE_SIZE)}>
                        显示更多
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>

          <div className="wt-project-detail__aside">
            <Card variant="borderless" className="wt-panel wt-panel--tight">
              <Typography.Text type="secondary">状态应用</Typography.Text>
              <Divider style={{ margin: '12px 0' }} />
              <div className="wt-side-field wt-overview-select-row">
                <Typography.Text type="secondary">项目状态</Typography.Text>
                <Select
                  size="small"
                  value={projectOverview.progressStatus}
                  disabled={!canEditProjectStatusFields}
                  onChange={value =>
                    commitOverviewStatusField({
                      progressStatus: value as ProjectOverviewInfo['progressStatus']
                    })
                  }
                  options={[
                    { value: '未开始', label: '未开始' },
                    { value: '进行中', label: '进行中' },
                    { value: '验收中', label: '验收中' },
                    { value: '已完成', label: '已完成' },
                    { value: '关闭', label: '关闭' }
                  ]}
                  style={{ width: 120 }}
                />
              </div>
              <div className="wt-side-field wt-overview-select-row">
                <Typography.Text type="secondary">健康度</Typography.Text>
                <Select
                  size="small"
                  value={projectOverview.healthStatus}
                  disabled={!canEditProjectStatusFields}
                  onChange={value =>
                    commitOverviewStatusField({
                      healthStatus: value as ProjectOverviewInfo['healthStatus']
                    })
                  }
                  options={[
                    { value: '正常', label: '正常' },
                    { value: '有风险', label: '有风险' },
                    { value: '失控', label: '失控' }
                  ]}
                  style={{ width: 120 }}
                />
              </div>
              <div className="wt-side-field">
                <Typography.Text type="secondary">状态描述</Typography.Text>
              </div>
              {isEditingStatusDescription && canEditProjectStatusFields ? (
                <Input.TextArea
                  autoFocus
                  rows={3}
                  value={overviewStatusDescriptionDraft}
                  onChange={e => setOverviewStatusDescriptionDraft(e.target.value)}
                  onBlur={finishOverviewStatusDescriptionEdit}
                />
              ) : (
                <Typography.Paragraph style={{ marginBottom: 0, marginTop: 4, cursor: canEditProjectStatusFields ? 'text' : 'default' }} onClick={() => canEditProjectStatusFields && onBeginEditStatusDescription()}>
                  {projectOverview.statusDescription || '暂无状态描述'}
                </Typography.Paragraph>
              )}
            </Card>

            <Card variant="borderless" className="wt-panel wt-panel--tight">
              <Typography.Text type="secondary">任务统计</Typography.Text>
              <Divider style={{ margin: '12px 0' }} />
              <div className="wt-stats-grid">
                <div>
                  <div className="wt-muted">任务总数</div>
                  <div className="wt-stat-number">{overviewTaskStats.total}</div>
                </div>
                <div>
                  <div className="wt-muted">已完成</div>
                  <div className="wt-stat-number">{overviewTaskStats.done}</div>
                </div>
                <div>
                  <div className="wt-muted">进行中</div>
                  <div className="wt-stat-number">{overviewTaskStats.running}</div>
                </div>
                <div>
                  <div className="wt-muted">未开始</div>
                  <div className="wt-stat-number">{overviewTaskStats.notStarted}</div>
                </div>
                <div>
                  <div className="wt-muted">延期任务</div>
                  <div className="wt-stat-number">{overviewTaskStats.overdue}</div>
                </div>
                <div>
                  <div className="wt-muted">今日到期</div>
                  <div className="wt-stat-number">{overviewTaskStats.todayDue}</div>
                </div>
              </div>
              <Divider style={{ margin: '16px 0 12px' }} />
              <div className="wt-side-field">
                <div>
                  <div className="wt-muted">完成率</div>
                  <Typography.Text strong style={{ color: '#52c41a' }}>
                    {overviewTaskStats.completionRate}%
                  </Typography.Text>
                </div>
                <div>
                  <div className="wt-muted">延期率</div>
                  <Typography.Text strong style={{ color: '#ff4d4f' }}>
                    {overviewTaskStats.overdueRate}%
                  </Typography.Text>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="wt-muted" style={{ marginBottom: 8 }}>
                  实际目标进展
                </div>
                <Progress percent={Math.min(100, Math.max(0, overviewActualGoalProgressPercent))} showInfo={false} strokeColor={overviewActualGoalProgressPercent >= 100 ? '#52c41a' : '#91caff'} />
              </div>
            </Card>
          </div>
        </div>
      </div>
      <ProjectOverviewReminderModals
        overviewReminderSettingsOpen={overviewReminderSettingsOpen}
        setOverviewReminderSettingsOpen={setOverviewReminderSettingsOpen}
        overviewReminderEditorOpen={overviewReminderEditorOpen}
        setOverviewReminderEditorOpen={setOverviewReminderEditorOpen}
        overviewReminderEditingId={overviewReminderEditingId}
        setOverviewReminderEditingId={setOverviewReminderEditingId}
        overviewReminderForm={overviewReminderForm}
        overviewReminderAnchorDatesReady={overviewReminderAnchorDatesReady}
        canConfigureOverviewReminders={canConfigureOverviewReminders}
        projectOverviewReminders={projectOverviewReminders}
        setProjectOverviewReminders={setProjectOverviewReminders}
        overviewReminderTableColumns={overviewReminderTableColumns}
        membersWithEmailCount={membersWithEmailCount}
        flushWorkspaceNow={flushWorkspaceNow}
      />
      {taskManageEditorModalEl}
    </>
  )
}

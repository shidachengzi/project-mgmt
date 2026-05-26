import { Avatar, Badge, Button, Empty, Popconfirm, Select, Space, Spin, Typography } from 'antd'
import type { TabsProps } from 'antd'
import type { InAppNotificationCategory, InAppNotificationDTO } from '../../../shared/api/inAppNotificationsApi'
import { avatarColorForId, buildImHeaderRows, formatInboxTime } from '../layoutUtils'

type ImHeaderRow = ReturnType<typeof buildImHeaderRows>[number]

type BuildMessageInboxTabItemsParams = {
  showImInMessages: boolean
  imHeaderRows: ImHeaderRow[]
  imTotalUnread: number
  inboxBackend: boolean
  inboxSummary: { system: number; project: number }
  inboxLoading: boolean
  inboxSystemItems: InAppNotificationDTO[]
  inboxProjectItems: InAppNotificationDTO[]
  inboxSystemTotal: number
  inboxProjectTotal: number
  inboxReadFilter: 'all' | 'read' | 'unread'
  inboxLoadMoreTab: 'system' | 'project' | null
  setInboxReadFilter: (v: 'all' | 'read' | 'unread') => void
  loadMoreInbox: (category: 'system' | 'project') => void
  markInboxCategoryAllRead: (category: InAppNotificationCategory) => void
  clearInboxCategory: (category: InAppNotificationCategory) => void
  markInboxRead: (id: string) => void
  deleteInboxOne: (id: string) => void
  openFromInboxRow: (row: InAppNotificationDTO) => void
  clearAllChats: () => void
  clearOneChat: (peerId: string) => void
  openImPeer: (peerId: string) => void
}

function renderInboxToolbar(
  category: InAppNotificationCategory,
  totalCount: number,
  inboxReadFilter: 'all' | 'read' | 'unread',
  setInboxReadFilter: (v: 'all' | 'read' | 'unread') => void,
  markInboxCategoryAllRead: (category: InAppNotificationCategory) => void,
  clearInboxCategory: (category: InAppNotificationCategory) => void,
) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        默认显示 10 条，共 {totalCount} 条
      </Typography.Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <Select
          size="small"
          style={{ minWidth: 100 }}
          value={inboxReadFilter}
          onChange={v => setInboxReadFilter(v as 'all' | 'read' | 'unread')}
          options={[
            { value: 'all', label: '全部' },
            { value: 'unread', label: '未读' },
            { value: 'read', label: '已读' },
          ]}
        />
        <Button size="small" type="primary" onClick={() => void markInboxCategoryAllRead(category)}>
          全部已读
        </Button>
        <Popconfirm
          title="确定清除当前分类下的所有通知？"
          description="删除后不可恢复。"
          onConfirm={() => void clearInboxCategory(category)}
          okText="清除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger>
            全部清除
          </Button>
        </Popconfirm>
      </div>
    </div>
  )
}

function renderInboxList(
  items: InAppNotificationDTO[],
  markInboxRead: (id: string) => void,
  openFromInboxRow: (row: InAppNotificationDTO) => void,
  deleteInboxOne: (id: string) => void,
) {
  return (
    <div className="wt-system-message-list">
      {items.length ? (
        items.map(row => (
          <div key={row.id} className={!row.read ? 'wt-system-message-item wt-system-message-item--unread' : 'wt-system-message-item'}>
            <div className="wt-system-message-item__title-row">
              <Typography.Text strong>{row.title}</Typography.Text>
              <Space size={4} wrap>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatInboxTime(row.createdAt)}
                </Typography.Text>
                {!row.read ? (
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => void markInboxRead(row.id)}>
                    标为已读
                  </Button>
                ) : null}
                <Popconfirm
                  title="清除这条通知？"
                  description="删除后不可恢复。"
                  onConfirm={() => void deleteInboxOne(row.id)}
                  okText="清除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="link" size="small" danger style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                    清除
                  </Button>
                </Popconfirm>
              </Space>
            </div>
            {row.body ? (
              <Typography.Link
                type="secondary"
                onClick={() => {
                  if (row.taskId || row.eventId || row.projectId) void markInboxRead(row.id)
                  openFromInboxRow(row)
                }}
                style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {row.body}
              </Typography.Link>
            ) : row.taskId || row.eventId || row.projectId ? (
              <Typography.Link
                style={{ fontSize: 13 }}
                onClick={() => {
                  void markInboxRead(row.id)
                  openFromInboxRow(row)
                }}
              >
                查看详情
              </Typography.Link>
            ) : null}
          </div>
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" style={{ margin: '16px 0' }} />
      )}
    </div>
  )
}

export function buildMessageInboxTabItems(p: BuildMessageInboxTabItemsParams): TabsProps['items'] {
  const chatPane = (
    <div>
      {p.showImInMessages ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            默认展示 10 条会话
          </Typography.Text>
          <Popconfirm
            title="确定清除全部本地聊天？"
            description="将删除本机所有会话缓存与未读数，不可恢复。"
            onConfirm={() => p.clearAllChats()}
            okText="清除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger>
              全部清除
            </Button>
          </Popconfirm>
        </div>
      ) : null}
      <div className="wt-system-message-list">
        {!p.showImInMessages ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录并启用后端后即可使用即时消息" style={{ margin: '16px 0' }} />
        ) : p.imHeaderRows.length ? (
          p.imHeaderRows.map(row => (
            <div
              key={row.peerId}
              role="button"
              tabIndex={0}
              className={row.unread > 0 ? 'wt-system-message-item wt-system-message-item--unread' : 'wt-system-message-item'}
              style={{ cursor: 'pointer' }}
              onClick={() => p.openImPeer(row.peerId)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  p.openImPeer(row.peerId)
                }
              }}
            >
              <div className="wt-system-message-item__peer">
                <Avatar
                  size={32}
                  className="wt-system-message-item__peer-avatar"
                  style={{ background: row.avatarColor ?? avatarColorForId(row.peerId), color: '#fff' }}
                >
                  {row.avatarText || row.name.slice(0, 2).toUpperCase()}
                </Avatar>
                <div className="wt-system-message-item__peer-body">
                  <div className="wt-system-message-item__title-row">
                    <Typography.Text strong>{row.name}</Typography.Text>
                    <Space size={4} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                      {row.unread > 0 ? (
                        <Badge count={row.unread} size="small" />
                      ) : row.lastTs ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(row.lastTs).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography.Text>
                      ) : null}
                      <Popconfirm
                        title="清除该会话？"
                        description="删除本机该会话的聊天记录与未读。"
                        onConfirm={() => p.clearOneChat(row.peerId)}
                        okText="清除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="link" size="small" danger style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                          清除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                  {row.preview ? (
                    <Typography.Text type="secondary" className="wt-system-message-item__preview">
                      {row.preview}
                    </Typography.Text>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" style={{ margin: '16px 0' }} />
        )}
      </div>
    </div>
  )

  const systemPane = p.inboxBackend ? (
    <Spin spinning={p.inboxLoading}>
      {renderInboxToolbar('system', p.inboxSystemTotal, p.inboxReadFilter, p.setInboxReadFilter, p.markInboxCategoryAllRead, p.clearInboxCategory)}
      {renderInboxList(p.inboxSystemItems, p.markInboxRead, p.openFromInboxRow, p.deleteInboxOne)}
      {p.inboxSystemTotal > p.inboxSystemItems.length ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button size="small" loading={p.inboxLoadMoreTab === 'system'} onClick={() => void p.loadMoreInbox('system')}>
            加载更多
          </Button>
        </div>
      ) : null}
    </Spin>
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录并启用后端后展示系统通知" style={{ margin: '16px 0' }} />
  )

  const projectPane = p.inboxBackend ? (
    <Spin spinning={p.inboxLoading}>
      {renderInboxToolbar('project', p.inboxProjectTotal, p.inboxReadFilter, p.setInboxReadFilter, p.markInboxCategoryAllRead, p.clearInboxCategory)}
      {renderInboxList(p.inboxProjectItems, p.markInboxRead, p.openFromInboxRow, p.deleteInboxOne)}
      {p.inboxProjectTotal > p.inboxProjectItems.length ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button size="small" loading={p.inboxLoadMoreTab === 'project'} onClick={() => void p.loadMoreInbox('project')}>
            加载更多
          </Button>
        </div>
      ) : null}
    </Spin>
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录并启用后端后展示项目通知" style={{ margin: '16px 0' }} />
  )

  return [
    {
      key: 'system',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          系统通知
          {p.inboxBackend && p.inboxSummary.system > 0 ? <Badge count={p.inboxSummary.system} size="small" /> : null}
        </span>
      ),
      children: systemPane,
    },
    {
      key: 'project',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          项目通知
          {p.inboxBackend && p.inboxSummary.project > 0 ? <Badge count={p.inboxSummary.project} size="small" /> : null}
        </span>
      ),
      children: projectPane,
    },
    {
      key: 'chat',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          聊天
          {p.showImInMessages && p.imTotalUnread > 0 ? <Badge count={p.imTotalUnread} size="small" /> : null}
        </span>
      ),
      children: chatPane,
    },
  ]
}

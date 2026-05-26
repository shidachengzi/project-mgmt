import { MessageOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Badge, Tooltip } from 'antd'
import type { CSSProperties } from 'react'
import type { OrgMember } from '../../entities/org/model/types'

export type ContactsMemberRowProps = {
  user: OrgMember
  active: boolean
  /** 是否已连接 IM Socket（多标签页合并由服务端计数） */
  online: boolean
  /** 未读 IM 条数（对方发来且未打开对应该会话） */
  imUnreadCount?: number
  /** 是否展示聊天入口（通常不为本人） */
  showChat: boolean
  onSelect: () => void
  onOpenChat: (user: OrgMember) => void
  style?: CSSProperties
}

export function ContactsMemberRow({
  user,
  active,
  online,
  imUnreadCount = 0,
  showChat,
  onSelect,
  onOpenChat,
  style,
}: ContactsMemberRowProps) {
  return (
    <button
      type="button"
      style={style}
      className={active ? 'wt-contacts-page__member wt-contacts-page__member--active' : 'wt-contacts-page__member'}
      onClick={onSelect}
    >
      <Avatar size={24} icon={<UserOutlined />} style={user.avatarColor ? { background: user.avatarColor } : undefined}>
        {user.avatarText}
      </Avatar>
      <span className="wt-contacts-page__member-name">{user.name}</span>
      <Tooltip title={online ? '在线（已连接 IM）' : '离线'}>
        <span className="wt-contacts-page__presence" aria-hidden>
          <span className={online ? 'wt-contacts-page__presence-dot wt-contacts-page__presence-dot--online' : 'wt-contacts-page__presence-dot'} />
        </span>
      </Tooltip>
      {showChat ? (
        <span
          role="presentation"
          className="wt-contacts-page__member-chat"
          onClick={e => {
            e.stopPropagation()
            onOpenChat(user)
          }}
        >
          <Tooltip title="聊天">
            <Badge count={imUnreadCount} size="small" offset={[-2, 0]} overflowCount={99}>
              <span className="wt-contacts-page__member-chat-icon">
                <MessageOutlined />
              </span>
            </Badge>
          </Tooltip>
        </span>
      ) : (
        <span className="wt-contacts-page__member-chat wt-contacts-page__member-chat--placeholder" aria-hidden />
      )}
    </button>
  )
}

import { TeamOutlined } from '@ant-design/icons'
import { Avatar, Tooltip } from 'antd'

/** Hide meaningless status rows (e.g. 未开始→未开始) from activity / 流转 feeds. */
export function filterActivityFeedItems<T extends { fieldLabel: string; before: string; after: string }>(
  items: T[]
): T[] {
  return items.filter(item => !(item.fieldLabel === '状态' && item.before === item.after))
}

export function parseParticipantNames(s: string): string[] {
  if (!s || s === '无') return []
  return s
    .split('、')
    .map(x => x.trim())
    .filter(Boolean)
}

type ActivityParticipantActivityBodyProps = {
  before: string
  after: string
}

/** Compact activity row for 参与人: icon + avatar chips instead of long text. */
export function ActivityParticipantActivityBody({ before, after }: ActivityParticipantActivityBodyProps) {
  const beforeList = parseParticipantNames(before)
  const afterList = parseParticipantNames(after)

  return (
    <div className="wt-activity-participant-activity">
      <span className="wt-activity-participant-activity__type" title="参与人">
        <TeamOutlined />
      </span>
      <div className="wt-activity-participant-activity__cols">
        <div className="wt-activity-participant-activity__names">
          {beforeList.length === 0 ? (
            <span className="wt-activity-participant-activity__empty">无</span>
          ) : (
            beforeList.map((name, i) => (
              <Tooltip title={name} key={`b-${name}-${i}`}>
                <Avatar size={20} style={{ background: '#7b8cff', fontSize: 10 }}>
                  {name.slice(0, 2)}
                </Avatar>
              </Tooltip>
            ))
          )}
        </div>
        <span className="wt-target-activity__arrow">→</span>
        <div className="wt-activity-participant-activity__names">
          {afterList.length === 0 ? (
            <span className="wt-activity-participant-activity__empty">无</span>
          ) : (
            afterList.map((name, i) => (
              <Tooltip title={name} key={`a-${name}-${i}`}>
                <Avatar size={20} style={{ background: '#7b8cff', fontSize: 10 }}>
                  {name.slice(0, 2)}
                </Avatar>
              </Tooltip>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

import { Drawer, Tabs } from 'antd'
import type { TabsProps } from 'antd'
import type { MessageInboxTabKey } from './useMessageInbox'

type MessageInboxDrawerProps = {
  open: boolean
  onClose: () => void
  activeTab: MessageInboxTabKey
  onTabChange: (key: MessageInboxTabKey) => void
  tabItems: TabsProps['items']
}

export function MessageInboxDrawer({ open, onClose, activeTab, onTabChange, tabItems }: MessageInboxDrawerProps) {
  return (
    <Drawer title="消息" placement="right" width={420} open={open} onClose={onClose}>
      <Tabs size="small" activeKey={activeTab} onChange={key => onTabChange(key as MessageInboxTabKey)} items={tabItems} />
    </Drawer>
  )
}

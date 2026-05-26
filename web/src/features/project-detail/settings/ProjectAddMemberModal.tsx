import { CloseOutlined } from '@ant-design/icons'
import { Avatar, Button, Checkbox, Empty, Input, Modal, Space, Tabs, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import type { ProjectMemberRecord } from './projectMemberRole'

export type ProjectAddMemberModalProps = {
  open: boolean
  projectOwnerName: string
  addMemberSearch: string
  setAddMemberSearch: (v: string) => void
  addMemberTab: '成员' | '部门' | '用户组'
  setAddMemberTab: (v: '成员' | '部门' | '用户组') => void
  addMemberSelectedKeys: string[]
  setAddMemberSelectedKeys: (keys: string[]) => void
  availableContactMembersForAdd: ProjectMemberRecord[]
  addMemberDeptTreeData: DataNode[]
  selectedContactsForAdd: ProjectMemberRecord[]
  onToggleKey: (key: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function ProjectAddMemberModal({
  open,
  projectOwnerName,
  addMemberSearch,
  setAddMemberSearch,
  addMemberTab,
  setAddMemberTab,
  addMemberSelectedKeys,
  setAddMemberSelectedKeys,
  availableContactMembersForAdd,
  addMemberDeptTreeData,
  selectedContactsForAdd,
  onToggleKey,
  onClose,
  onSubmit
}: ProjectAddMemberModalProps) {
  const resetAndClose = () => {
    onClose()
    setAddMemberSearch('')
    setAddMemberTab('成员')
    setAddMemberSelectedKeys([])
  }

  return (
    <Modal
      open={open}
      title="选择成员"
      width={980}
      destroyOnHidden
      onCancel={resetAndClose}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          取消
        </Button>,
        <Button key="ok" type="primary" disabled={addMemberSelectedKeys.length === 0} onClick={onSubmit}>
          确定
        </Button>
      ]}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div style={{ borderRight: '1px solid #f0f0f0', paddingRight: 12 }}>
          <Input.Search value={addMemberSearch} onChange={e => setAddMemberSearch(e.target.value)} placeholder="搜索成员" allowClear style={{ marginBottom: 12 }} />
          <Tabs
            activeKey={addMemberTab}
            onChange={key => setAddMemberTab(key as '成员' | '部门' | '用户组')}
            items={[
              { key: '成员', label: '成员' },
              { key: '部门', label: '部门' },
              { key: '用户组', label: '用户组' }
            ]}
          />
          <div style={{ marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
            {availableContactMembersForAdd.length === 0 ? (
              <div style={{ padding: 16 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
              </div>
            ) : addMemberTab === '部门' ? (
              <Tree
                checkable
                blockNode
                checkStrictly
                defaultExpandAll
                treeData={addMemberDeptTreeData}
                checkedKeys={addMemberSelectedKeys}
                onCheck={checkedKeys => {
                  if (Array.isArray(checkedKeys)) {
                    setAddMemberSelectedKeys(checkedKeys as string[])
                    return
                  }
                  const leafKeys = checkedKeys.checked.filter(key => !String(key).startsWith('dept:'))
                  setAddMemberSelectedKeys(leafKeys as string[])
                }}
              />
            ) : (
              availableContactMembersForAdd.map(c => {
                const checked = addMemberSelectedKeys.includes(c.key)
                return (
                  <div
                    key={c.key}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: checked ? '#f5f5ff' : undefined
                    }}
                    onClick={() => onToggleKey(c.key)}
                  >
                    <Space size={10}>
                      <Avatar
                        size={32}
                        style={{
                          background: checked ? '#e9eaff' : '#fff',
                          color: '#1677ff',
                          border: '1px solid #91caff'
                        }}
                      >
                        {c.name.slice(0, 2)}
                      </Avatar>
                      <div>
                        <div style={{ fontWeight: 500, lineHeight: '18px' }}>
                          {c.name}
                          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                            ({c.name === projectOwnerName ? '我自己' : c.dept})
                          </Typography.Text>
                        </div>
                      </div>
                    </Space>
                    <Checkbox
                      checked={checked}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        e.stopPropagation()
                        onToggleKey(c.key)
                      }}
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div>
          <Typography.Text type="secondary">已选中：{addMemberSelectedKeys.length}</Typography.Text>
          <div style={{ marginTop: 12, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
            {selectedContactsForAdd.length === 0 ? (
              <div style={{ padding: 16 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已选择成员" />
              </div>
            ) : (
              selectedContactsForAdd.map(c => (
                <div
                  key={c.key}
                  style={{
                    padding: '10px 8px',
                    borderBottom: '1px solid #f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10
                  }}
                >
                  <Space size={10}>
                    <Avatar size={28} style={{ background: '#ffccc7', color: '#cf1322', fontSize: 12 }}>
                      {c.name.slice(0, 2)}
                    </Avatar>
                    <div>
                      <div style={{ fontWeight: 500, lineHeight: '18px' }}>{c.name}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {c.role}
                      </Typography.Text>
                    </div>
                  </Space>
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={e => {
                      e.stopPropagation()
                      onToggleKey(c.key)
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

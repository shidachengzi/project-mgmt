import { App, Avatar, Button, Checkbox, Dropdown, Form, Input, Modal, Select, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrgStore } from '../../../entities/org/model/useOrgStore'
import type { OrgMember } from '../../../entities/org/model/types'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { putAdminUserSystemRole } from '../../../shared/api/adminOrgApi'
import {
  fetchAdminSystemRolesSnapshot,
  postAdminSystemRole,
  postAdminSystemRoleGroup,
  putAdminRolePermissions,
} from '../../../shared/api/adminSystemRolesApi'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'

type RoleItem = {
  key: string
  name: string
  note: string
  isDefault: boolean
  group: string
}

type DataScope = 'all' | 'dept' | 'self'

const BUILTIN_ROLE_META: Record<string, { note: string }> = {
  owner: { note: '所有者' },
  admin: { note: '管理员' },
  member: { note: '成员' },
}

const roleMemberTablePagination = {
  defaultPageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`,
  hideOnSinglePage: false,
}

export function AdminRolesPanel() {
  const { message } = App.useApp()
  const backendOrg = isBackendAuthEnabled()
  const bootstrap = useBackendDataStore(s => s.bootstrap)

  const defaultRoles: RoleItem[] = useMemo(
    () => [
      { key: 'owner', name: '所有者', note: '所有者', isDefault: true, group: 'default' },
      { key: 'admin', name: '管理员', note: '管理员', isDefault: true, group: 'default' },
      { key: 'member', name: '成员', note: '成员', isDefault: true, group: 'default' }
    ],
    []
  )
  const rolesPayload = useOrgStore(s => s.rolesPayload)
  const setRolesPayload = useOrgStore(s => s.setRolesPayload)

  const [roles, setRoles] = useState<RoleItem[]>(() => {
    const loaded = rolesPayload?.roles?.length ? (rolesPayload.roles as RoleItem[]) : defaultRoles
    const migrated = loaded
      .map(r => ({
        ...r,
        group: (r as RoleItem).group ?? ((r as RoleItem).isDefault ? 'default' : 'job')
      }))
      .filter(r => Boolean(r.group))
    const keySet = new Set(migrated.map(r => r.key))
    const ensured = [...migrated]
    defaultRoles.forEach(dr => {
      if (!keySet.has(dr.key)) ensured.unshift(dr)
    })
    return ensured
  })

  const [activeRoleKey, setActiveRoleKey] = useState<string>(() => roles[0]?.key ?? 'owner')
  const [activeTab, setActiveTab] = useState<'members' | 'perm'>('members')
  const [customGroups, setCustomGroups] = useState<string[]>(() => {
    const groups = (rolesPayload.groups ?? ['job']).filter(g => g && g !== 'default')
    return Array.from(new Set(groups))
  })
  /** 后端返回的分组 key / 展示名（用于职务外分组的标题） */
  const [remoteGroups, setRemoteGroups] = useState<{ key: string; name: string }[]>([])
  const groupTitle = useCallback(
    (k: string) => (k === 'job' ? '职务' : remoteGroups.find(x => x.key === k)?.name ?? k),
    [remoteGroups],
  )
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({ default: true, job: false })

  const [membersByRole, setMembersByRole] = useState<Record<string, string[]>>(() => {
    return rolesPayload.membersByRole ?? {}
  })

  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, string[]>>(() => {
    return rolesPayload.permissionsByRole ?? {}
  })

  const [dataScopeByRole, setDataScopeByRole] = useState<Record<string, DataScope>>(() => {
    return (rolesPayload.dataScopeByRole as Record<string, DataScope> | undefined) ?? {}
  })

  useEffect(() => {
    if (backendOrg) return
    if (!rolesPayload) return
    if (rolesPayload.roles?.length) setRoles(rolesPayload.roles as RoleItem[])
    if (rolesPayload.groups) setCustomGroups(Array.from(new Set(rolesPayload.groups.filter(g => g && g !== 'default'))))
    if (rolesPayload.membersByRole) setMembersByRole(rolesPayload.membersByRole)
    if (rolesPayload.permissionsByRole) setPermissionsByRole(rolesPayload.permissionsByRole)
    if (rolesPayload.dataScopeByRole) setDataScopeByRole(rolesPayload.dataScopeByRole as Record<string, DataScope>)
  }, [rolesPayload, backendOrg])

  const persist = (next: {
    roles?: RoleItem[]
    groups?: string[]
    membersByRole?: Record<string, string[]>
    permissionsByRole?: Record<string, string[]>
    dataScopeByRole?: Record<string, DataScope>
  }) => {
    const payload = {
      roles: next.roles ?? roles,
      groups: next.groups ?? customGroups,
      membersByRole: next.membersByRole ?? membersByRole,
      permissionsByRole: next.permissionsByRole ?? permissionsByRole,
      dataScopeByRole: next.dataScopeByRole ?? dataScopeByRole
    }
    setRolesPayload(payload)
  }

  const reloadBackendRoleData = useCallback(async () => {
    const res = await fetchAdminSystemRolesSnapshot()
    if (!res.ok) {
      message.error(res.message || '加载系统角色失败')
      await bootstrap()
      return
    }
    const groups = res.data.groups ?? []
    setRemoteGroups(groups)
    setCustomGroups(groups.filter(g => g.key !== 'default' && g.key !== 'job').map(g => g.key))

    const fromApi = res.data.roles.map(r => ({
      key: r.key,
      name: r.name,
      note: r.note?.trim() ? r.note : BUILTIN_ROLE_META[r.key]?.note ?? r.name,
      isDefault: r.isDefault ?? ['owner', 'admin', 'member'].includes(r.key),
      group: r.groupKey ?? 'default',
    }))
    setRoles(fromApi)
    setMembersByRole(prev => ({ ...prev, ...res.data.membersByRole }))
    setPermissionsByRole(prev => ({ ...prev, ...res.data.permissionsByRole }))
    setActiveRoleKey(prev => {
      const keys = fromApi.map(r => r.key)
      return keys.includes(prev) ? prev : keys[0] ?? 'owner'
    })
    await bootstrap()
  }, [bootstrap, message])

  useEffect(() => {
    if (!backendOrg) return
    void reloadBackendRoleData()
  }, [backendOrg, reloadBackendRoleData])

  const orgMembers = useOrgStore(s => s.members)
  const memberMap = useMemo(() => new Map(orgMembers.map(m => [m.id, m])), [orgMembers])

  const [addRoleOpen, setAddRoleOpen] = useState(false)
  const [roleForm] = Form.useForm<{ name: string; note: string; group: string }>()
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [groupForm] = Form.useForm<{ name: string }>()
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [editGroupForm] = Form.useForm<{ name: string }>()
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editRoleForm] = Form.useForm<{ name: string; note: string; group: string }>()
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null)
  const [hoveredRoleKey, setHoveredRoleKey] = useState<string | null>(null)

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [selectedToAddIds, setSelectedToAddIds] = useState<string[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const activeRole = useMemo(() => roles.find(r => r.key === activeRoleKey) ?? roles[0], [activeRoleKey, roles])
  /** 与左侧选中一致；避免 activeRoleKey 与 roles 不同步时用错 permissionsByRole 的 key（会导致功能权限全空） */
  const effectiveRoleKey = activeRole?.key ?? activeRoleKey

  const assignedIds = membersByRole[effectiveRoleKey] ?? []
  const assignedMembers = assignedIds.map(id => memberMap.get(id)).filter((m): m is OrgMember => Boolean(m))

  const memberColumns: ColumnsType<OrgMember> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (_v, r) => (
        <Space size={10}>
          <Avatar size={28} style={r.avatarColor ? { background: r.avatarColor } : undefined}>
            {r.avatarText || r.name.slice(0, 2).toUpperCase()}
          </Avatar>
          <span>{r.name}</span>
        </Space>
      )
    },
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140, render: (v, r) => v || r.code || '-' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 160, render: v => v || '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: v => v || '-' }
  ]

  const permGroups: { title: string; items: { key: string; label: string }[] }[] = [
    {
      title: '项目',
      items: [
        { key: 'project.create_public', label: '新建公开项目' },
        { key: 'project.create_private', label: '新建私有项目' },
        { key: 'project.manage_public', label: '管理公开项目' },
        { key: 'project.report', label: '报表' }
      ]
    },
    {
      title: '日历',
      items: [
        { key: 'calendar.create_public', label: '新建公开日历' },
        { key: 'calendar.create_private', label: '新建私有日历' },
        { key: 'calendar.manage_public', label: '管理公开日历' }
      ]
    },
    {
      title: '后台管理',
      items: [
        { key: 'member.manage', label: '管理成员' },
        { key: 'role.manage', label: '管理角色' },
        { key: 'notification.broadcast', label: '全员通知' },
        { key: 'system.config', label: '系统配置' },
      ],
    },
  ]

  const allPermissionKeys = useMemo(() => permGroups.flatMap(group => group.items.map(i => i.key)), [permGroups])
  const isOwnerRole = effectiveRoleKey === 'owner'
  const currentPerms = new Set(isOwnerRole ? allPermissionKeys : (permissionsByRole[effectiveRoleKey] ?? []))
  const checkedAllPerms = allPermissionKeys.length > 0 && allPermissionKeys.every(key => currentPerms.has(key))
  const indeterminateAllPerms = !checkedAllPerms && allPermissionKeys.some(key => currentPerms.has(key))

  const leftDefaultRoles = roles.filter(r => r.group === 'default')
  const groupsToRender = Array.from(new Set(['job', ...customGroups]))

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 12, minHeight: 0 }}>
      <div style={{ border: '1px solid #f0f0f0', background: '#fff', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <Space size={6}>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                roleForm.resetFields()
                roleForm.setFieldsValue({ group: 'job' })
                setAddRoleOpen(true)
              }}
            >
              + 新增角色
            </Button>
            <Button
              size="small"
              onClick={() => {
                groupForm.resetFields()
                setAddGroupOpen(true)
              }}
            >
              + 新增分组
            </Button>
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div
            onClick={() => setGroupOpen(prev => ({ ...prev, default: !prev.default }))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'rgba(0,0,0,0.65)', padding: '6px 2px' }}
          >
            <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{groupOpen.default ? '▾' : '▸'}</span>
            <span style={{ fontSize: 12 }}>默认</span>
          </div>
          {groupOpen.default ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 18 }}>
              {leftDefaultRoles.map(r => {
                const active = r.key === activeRoleKey
                return (
                  <div
                    key={r.key}
                    onClick={() => setActiveRoleKey(r.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: active ? '#e6f4ff' : 'transparent',
                      border: active ? '1px solid #bae0ff' : '1px solid transparent'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {groupsToRender.map(groupName => {
            const groupRoles = roles.filter(r => r.group === groupName)
            const isOpen = Boolean(groupOpen[groupName])
            return (
              <div key={groupName}>
                <div
                  onMouseEnter={() => setHoveredGroupKey(groupName)}
                  onMouseLeave={() => setHoveredGroupKey(prev => (prev === groupName ? null : prev))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 2px 6px' }}
                >
                  <div
                    onClick={() => setGroupOpen(prev => ({ ...prev, [groupName]: !isOpen }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'rgba(0,0,0,0.65)', flex: 1, minWidth: 0 }}
                  >
                    <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{isOpen ? '▾' : '▸'}</span>
                    <span style={{ fontSize: 12 }}>{groupTitle(groupName)}</span>
                  </div>
                  {groupName !== 'default' ? (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'edit',
                            label: '修改分组',
                            onClick: () => {
                              setEditingGroupKey(groupName)
                              editGroupForm.setFieldsValue({ name: groupTitle(groupName) })
                              setEditGroupOpen(true)
                            }
                          },
                          {
                            key: 'delete',
                            label: '删除分组',
                            danger: true,
                            onClick: () => {
                              if (groupName === 'job') {
                                message.warning('“职务”分组不可删除')
                                return
                              }
                              Modal.confirm({
                                title: '删除分组',
                                content: `确认删除分组「${groupTitle(groupName)}」吗？该分组下角色将移动到“职务”。`,
                                okText: '删除',
                                okButtonProps: { danger: true },
                                cancelText: '取消',
                                onOk: () => {
                                  const nextGroups = customGroups.filter(g => g !== groupName)
                                  const nextRoles = roles.map(r => (r.group === groupName ? { ...r, group: 'job' } : r))
                                  setCustomGroups(nextGroups)
                                  setRoles(nextRoles)
                                  persist({ roles: nextRoles, groups: nextGroups })
                                }
                              })
                            }
                          }
                        ]
                      }}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<span style={{ fontWeight: 700, letterSpacing: 1 }}>...</span>}
                        style={{ opacity: hoveredGroupKey === groupName ? 1 : 0, pointerEvents: hoveredGroupKey === groupName ? 'auto' : 'none' }}
                      />
                    </Dropdown>
                  ) : null}
                </div>
                {isOpen ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 18 }}>
                    {groupRoles.map(r => {
                      const active = r.key === activeRoleKey
                      return (
                        <div
                          key={r.key}
                          onClick={() => setActiveRoleKey(r.key)}
                          onMouseEnter={() => setHoveredRoleKey(r.key)}
                          onMouseLeave={() => setHoveredRoleKey(prev => (prev === r.key ? null : prev))}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            background: active ? '#e6f4ff' : 'transparent',
                            border: active ? '1px solid #bae0ff' : '1px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8
                          }}
                        >
                          <div style={{ minWidth: 0, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                          {r.group !== 'default' ? (
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: [
                                  {
                                    key: 'edit',
                                    label: '修改角色',
                                    onClick: () => {
                                      setEditingRole(r)
                                      editRoleForm.setFieldsValue({ name: r.name, note: r.note, group: r.group })
                                      setEditRoleOpen(true)
                                    }
                                  },
                                  {
                                    key: 'delete',
                                    label: '删除角色',
                                    danger: true,
                                    onClick: () => {
                                      Modal.confirm({
                                        title: '删除角色',
                                        content: `确认删除「${r.name}」吗？`,
                                        okText: '删除',
                                        okButtonProps: { danger: true },
                                        cancelText: '取消',
                                        onOk: () => {
                                          const nextRoles = roles.filter(x => x.key !== r.key)
                                          const nextMembers = { ...membersByRole }
                                          delete nextMembers[r.key]
                                          const nextPerms = { ...permissionsByRole }
                                          delete nextPerms[r.key]
                                          const nextScopes = { ...dataScopeByRole }
                                          delete nextScopes[r.key]
                                          setRoles(nextRoles)
                                          setMembersByRole(nextMembers)
                                          setPermissionsByRole(nextPerms)
                                          setDataScopeByRole(nextScopes)
                                          persist({ roles: nextRoles, membersByRole: nextMembers, permissionsByRole: nextPerms, dataScopeByRole: nextScopes })
                                          if (activeRoleKey === r.key) setActiveRoleKey(nextRoles[0]?.key ?? 'owner')
                                          message.success('角色已删除')
                                        }
                                      })
                                    }
                                  },
                                  {
                                    key: 'move',
                                    label: '移动分组',
                                    children: groupsToRender
                                      .filter(g => g !== 'default' && g !== r.group)
                                      .map(g => ({
                                        key: `move-${g}`,
                                        label: groupTitle(g),
                                        onClick: () => {
                                          const nextRoles = roles.map(x => (x.key === r.key ? { ...x, group: g } : x))
                                          setRoles(nextRoles)
                                          persist({ roles: nextRoles })
                                        }
                                      }))
                                  }
                                ]
                              }}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<span style={{ fontWeight: 700, letterSpacing: 1 }}>...</span>}
                                onClick={e => e.stopPropagation()}
                                style={{ opacity: hoveredRoleKey === r.key ? 1 : 0, pointerEvents: hoveredRoleKey === r.key ? 'auto' : 'none' }}
                              />
                            </Dropdown>
                          ) : null}
                        </div>
                      )
                    })}
                    {!groupRoles.length ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无角色</Typography.Text> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ border: '1px solid #f0f0f0', background: '#fff', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeRole?.name ?? '角色'}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', marginTop: 4, lineHeight: 1.5, fontSize: 12 }}>
              角色管理控制成员在系统中的操作权限与数据范围，可用于给成员分配不同的权限。
            </div>
          </div>
        </div>

        <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 24, borderBottom: '1px solid #f0f0f0', marginBottom: 12 }}>
          {[
            { key: 'members' as const, label: '角色成员' },
            { key: 'perm' as const, label: '功能权限' }
          ].map(item => {
            const active = activeTab === item.key
            return (
              <span
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                style={{
                  cursor: 'pointer',
                  fontSize: 13,
                  color: active ? '#1677ff' : 'rgba(0,0,0,0.65)',
                  borderBottom: active ? '2px solid #1677ff' : '2px solid transparent',
                  height: 38,
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {item.label}
              </span>
            )
          })}
        </div>

        {activeTab === 'members' ? (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <Space>
                {selectedMemberIds.length > 0 ? (
                  <Button
                    danger
                    onClick={() => {
                      if (backendOrg) {
                        void (async () => {
                          for (const uid of selectedMemberIds) {
                            const res = await putAdminUserSystemRole(uid, 'member')
                            if (!res.ok) {
                              message.error(res.message)
                              return
                            }
                          }
                          setSelectedMemberIds([])
                          message.success('已从当前角色移除并设为普通成员')
                          await reloadBackendRoleData()
                        })()
                        return
                      }
                      const selectedSet = new Set(selectedMemberIds)
                      const nextIds = (membersByRole[effectiveRoleKey] ?? []).filter(id => !selectedSet.has(id))
                      const next = { ...membersByRole, [effectiveRoleKey]: nextIds }
                      setMembersByRole(next)
                      setSelectedMemberIds([])
                      persist({ membersByRole: next })
                      message.success('已批量删除成员')
                    }}
                  >
                    批量删除
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  onClick={() => {
                    setSelectedToAddIds(membersByRole[effectiveRoleKey] ?? [])
                    setAddMemberOpen(true)
                  }}
                >
                  + 添加成员
                </Button>
              </Space>
            </div>
            <Table
              rowKey="id"
              className="wt-console-table"
              columns={memberColumns}
              dataSource={assignedMembers}
              pagination={{ ...roleMemberTablePagination }}
              bordered={false}
              rowSelection={{
                selectedRowKeys: selectedMemberIds,
                onChange: keys => setSelectedMemberIds(keys.map(k => String(k)))
              }}
              scroll={{ y: 'calc(100vh - 320px)' }}
            />
          </div>
        ) : null}

        {activeTab === 'perm' ? (
          <div style={{ overflow: 'auto', minHeight: 0, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Typography.Text type="secondary">设置角色对应的功能操作权限</Typography.Text>
              <Checkbox
                disabled={isOwnerRole}
                checked={checkedAllPerms}
                indeterminate={indeterminateAllPerms}
                onChange={e => {
                  if (isOwnerRole) return
                  const checked = e.target.checked
                  const next = {
                    ...permissionsByRole,
                    [effectiveRoleKey]: checked ? [...allPermissionKeys] : []
                  }
                  setPermissionsByRole(next)
                  if (backendOrg && !isOwnerRole) {
                    void (async () => {
                      const res = await putAdminRolePermissions(effectiveRoleKey, next[effectiveRoleKey] ?? [])
                      if (!res.ok) message.error(res.message)
                      else await reloadBackendRoleData()
                    })()
                  } else persist({ permissionsByRole: next })
                }}
              >
                全选
              </Checkbox>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #f0f0f0' }}>
              <tbody>
                {permGroups.map(group => {
                  const selectedCount = group.items.filter(i => currentPerms.has(i.key)).length
                  const groupChecked = selectedCount === group.items.length && group.items.length > 0
                  const groupIndeterminate = selectedCount > 0 && selectedCount < group.items.length
                  return (
                    <tr key={group.title} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ width: 110, background: '#fafafa', borderRight: '1px solid #f0f0f0', padding: '14px 12px', verticalAlign: 'top' }}>
                        <Checkbox
                          disabled={isOwnerRole}
                          checked={groupChecked}
                          indeterminate={groupIndeterminate}
                          onChange={e => {
                            if (isOwnerRole) return
                            const checked = e.target.checked
                            const nextSet = new Set(permissionsByRole[effectiveRoleKey] ?? [])
                            group.items.forEach(i => nextSet.delete(i.key))
                            if (checked) group.items.forEach(i => nextSet.add(i.key))
                            const next = { ...permissionsByRole, [effectiveRoleKey]: Array.from(nextSet) }
                            setPermissionsByRole(next)
                            if (backendOrg && !isOwnerRole) {
                              void (async () => {
                                const res = await putAdminRolePermissions(effectiveRoleKey, next[effectiveRoleKey] ?? [])
                                if (!res.ok) message.error(res.message)
                                else await reloadBackendRoleData()
                              })()
                            } else persist({ permissionsByRole: next })
                          }}
                        >
                          {group.title}
                        </Checkbox>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))',
                            gap: '10px 20px'
                          }}
                        >
                          {group.items.map(item => (
                            <Checkbox
                              key={item.key}
                              disabled={isOwnerRole}
                              checked={currentPerms.has(item.key)}
                              onChange={e => {
                                if (isOwnerRole) return
                                const checked = e.target.checked
                                const nextSet = new Set(permissionsByRole[effectiveRoleKey] ?? [])
                                if (checked) nextSet.add(item.key)
                                else nextSet.delete(item.key)
                                const next = { ...permissionsByRole, [effectiveRoleKey]: Array.from(nextSet) }
                                setPermissionsByRole(next)
                                if (backendOrg && !isOwnerRole) {
                                  void (async () => {
                                    const res = await putAdminRolePermissions(effectiveRoleKey, next[effectiveRoleKey] ?? [])
                                    if (!res.ok) message.error(res.message)
                                    else await reloadBackendRoleData()
                                  })()
                                } else persist({ permissionsByRole: next })
                              }}
                            >
                              {item.label}
                            </Checkbox>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <Modal
        open={addGroupOpen}
        title="新增分组"
        okText="确定"
        cancelText="取消"
        onCancel={() => setAddGroupOpen(false)}
        onOk={async () => {
          try {
            const v = await groupForm.validateFields()
            const name = String(v.name ?? '').trim()
            if (!name) return
            if (name === '默认') {
              message.warning('“默认”为系统分组，不可新增')
              return
            }
            if (backendOrg) {
              const res = await postAdminSystemRoleGroup({ name })
              if (!res.ok) {
                message.error(res.message)
                return
              }
              await reloadBackendRoleData()
              setGroupOpen(prev => ({ ...prev, [res.data.key]: true }))
              setAddGroupOpen(false)
              message.success('分组已创建')
              return
            }
            const key = name === '职务' ? 'job' : name
            if (key === 'default') {
              message.warning('分组名称不可用')
              return
            }
            if (customGroups.includes(key)) {
              message.warning('分组已存在')
              return
            }
            const nextGroups = [...customGroups, key]
            setCustomGroups(nextGroups)
            setGroupOpen(prev => ({ ...prev, [key]: true }))
            persist({ groups: nextGroups })
            setAddGroupOpen(false)
            message.success('分组已创建')
          } catch {
            // ignore
          }
        }}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item label="分组名称" name="name" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="请输入分组名称（如 职务）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={addRoleOpen}
        title="新增角色"
        okText="确定"
        cancelText="取消"
        onCancel={() => setAddRoleOpen(false)}
        onOk={async () => {
          try {
            const v = await roleForm.validateFields()
            const name = String(v.name ?? '').trim()
            const note = String(v.note ?? '').trim()
            const group = String(v.group ?? 'job').trim() || 'job'
            if (!name) return
            if (backendOrg) {
              const res = await postAdminSystemRole({
                name,
                groupKey: group,
                note: note || null,
              })
              if (!res.ok) {
                message.error(res.message)
                return
              }
              await reloadBackendRoleData()
              setActiveRoleKey(res.data.key)
              setActiveTab('members')
              setAddRoleOpen(false)
              message.success('角色已创建')
              return
            }
            const key = `role-${Date.now()}`
            const nextRoles = [...roles, { key, name, note: note || name, isDefault: false, group }]
            const nextGroups = group === 'default' ? customGroups : customGroups.includes(group) ? customGroups : [...customGroups, group]
            setRoles(nextRoles)
            setCustomGroups(nextGroups)
            setGroupOpen(prev => ({ ...prev, [group]: true }))
            persist({ roles: nextRoles, groups: nextGroups })
            setActiveRoleKey(key)
            setActiveTab('members')
            setAddRoleOpen(false)
            message.success('角色已创建')
          } catch {
            // ignore
          }
        }}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item label="角色名" name="name" rules={[{ required: true, message: '请输入角色名' }]}>
            <Input placeholder="请输入角色名" />
          </Form.Item>
          <Form.Item label="角色组" name="group" initialValue="job" rules={[{ required: true, message: '请选择角色组' }]}>
            <Select
              options={groupsToRender
                .map(g => ({
                  value: g,
                  label: groupTitle(g)
                }))
                .filter(o => o.value !== 'default')}
            />
          </Form.Item>
          <Form.Item label="描述" name="note">
            <Input.TextArea rows={4} placeholder="" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={editGroupOpen}
        title="修改分组"
        okText="确定"
        cancelText="取消"
        onCancel={() => {
          setEditGroupOpen(false)
          setEditingGroupKey(null)
        }}
        onOk={async () => {
          try {
            const v = await editGroupForm.validateFields()
            const nextName = String(v.name ?? '').trim()
            const oldName = editingGroupKey
            if (!oldName || !nextName || oldName === 'default') return
            if (nextName === 'default' || (nextName !== oldName && customGroups.includes(nextName))) {
              message.warning('分组名称不可用或已存在')
              return
            }
            const nextGroups = customGroups.map(g => (g === oldName ? nextName : g))
            const nextRoles = roles.map(r => (r.group === oldName ? { ...r, group: nextName } : r))
            setCustomGroups(nextGroups)
            setRoles(nextRoles)
            setGroupOpen(prev => {
              const next = { ...prev }
              next[nextName] = next[oldName] ?? true
              delete next[oldName]
              return next
            })
            persist({ roles: nextRoles, groups: nextGroups })
            setEditGroupOpen(false)
            setEditingGroupKey(null)
            message.success('分组已修改')
          } catch {
            // ignore
          }
        }}
      >
        <Form form={editGroupForm} layout="vertical">
          <Form.Item label="分组名称" name="name" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={editRoleOpen}
        title="修改角色"
        okText="确定"
        cancelText="取消"
        onCancel={() => {
          setEditRoleOpen(false)
          setEditingRole(null)
        }}
        onOk={async () => {
          if (!editingRole || editingRole.group === 'default') return
          try {
            const v = await editRoleForm.validateFields()
            const name = String(v.name ?? '').trim()
            const note = String(v.note ?? '').trim()
            const group = String(v.group ?? editingRole.group).trim()
            if (!name) return
            const nextRoles = roles.map(r => (r.key === editingRole.key ? { ...r, name, note: note || name, group } : r))
            const nextGroups = group === 'default' ? customGroups : customGroups.includes(group) ? customGroups : [...customGroups, group]
            setRoles(nextRoles)
            setCustomGroups(nextGroups)
            setGroupOpen(prev => ({ ...prev, [group]: true }))
            persist({ roles: nextRoles, groups: nextGroups })
            setEditRoleOpen(false)
            setEditingRole(null)
            message.success('角色已修改')
          } catch {
            // ignore
          }
        }}
      >
        <Form form={editRoleForm} layout="vertical">
          <Form.Item label="角色名" name="name" rules={[{ required: true, message: '请输入角色名' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="角色组" name="group" rules={[{ required: true, message: '请选择角色组' }]}>
            <Select
              options={groupsToRender
                .map(g => ({ value: g, label: groupTitle(g) }))
                .filter(o => o.value !== 'default')}
            />
          </Form.Item>
          <Form.Item label="描述" name="note">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={addMemberOpen}
        title="添加角色成员"
        width={820}
        okText="确定"
        cancelText="取消"
        onCancel={() => setAddMemberOpen(false)}
        onOk={() => {
          if (backendOrg) {
            const rk = effectiveRoleKey
            void (async () => {
              const prev = new Set(membersByRole[rk] ?? [])
              const next = new Set(selectedToAddIds)
              for (const uid of next) {
                if (!prev.has(uid)) {
                  const res = await putAdminUserSystemRole(uid, rk)
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                }
              }
              for (const uid of prev) {
                if (!next.has(uid)) {
                  const res = await putAdminUserSystemRole(uid, 'member')
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                }
              }
              setAddMemberOpen(false)
              message.success('成员已更新')
              await reloadBackendRoleData()
            })()
            return
          }
          const next = { ...membersByRole, [effectiveRoleKey]: selectedToAddIds }
          setMembersByRole(next)
          persist({ membersByRole: next })
          setAddMemberOpen(false)
          message.success('成员已更新')
        }}
      >
        <Table
          rowKey="id"
          className="wt-console-table"
          columns={[
            {
              title: '姓名',
              dataIndex: 'name',
              key: 'name',
              render: (_v, r) => (
                <Space size={10}>
                  <Avatar size={28} style={r.avatarColor ? { background: r.avatarColor } : undefined}>
                    {r.avatarText || r.name.slice(0, 2).toUpperCase()}
                  </Avatar>
                  <span>{r.name}</span>
                </Space>
              )
            },
            { title: '用户名', dataIndex: 'username', key: 'username', width: 140, render: (v, r) => v || r.code || '-' },
            { title: '部门', dataIndex: 'department', key: 'department', width: 160, render: v => v || '-' },
            { title: '手机号', dataIndex: 'phone', key: 'phone', width: 160, render: v => v || '-' }
          ]}
          dataSource={orgMembers}
          pagination={{ ...roleMemberTablePagination, defaultPageSize: 8 }}
          bordered={false}
          rowSelection={{
            selectedRowKeys: selectedToAddIds,
            onChange: keys => setSelectedToAddIds(keys.map(k => String(k)))
          }}
          scroll={{ y: 380 }}
        />
      </Modal>
    </div>
  )
}


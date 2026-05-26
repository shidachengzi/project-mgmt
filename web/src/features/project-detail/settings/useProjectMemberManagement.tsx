import { Avatar, Space, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { DataNode } from 'antd/es/tree'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { isBackendPersonalDeskProjectId } from '../../../entities/project/lib/personalDesk'
import { useOrgStore } from '../../../entities/org/model/useOrgStore'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { fetchDirectoryUsers, type DirectoryUserDTO } from '../../../shared/api/directoryUsersApi'
import type { ProjectOverviewInfo } from '../overview/overviewTypes'
import { ProjectAddMemberModal } from './ProjectAddMemberModal'
import { mapBackendMemberRows, projectRoleKeyToLabel, projectRoleLabelToKey, type ProjectMemberRecord, type ProjectMemberRoleDraft } from './projectMemberRole'

export type UseProjectMemberManagementParams = {
  projectId: string
  projectOverview: ProjectOverviewInfo
  members: ProjectMemberRecord[]
  setMembers: Dispatch<SetStateAction<ProjectMemberRecord[]>>
  backendMemberRows: Array<{ userId: string; name: string; email: string | null; mobile: string | null; roleKey: string | null }> | undefined
  ensureMappedProjectPermission: (section: string, key: string) => boolean
  canManageProjectMembers: boolean
  appendOverviewActivityEntries: (entries: Array<{ fieldLabel: string; before: string; after: string }>) => void
  /** 新成员默认项目角色 key（来自项目角色「默认」开关，一般为 normal） */
  defaultMemberRoleKey?: 'admin' | 'normal' | 'observer'
}

export function useProjectMemberManagement({
  projectId,
  projectOverview,
  members,
  setMembers,
  backendMemberRows,
  ensureMappedProjectPermission,
  canManageProjectMembers,
  appendOverviewActivityEntries,
  defaultMemberRoleKey = 'normal'
}: UseProjectMemberManagementParams) {
  const addProjectMemberApi = useBackendDataStore(s => s.addProjectMember)
  const putMemberRoleApi = useBackendDataStore(s => s.putMemberRole)
  const removeMemberApi = useBackendDataStore(s => s.removeMember)

  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false)
  const [memberRoleModalOpen, setMemberRoleModalOpen] = useState(false)
  const [memberRoleTarget, setMemberRoleTarget] = useState<ProjectMemberRecord | null>(null)
  const [memberRoleDraft, setMemberRoleDraft] = useState<ProjectMemberRoleDraft>('普通成员')
  const [addMemberSearch, setAddMemberSearch] = useState('')
  const [addMemberTab, setAddMemberTab] = useState<'成员' | '部门' | '用户组'>('成员')
  const [addMemberSelectedKeys, setAddMemberSelectedKeys] = useState<string[]>([])
  const [backendContactList, setBackendContactList] = useState<ProjectMemberRecord[]>([])
  const orgMembers = useOrgStore(s => s.members)

  const directoryUserToContactRecord = useCallback((u: DirectoryUserDTO): ProjectMemberRecord => {
    return {
      key: u.id,
      name: u.name,
      role: '普通成员',
      dept: u.department?.name?.trim() || '未分配部门',
      action: '设定 移除'
    }
  }, [])

  const orgMemberToContactRecord = useCallback(
    (m: { id: string; name: string; department: string }): ProjectMemberRecord => ({
      key: m.id,
      name: m.name,
      role: '普通成员',
      dept: m.department?.trim() || '未分配部门',
      action: '设定 移除'
    }),
    []
  )

  useEffect(() => {
    const mapRows = (rows: Parameters<typeof mapBackendMemberRows>[0]) => mapBackendMemberRows(rows)
    const rawRows = useBackendDataStore.getState().membersRowsByProject[projectId]
    if (rawRows === undefined) {
      void useBackendDataStore
        .getState()
        .refreshProject(projectId)
        .then(() => {
          const r2 = useBackendDataStore.getState().membersRowsByProject[projectId] ?? []
          setMembers(mapRows(r2))
        })
      return
    }
    setMembers(mapRows(rawRows))
  }, [projectId, backendMemberRows, setMembers])

  const isPersonalDeskProject = isBackendPersonalDeskProjectId(projectId)

  /** 个人工作台：任务/目标负责人与参与人需选通讯录全员；进入项目即拉取，不依赖「添加成员」弹窗 */
  useEffect(() => {
    if (!isPersonalDeskProject && !addMemberModalOpen) return
    let cancel = false
    if (orgMembers.length > 0) {
      setBackendContactList(orgMembers.map(orgMemberToContactRecord))
    }
    void (async () => {
      const users = await fetchDirectoryUsers()
      if (cancel) return
      if (users?.length) {
        setBackendContactList(users.map(directoryUserToContactRecord))
      } else if (orgMembers.length > 0) {
        setBackendContactList(orgMembers.map(orgMemberToContactRecord))
      }
    })()
    return () => {
      cancel = true
    }
  }, [isPersonalDeskProject, addMemberModalOpen, directoryUserToContactRecord, orgMemberToContactRecord, orgMembers])

  useEffect(() => {
    const handler = (e: Event) => {
      if (!ensureMappedProjectPermission('项目权限', '成员管理')) return
      const detail = (e as CustomEvent).detail as { key?: string } | undefined
      const key = detail?.key
      if (!key) return
      const removedName = members.find(m => m.key === key)?.name ?? key
      void removeMemberApi(projectId, key).then(ok => {
        if (!ok) message.error('移除成员失败')
        else {
          appendOverviewActivityEntries([{ fieldLabel: '成员', before: `${removedName}（在项目中）`, after: '已移除' }])
        }
      })
    }
    window.addEventListener('pm-remove-member', handler as EventListener)
    return () => window.removeEventListener('pm-remove-member', handler as EventListener)
  }, [projectId, members, appendOverviewActivityEntries, ensureMappedProjectPermission, removeMemberApi])

  const effectiveContactPool = backendContactList

  /** 普通项目：仅项目成员；个人工作台：项目成员 + 企业通讯录 */
  const taskModalMembers = useMemo(() => {
    if (!isBackendPersonalDeskProjectId(projectId)) return members
    const byKey = new Map<string, ProjectMemberRecord>()
    for (const m of members) byKey.set(m.key, m)
    for (const c of effectiveContactPool) {
      if (!byKey.has(c.key)) {
        byKey.set(c.key, { ...c, action: '设定 移除' })
      }
    }
    return Array.from(byKey.values())
  }, [members, effectiveContactPool, projectId])

  const availableContactMembersForAdd = useMemo(() => {
    const q = addMemberSearch.trim().toLowerCase()
    return effectiveContactPool.filter(c => {
      if (members.some(m => m.key === c.key)) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || (c.dept || '').toLowerCase().includes(q)
    })
  }, [addMemberSearch, members, effectiveContactPool])

  const addMemberDeptTreeData = useMemo<DataNode[]>(() => {
    const grouped = availableContactMembersForAdd.reduce<Record<string, ProjectMemberRecord[]>>((acc, member) => {
      const dept = member.dept || '未分配部门'
      if (!acc[dept]) acc[dept] = []
      acc[dept].push(member)
      return acc
    }, {})

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
      .map(([dept, list]) => ({
        key: `dept:${dept}`,
        title: `${dept}（${list.length}）`,
        disableCheckbox: true,
        children: list.map(c => ({
          key: c.key,
          title: (
            <Space size={10}>
              <Avatar
                size={28}
                style={{
                  background: addMemberSelectedKeys.includes(c.key) ? '#e9eaff' : '#fff',
                  color: '#1677ff',
                  border: '1px solid #91caff',
                  fontSize: 12
                }}
              >
                {c.name.slice(0, 2)}
              </Avatar>
              <div>
                <div style={{ fontWeight: 500, lineHeight: '18px' }}>
                  {c.name}
                  <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    ({c.name === projectOverview.owner ? '我自己' : c.dept})
                  </Typography.Text>
                </div>
              </div>
            </Space>
          )
        }))
      }))
  }, [addMemberSelectedKeys, availableContactMembersForAdd, projectOverview.owner])

  const selectedContactsForAdd = useMemo(
    () => addMemberSelectedKeys.map(k => effectiveContactPool.find(c => c.key === k)).filter(Boolean) as ProjectMemberRecord[],
    [addMemberSelectedKeys, effectiveContactPool]
  )

  const resetAddMemberModal = useCallback(() => {
    setAddMemberModalOpen(false)
    setAddMemberSearch('')
    setAddMemberTab('成员')
    setAddMemberSelectedKeys([])
  }, [])

  const handleAddMemberSubmit = useCallback(() => {
    if (!ensureMappedProjectPermission('项目权限', '成员管理')) return
    if (addMemberSelectedKeys.length === 0) return
    const roleKey = addMemberTab === '用户组' ? 'admin' : defaultMemberRoleKey
    void (async () => {
      let anyFailed = false
      for (const c of selectedContactsForAdd) {
        const ok = await addProjectMemberApi(projectId, c.key, roleKey)
        if (!ok) anyFailed = true
      }
      await useBackendDataStore.getState().refreshProject(projectId)
      if (!anyFailed) {
        appendOverviewActivityEntries(
          selectedContactsForAdd.map(c => ({
            fieldLabel: '成员',
            before: '未加入',
            after: `已添加 ${c.name}（${projectRoleKeyToLabel(roleKey)}）`
          }))
        )
      }
      if (anyFailed) message.error('部分成员未能加入，请重试')
      else message.success('成员已添加')
      resetAddMemberModal()
    })()
  }, [
    addMemberSelectedKeys.length,
    addMemberTab,
    defaultMemberRoleKey,
    addProjectMemberApi,
    appendOverviewActivityEntries,
    ensureMappedProjectPermission,
    projectId,
    resetAddMemberModal,
    selectedContactsForAdd
  ])

  const toggleAddMemberKey = useCallback((key: string) => {
    setAddMemberSelectedKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }, [])

  const onOpenAddMemberModal = useCallback(() => {
    if (!canManageProjectMembers) return
    setAddMemberSearch('')
    setAddMemberTab('成员')
    setAddMemberSelectedKeys([])
    setAddMemberModalOpen(true)
  }, [canManageProjectMembers])

  const openMemberRoleModal = useCallback(
    (member: ProjectMemberRecord) => {
      if (!ensureMappedProjectPermission('项目权限', '成员管理')) return
      setMemberRoleTarget(member)
      setMemberRoleDraft(member.role as ProjectMemberRoleDraft)
      setMemberRoleModalOpen(true)
    },
    [ensureMappedProjectPermission]
  )

  const handleConfirmMemberRole = useCallback(() => {
    if (!ensureMappedProjectPermission('项目权限', '成员管理')) return
    if (!memberRoleTarget) return
    const nextRoleKey = projectRoleLabelToKey(memberRoleDraft)
    void (async () => {
      const ok = await putMemberRoleApi(projectId, memberRoleTarget.key, nextRoleKey)
      if (!ok) {
        message.error('更新角色失败')
        return
      }
      appendOverviewActivityEntries([
        {
          fieldLabel: '成员角色',
          before: `${memberRoleTarget.name}：${memberRoleTarget.role}`,
          after: `${memberRoleTarget.name}：${memberRoleDraft}`
        }
      ])
      setMemberRoleModalOpen(false)
      setMemberRoleTarget(null)
      message.success('成员角色已更新')
    })()
  }, [appendOverviewActivityEntries, ensureMappedProjectPermission, memberRoleDraft, memberRoleTarget, projectId, putMemberRoleApi])

  const memberColumns = useMemo<ColumnsType<ProjectMemberRecord>>(
    () => [
      {
        title: '成员',
        dataIndex: 'name',
        key: 'name',
        render: (value: string) => (
          <Space>
            <Avatar size="small" style={{ background: '#91caff', color: '#0958d9' }}>
              {value.slice(0, 2)}
            </Avatar>
            <span>{value}</span>
          </Space>
        )
      },
      { title: '角色', dataIndex: 'role', key: 'role' },
      {
        title: '操作',
        key: 'action',
        align: 'right',
        render: (_: string, record) => (
          <Space size={8}>
            <Typography.Link
              disabled={!canManageProjectMembers}
              onClick={e => {
                e.stopPropagation()
                openMemberRoleModal(record)
              }}
            >
              设置
            </Typography.Link>
            <Typography.Link
              type="danger"
              disabled={!canManageProjectMembers}
              onClick={e => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('pm-remove-member', { detail: { key: record.key } }))
              }}
            >
              移除
            </Typography.Link>
          </Space>
        )
      }
    ],
    [canManageProjectMembers, openMemberRoleModal]
  )

  const addMemberModalEl: ReactNode = (
    <ProjectAddMemberModal
      open={addMemberModalOpen}
      projectOwnerName={projectOverview.owner}
      addMemberSearch={addMemberSearch}
      setAddMemberSearch={setAddMemberSearch}
      addMemberTab={addMemberTab}
      setAddMemberTab={setAddMemberTab}
      addMemberSelectedKeys={addMemberSelectedKeys}
      setAddMemberSelectedKeys={setAddMemberSelectedKeys}
      availableContactMembersForAdd={availableContactMembersForAdd}
      addMemberDeptTreeData={addMemberDeptTreeData}
      selectedContactsForAdd={selectedContactsForAdd}
      onToggleKey={toggleAddMemberKey}
      onClose={resetAddMemberModal}
      onSubmit={handleAddMemberSubmit}
    />
  )

  return {
    addMemberModalEl,
    setAddMemberModalOpen,
    onOpenAddMemberModal,
    openMemberRoleModal,
    memberRoleModalOpen,
    setMemberRoleModalOpen,
    memberRoleTarget,
    setMemberRoleTarget,
    memberRoleDraft,
    setMemberRoleDraft,
    handleConfirmMemberRole,
    memberColumns,
    taskModalMembers
  }
}

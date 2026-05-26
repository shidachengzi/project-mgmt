import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
  StopOutlined
} from '@ant-design/icons'
import { App, Avatar, Button, Col, Dropdown, Form, Input, Modal, Row, Select, Space, Spin, Table, Tag, Tree, TreeSelect, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { ensureDepartmentsContainMembers } from '../../../entities/org/lib/contactsStore'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { useOrgStore } from '../../../entities/org/model/useOrgStore'
import type { OrgDepartmentNode, OrgMember } from '../../../entities/org/model/types'
import {
  BACKEND_SYSTEM_ROLE_OPTIONS,
  deleteAdminDepartment,
  deleteAdminJobTitle,
  fetchAdminJobTitles,
  patchAdminDepartment,
  patchAdminJobTitle,
  patchAdminMember,
  postAdminDepartment,
  postAdminJobTitle,
  postAdminMember,
  putAdminDepartmentReorder,
  putAdminJobTitlesReorder,
  putAdminUserSystemRole,
} from '../../../shared/api/adminOrgApi'
import { fetchAdminSystemRolesSnapshot } from '../../../shared/api/adminSystemRolesApi'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'
import { useAdminOrgSync } from './useAdminOrgSync'

type AdminMember = OrgMember & { key: string }

type AdminTitleItem = {
  key: string
  name: string
}

const TITLES: AdminTitleItem[] = [
  { key: 't1', name: 'CEO' },
  { key: 't2', name: '技术总监' },
  { key: 't3', name: '运营总监' },
  { key: 't4', name: '财务总监' },
  { key: 't5', name: '人力资源总监' },
  { key: 't6', name: '产品总监' },
  { key: 't7', name: '设计总监' },
  { key: 't8', name: '市场总监' }
]

const memberConsolePagination = {
  defaultPageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`,
  hideOnSinglePage: false,
}

type DepartmentNode = {
  title: ReactNode
  key: string
  children?: DepartmentNode[]
  _raw?: OrgDepartmentNode
}

export function AdminMembersPanel() {
  const { message } = App.useApp()
  const backendOrg = isBackendAuthEnabled()
  const orgMembers = useOrgStore(s => s.members)
  const orgDepartmentsStore = useOrgStore(s => s.departments)
  const hasOrgHydrated = orgMembers.length > 0 || orgDepartmentsStore.length > 0
  const { loading: adminOrgLoading, departments: syncedDeptTree, members: syncedMembers, reload: reloadAdminOrg } = useAdminOrgSync(backendOrg, {
    hasInitialData: hasOrgHydrated
  })
  const setOrgMembers = useOrgStore(s => s.setMembers)
  const setOrgDepartmentsStore = useOrgStore(s => s.setDepartments)
  const [topTab, setTopTab] = useState<'members' | 'titles'>('members')
  const [rows, setRows] = useState<AdminMember[]>(() => orgMembers.map(m => ({ ...m, key: m.id })))
  const [titles, setTitles] = useState<AdminTitleItem[]>(TITLES)
  const [addTitleOpen, setAddTitleOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState<AdminTitleItem | null>(null)
  const [titleInput, setTitleInput] = useState('')

  const reloadJobTitles = useCallback(async () => {
    if (!backendOrg) return
    const res = await fetchAdminJobTitles()
    if (!res.ok) {
      message.error(res.message)
      return
    }
    setTitles(res.data.map(t => ({ key: t.id, name: t.name })))
  }, [backendOrg, message])

  useEffect(() => {
    if (!backendOrg) {
      setTitles(TITLES)
      return
    }
    void reloadJobTitles()
  }, [backendOrg, reloadJobTitles])

  const [orgDepartments, setOrgDepartments] = useState<OrgDepartmentNode[]>(() =>
    ensureDepartmentsContainMembers(orgMembers, orgDepartmentsStore)
  )
  const [selectedDeptKey, setSelectedDeptKey] = useState<string>('dep-root-org')
  const [expandedDeptKeys, setExpandedDeptKeys] = useState<string[]>(() => {
    const keys: string[] = []
    const walk = (nodes: OrgDepartmentNode[]) => {
      nodes.forEach(n => {
        keys.push(n.id)
        if (n.children?.length) walk(n.children)
      })
    }
    walk(orgDepartmentsStore)
    return keys.length ? keys : ['dep-root-org']
  })
  useEffect(() => {
    if (backendOrg) return
    setRows(orgMembers.map(m => ({ ...m, key: m.id })))
  }, [orgMembers, backendOrg])

  useEffect(() => {
    if (backendOrg) return
    setOrgDepartments(ensureDepartmentsContainMembers(orgMembers, orgDepartmentsStore))
  }, [orgDepartmentsStore, orgMembers, backendOrg])

  useEffect(() => {
    if (!backendOrg || adminOrgLoading) return
    const ensured = syncedDeptTree
    const mem = syncedMembers
    setRows(mem.map(m => ({ ...m, key: m.id })))
    setOrgDepartments(ensured)
    setOrgMembers(mem)
    setOrgDepartmentsStore(ensured)
  }, [backendOrg, adminOrgLoading, syncedDeptTree, syncedMembers, setOrgMembers, setOrgDepartmentsStore])

  const [manageDeptOpen, setManageDeptOpen] = useState(false)
  const [inlineAddParentKey, setInlineAddParentKey] = useState<string | null>(null)
  const inlineAddInputRef = useRef<HTMLInputElement | null>(null)
  const [inlineRenameKey, setInlineRenameKey] = useState<string | null>(null)
  const inlineRenameInputRef = useRef<HTMLInputElement | null>(null)
  const [editingMember, setEditingMember] = useState<AdminMember | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm<{
    name: string
    username: string
    email: string
    phone: string
    password: string
    department: string
    title: string
    role?: string
  }>()
  const [form] = Form.useForm<{
    name: string
    username: string
    phone: string
    email: string
    role: string
    department: string
    title: string
  }>()

  const importExcelInputRef = useRef<HTMLInputElement | null>(null)

  const normalizeCell = (v: unknown) => String(v ?? '').trim()

  const handleExportMembers = () => {
    const exportRows = rows.map(r => ({
      姓名: r.name,
      用户名: r.username || r.code || '',
      手机号: r.phone,
      邮箱: r.email,
      所属部门: r.department || '',
      职位: r.title || '',
      状态: r.disabled ? '禁用' : '启用'
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '企业成员')
    XLSX.writeFile(wb, `企业成员-${new Date().toISOString().slice(0, 10)}.xlsx`)
    message.success('已导出成员')
  }

  const handleImportMembers = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    if (!ws) {
      message.error('未读取到工作表')
      return
    }

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (!json.length) {
      message.warning('Excel 为空')
      return
    }

    const mapRow = (obj: Record<string, unknown>) => {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) return normalizeCell(obj[k])
        }
        return ''
      }
      const name = pick('姓名', 'name', 'Name')
      const username = pick('用户名', 'username', 'Username', '工号', 'code', 'Code')
      const phone = pick('手机号', '手机', 'phone', 'Phone')
      const email = pick('邮箱', 'email', 'Email')
      const department = pick('所属部门', '部门', 'department', 'Department')
      const title = pick('职位', 'title', 'Title')
      const status = pick('状态', 'status', 'Status')
      const disabled = status === '禁用' || status.toLowerCase() === 'disabled' || status === '0'
      return { name, username, phone, email, department, title, disabled }
    }

    const parsed = json.map(mapRow).filter(r => r.name)
    if (!parsed.length) {
      message.warning('未解析到有效成员（至少需要“姓名”列）')
      return
    }

    if (backendOrg) {
      const findDeptId = (deptName: string): string | null => {
        const walk = (nodes: OrgDepartmentNode[]): string | null => {
          for (const n of nodes) {
            if (n.id !== 'dep-root-org' && n.name === deptName) return n.id
            if (n.children?.length) {
              const x = walk(n.children)
              if (x) return x
            }
          }
          return null
        }
        return walk(orgDepartments)
      }
      let okCount = 0
      for (let i = 0; i < parsed.length; i++) {
        const r = parsed[i]
        const username = String(r.username || r.email || r.phone || `import${Date.now()}${i}`).trim()
        const password = `i${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
        const deptName = r.department?.trim()
        const departmentId =
          deptName && deptName !== '未分配部门' ? findDeptId(deptName) : null
        if (deptName && deptName !== '未分配部门' && !departmentId) {
          message.error(`「${r.name}」的部门「${deptName}」不存在，请先创建部门`)
          return
        }
        const res = await postAdminMember({
          name: r.name,
          username,
          password,
          email: r.email || null,
          mobile: r.phone || null,
          jobTitle: r.title || null,
          departmentId,
        })
        if (!res.ok) {
          message.error(`「${r.name}」导入失败：${res.message}`)
          return
        }
        if (r.disabled) {
          const st = await patchAdminMember(res.id, { status: 'disabled' })
          if (!st.ok) {
            message.error(`「${r.name}」已创建但禁用失败：${st.message}`)
            return
          }
        }
        okCount += 1
      }
      message.success(`已导入 ${okCount} 个成员`)
      reloadAdminOrg()
      return
    }

    const prev = rows
    const usedKeySet = new Set(prev.map(x => x.key))
    const usedUsernameSet = new Set(prev.map(x => (x.username || x.code || '').trim()).filter(Boolean))

    const append: AdminMember[] = parsed.map((r, idx) => {
      let username = r.username.trim()
      if (!username) username = `user${Date.now()}${idx}`
      while (usedUsernameSet.has(username)) username = `${username}${idx}`
      usedUsernameSet.add(username)
      let key = `u-import-${Date.now()}-${idx}`
      while (usedKeySet.has(key)) key = `${key}-x`
      usedKeySet.add(key)
      const avatarText = r.name.slice(0, 2).toUpperCase()
      const avatarColor = ['#f58aa8', '#7fd1ae', '#69b1ff', '#ffd666', '#b37feb'][Math.floor(Math.random() * 5)]
      return {
        id: key,
        key,
        name: r.name,
        username,
        code: username,
        phone: r.phone,
        email: r.email,
        role: '',
        letter: r.name.slice(0, 1).toUpperCase(),
        avatarText,
        avatarColor,
        department: r.department || '未分配部门',
        title: r.title || '',
        disabled: r.disabled
      }
    })

    persistMembers([...append, ...prev])
    message.success(`已导入 ${parsed.length} 个成员`)
  }

  const columns: ColumnsType<AdminMember> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (_v, r) => (
        <Space size={10}>
          <Avatar size={28} style={{ background: r.avatarColor }}>
            {r.avatarText}
          </Avatar>
          <span>{r.name}</span>
          {r.label ? <Tag color="red">{r.label}</Tag> : null}
        </Space>
      )
    },
    { title: '用户名', key: 'username', width: 140, render: (_v, r) => r.username || r.code || '-' },
    {
      title: '手机号 / 邮箱',
      key: 'contact',
      render: (_v, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div>{r.phone || '-'}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.email || '-'}
          </Typography.Text>
        </div>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_v, record) => (
        <Space size={2}>
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            disabled={Boolean(record.disabled)}
            onClick={() => {
              if (record.disabled) {
                message.warning('该成员已禁用，无法编辑')
                return
              }
              setEditingMember(record)
              form.setFieldsValue({
                name: record.name,
                username: record.username ?? '',
                phone: record.phone,
                email: record.email,
                role: backendOrg ? record.systemRoleKey ?? 'member' : '所有者',
                department: backendOrg ? record.departmentId || '__none__' : record.department || '不在任何部门中',
                title: record.title || ''
              })
              setEditOpen(true)
            }}
          />
          <Button
            type="text"
            size="small"
            danger={!record.disabled}
            icon={record.disabled ? <CheckCircleOutlined /> : <StopOutlined />}
            onClick={() => {
              Modal.confirm({
                title: record.disabled ? '启用成员' : '禁用成员',
                content: record.disabled ? `确认启用「${record.name}」吗？` : `禁用后该成员将无法登录与操作，确认禁用「${record.name}」吗？`,
                okText: record.disabled ? '启用' : '禁用',
                okButtonProps: record.disabled ? undefined : { danger: true },
                cancelText: '取消',
                onOk: async () => {
                  if (backendOrg) {
                    const res = await patchAdminMember(record.id, { status: record.disabled ? 'active' : 'disabled' })
                    if (!res.ok) {
                      message.error(res.message)
                      return
                    }
                    message.success(record.disabled ? '成员已启用' : '成员已禁用')
                    reloadAdminOrg()
                    return
                  }
                  persistMembers(rows.map(x => (x.key === record.key ? { ...x, disabled: !record.disabled } : x)))
                  message.success(record.disabled ? '成员已启用' : '成员已禁用')
                }
              })
            }}
          />
        </Space>
      )
    }
  ]

  const titleColumns: ColumnsType<AdminTitleItem> = useMemo(
    () => [
      {
        title: '',
        key: 'index',
        width: 60,
        render: (_v, _r, index) => <Typography.Text type="secondary">{index + 1}</Typography.Text>
      },
      { title: '职位名称', dataIndex: 'name', key: 'name' },
      {
        title: '操作',
        key: 'action',
        width: 220,
        render: (_v, record, index) => (
          <Space size={2}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingTitle(record)
                setTitleInput(record.name)
                setAddTitleOpen(true)
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={() => {
                if (backendOrg) {
                  void (async () => {
                    const idx = titles.findIndex(x => x.key === record.key)
                    if (idx <= 0) return
                    const next = [...titles]
                    const t = next[idx - 1]
                    next[idx - 1] = next[idx]
                    next[idx] = t
                    const res = await putAdminJobTitlesReorder(next.map(x => x.key))
                    if (!res.ok) {
                      message.error(res.message)
                      return
                    }
                    await reloadJobTitles()
                  })()
                  return
                }
                setTitles(prev => {
                  const arr = [...prev]
                  const idx = arr.findIndex(x => x.key === record.key)
                  if (idx <= 0) return prev
                  const tmp = arr[idx - 1]
                  arr[idx - 1] = arr[idx]
                  arr[idx] = tmp
                  return arr
                })
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === titles.length - 1}
              onClick={() => {
                if (backendOrg) {
                  void (async () => {
                    const idx = titles.findIndex(x => x.key === record.key)
                    if (idx < 0 || idx >= titles.length - 1) return
                    const next = [...titles]
                    const t = next[idx + 1]
                    next[idx + 1] = next[idx]
                    next[idx] = t
                    const res = await putAdminJobTitlesReorder(next.map(x => x.key))
                    if (!res.ok) {
                      message.error(res.message)
                      return
                    }
                    await reloadJobTitles()
                  })()
                  return
                }
                setTitles(prev => {
                  const arr = [...prev]
                  const idx = arr.findIndex(x => x.key === record.key)
                  if (idx < 0 || idx >= arr.length - 1) return prev
                  const tmp = arr[idx + 1]
                  arr[idx + 1] = arr[idx]
                  arr[idx] = tmp
                  return arr
                })
              }}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: '删除职位',
                  content: `确认删除「${record.name}」吗？`,
                  okText: '删除',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: async () => {
                    if (backendOrg) {
                      const res = await deleteAdminJobTitle(record.key)
                      if (!res.ok) {
                        message.error(res.message)
                        return
                      }
                      message.success('职位已删除')
                      await reloadJobTitles()
                      return
                    }
                    setTitles(prev => prev.filter(x => x.key !== record.key))
                    message.success('职位已删除')
                  }
                })
              }}
            />
          </Space>
        )
      },
    ],
    [backendOrg, message, titles, reloadJobTitles],
  )

  const jobTitleSelectOptions = useMemo(() => {
    if (!backendOrg) {
      return [
        { value: '项目经理', label: '项目经理' },
        { value: '开发工程师', label: '开发工程师' },
        { value: '测试工程师', label: '测试工程师' }
      ]
    }
    return titles.map(t => ({ value: t.name, label: t.name }))
  }, [backendOrg, titles])

  const departmentOptions = useMemo(() => {
    if (backendOrg) {
      const opts: { value: string; label: string }[] = [{ value: '__none__', label: '未分配部门' }]
      const walk = (nodes: OrgDepartmentNode[]) => {
        nodes.forEach(node => {
          if (node.id !== 'dep-root-org') opts.push({ value: node.id, label: node.name })
          if (node.children?.length) walk(node.children)
        })
      }
      walk(orgDepartments)
      return opts
    }
    const collect: string[] = []
    const walk = (nodes: OrgDepartmentNode[]) => {
      nodes.forEach(node => {
        if (node.id !== 'dep-root-org') collect.push(node.name)
        if (node.children?.length) walk(node.children)
      })
    }
    walk(orgDepartments)
    const uniq = Array.from(new Set(collect.filter(Boolean)))
    return ['未分配部门', ...uniq].map(v => ({ value: v, label: v }))
  }, [orgDepartments, backendOrg])

  const fallbackSystemRoles = useMemo(
    () => ({
      groups: [
        { key: 'default', name: '默认' },
        { key: 'job', name: '职务' },
      ],
      roles: BACKEND_SYSTEM_ROLE_OPTIONS.map(o => ({
        key: o.value,
        name: o.label,
        groupKey: 'default' as const,
      })),
    }),
    [],
  )

  const [systemRolesLoading, setSystemRolesLoading] = useState(false)
  const [systemRolesSnapshot, setSystemRolesSnapshot] = useState<{
    groups: { key: string; name: string }[]
    roles: { key: string; name: string; groupKey: string }[]
  } | null>(null)

  useEffect(() => {
    if (!backendOrg) {
      setSystemRolesSnapshot(null)
      setSystemRolesLoading(false)
      return
    }
    let cancel = false
    setSystemRolesLoading(true)
    ;(async () => {
      const res = await fetchAdminSystemRolesSnapshot()
      if (cancel) return
      if (!res.ok) {
        setSystemRolesSnapshot(fallbackSystemRoles)
        setSystemRolesLoading(false)
        return
      }
      const groups = res.data.groups ?? []
      setSystemRolesSnapshot({
        groups,
        roles: res.data.roles.map(r => ({
          key: r.key,
          name: r.name,
          groupKey: r.groupKey ?? 'default',
        })),
      })
      setSystemRolesLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [backendOrg, fallbackSystemRoles])

  const rolePickerSections = useMemo(() => {
    const snap = systemRolesSnapshot
    if (!snap?.roles.length) return []
    const groupLabel = (gk: string) => {
      if (gk === 'job') return '职务'
      if (gk === 'default') return '默认'
      return snap.groups.find(g => g.key === gk)?.name ?? gk
    }
    const keys = Array.from(new Set(snap.roles.map(r => r.groupKey ?? 'default')))
    const rank = (k: string) => {
      if (k === 'default') return 0
      if (k === 'job') return 1
      const idx = snap.groups.findIndex(g => g.key === k)
      return idx >= 0 ? 10 + idx : 100
    }
    keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-CN'))
    return keys
      .map(gk => ({
        key: gk,
        title: groupLabel(gk),
        roles: snap.roles.filter(r => (r.groupKey ?? 'default') === gk),
      }))
      .filter(s => s.roles.length > 0)
  }, [systemRolesSnapshot])

  const roleTreeSelectData = useMemo(
    () =>
      rolePickerSections.map(s => ({
        title: s.title,
        value: `__group_${s.key}`,
        key: `__group_${s.key}`,
        selectable: false,
        children: s.roles.map(r => ({
          title: r.name,
          value: r.key,
          key: r.key,
        })),
      })),
    [rolePickerSections],
  )

  const renderBackendSystemRolePicker = () => {
    if (systemRolesLoading || !systemRolesSnapshot) {
      return (
        <TreeSelect
          style={{ width: '100%' }}
          disabled
          placeholder="加载中…"
          treeData={[]}
          variant="outlined"
        />
      )
    }
    if (!rolePickerSections.length) {
      return (
        <Select
          options={BACKEND_SYSTEM_ROLE_OPTIONS}
          placeholder="没有任何角色"
          style={{ width: '100%' }}
        />
      )
    }
    return (
      <TreeSelect
        style={{ width: '100%' }}
        treeData={roleTreeSelectData}
        placeholder="没有任何角色"
        allowClear
        showSearch
        treeLine={{ showLeafIcon: false }}
        treeNodeFilterProp="title"
        dropdownStyle={{ maxHeight: 360 }}
        variant="outlined"
        popupMatchSelectWidth
      />
    )
  }

  const departmentTree = useMemo<DepartmentNode[]>(() => {
    const countByDept = new Map<string, number>()
    rows.forEach(m => {
      const d = m.department || '未分配部门'
      countByDept.set(d, (countByDept.get(d) ?? 0) + 1)
    })

    const toAntd = (nodes: OrgDepartmentNode[]): DepartmentNode[] =>
      nodes.map(n => {
        const cnt = n.id === 'dep-root-org' ? rows.length : (countByDept.get(n.name) ?? 0)
        const title = `${n.name}（${cnt}）`
        return {
          key: n.id,
          title,
          _raw: n,
          children: n.children?.length ? toAntd(n.children) : undefined
        }
      })

    return toAntd(orgDepartments)
  }, [orgDepartments, rows])

  const persistMembers = (next: AdminMember[]) => {
    if (backendOrg) return
    setRows(next)
    const toSave: OrgMember[] = next.map(({ key, ...rest }) => ({ ...rest, id: rest.id || key }))
    setOrgMembers(toSave)
    const nextDepts = ensureDepartmentsContainMembers(toSave, orgDepartments)
    setOrgDepartments(nextDepts)
    setOrgDepartmentsStore(nextDepts)
  }

  const persistDepartments = (next: OrgDepartmentNode[]) => {
    if (backendOrg) return
    setOrgDepartments(next)
    setOrgDepartmentsStore(next)
  }

  const ROOT_DEPT_ID = 'dep-root-org'

  const parentIdForReorderApi = (parentNodeId: string | null) => {
    if (!parentNodeId || parentNodeId === ROOT_DEPT_ID) return null
    return parentNodeId
  }

  const getOrgNodeById = (nodes: OrgDepartmentNode[], id: string): OrgDepartmentNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children?.length) {
        const hit = getOrgNodeById(n.children, id)
        if (hit) return hit
      }
    }
    return null
  }

  const updateOrgNodes = (nodes: OrgDepartmentNode[], updater: (node: OrgDepartmentNode) => OrgDepartmentNode): OrgDepartmentNode[] =>
    nodes.map(n => {
      const next = updater(n)
      return next.children?.length ? { ...next, children: updateOrgNodes(next.children, updater) } : next
    })

  const findSiblingInfoOrg = (
    nodes: OrgDepartmentNode[],
    id: string
  ): { siblings: OrgDepartmentNode[]; index: number; parentId: string | null } | null => {
    for (const n of nodes) {
      const idx = (n.children ?? []).findIndex(c => c.id === id)
      if (idx >= 0) return { siblings: n.children ?? [], index: idx, parentId: n.id }
      if (n.children?.length) {
        const hit = findSiblingInfoOrg(n.children, id)
        if (hit) return hit
      }
    }
    return null
  }

  const selectedDeptName = useMemo(() => {
    if (!selectedDeptKey || selectedDeptKey === ROOT_DEPT_ID) return '全部成员'
    return getOrgNodeById(orgDepartments, selectedDeptKey)?.name ?? '成员'
  }, [orgDepartments, selectedDeptKey])

  const filteredRows = useMemo(() => {
    if (!selectedDeptKey || selectedDeptKey === ROOT_DEPT_ID) return rows
    const dept = getOrgNodeById(orgDepartments, selectedDeptKey)
    if (!dept) return rows
    const deptName = dept.name
    return rows.filter(r => (r.department || '未分配部门') === deptName)
  }, [orgDepartments, rows, selectedDeptKey])

  const addDepartment = () => {
    const targetKey = selectedDeptKey || ROOT_DEPT_ID
    const parent = getOrgNodeById(orgDepartments, targetKey)
    if (!parent) return
    setInlineAddParentKey(targetKey)
    setExpandedDeptKeys(prev => (prev.includes(targetKey) ? prev : [...prev, targetKey]))
    window.setTimeout(() => inlineAddInputRef.current?.focus(), 0)
  }

  const confirmInlineAddDepartment = async () => {
    const parentKey = inlineAddParentKey
    const name = (inlineAddInputRef.current?.value ?? '').trim()
    if (!parentKey || !name) return
    if (backendOrg) {
      const parentId = parentKey === ROOT_DEPT_ID ? null : parentKey
      const res = await postAdminDepartment({ parentId, name })
      if (!res.ok) {
        message.error(res.message)
        return
      }
      setExpandedDeptKeys(prev => Array.from(new Set([...prev, parentKey, res.id])))
      setInlineAddParentKey(null)
      message.success('已添加部门')
      reloadAdminOrg()
      return
    }
    const nextId = `dep-${Date.now()}`
    const nextNode: OrgDepartmentNode = { id: nextId, name, memberIds: [] }
    const next = updateOrgNodes(orgDepartments, node =>
      node.id === parentKey ? { ...node, children: [...(node.children ?? []), nextNode] } : node
    )
    persistDepartments(next)
    setExpandedDeptKeys(prev => Array.from(new Set([...prev, parentKey, nextId])))
    setInlineAddParentKey(null)
    message.success('已添加部门')
  }

  const renameDepartment = () => {
    if (!selectedDeptKey || selectedDeptKey === ROOT_DEPT_ID) return
    const current = getOrgNodeById(orgDepartments, selectedDeptKey)
    if (!current) return
    setInlineRenameKey(selectedDeptKey)
    window.setTimeout(() => {
      if (inlineRenameInputRef.current) {
        inlineRenameInputRef.current.value = current.name
        inlineRenameInputRef.current.focus()
        inlineRenameInputRef.current.select()
      }
    }, 0)
  }

  const confirmInlineRenameDepartment = async () => {
    const key = inlineRenameKey
    const name = (inlineRenameInputRef.current?.value ?? '').trim()
    if (!key || !name) return
    if (backendOrg) {
      const res = await patchAdminDepartment(key, { name })
      if (!res.ok) {
        message.error(res.message)
        return
      }
      setInlineRenameKey(null)
      message.success('部门已重命名')
      reloadAdminOrg()
      return
    }
    const next = updateOrgNodes(orgDepartments, node => (node.id === key ? { ...node, name } : node))
    persistDepartments(next)
    setInlineRenameKey(null)
    message.success('部门已重命名')
  }

  const moveDepartment = async (direction: 'up' | 'down') => {
    if (!selectedDeptKey || selectedDeptKey === ROOT_DEPT_ID) return
    const info = findSiblingInfoOrg(orgDepartments, selectedDeptKey)
    if (!info) return
    const swapIdx = direction === 'up' ? info.index - 1 : info.index + 1
    if (swapIdx < 0 || swapIdx >= info.siblings.length) return
    const parentId = info.parentId
    if (!parentId) return
    if (backendOrg) {
      const sib = [...info.siblings]
      const tmp = sib[swapIdx]
      sib[swapIdx] = sib[info.index]
      sib[info.index] = tmp
      const res = await putAdminDepartmentReorder({
        parentId: parentIdForReorderApi(parentId),
        orderedIds: sib.map(s => s.id),
      })
      if (!res.ok) {
        message.error(res.message)
        return
      }
      message.success('排序已更新')
      reloadAdminOrg()
      return
    }
    const next = updateOrgNodes(orgDepartments, node => {
      if (node.id !== parentId) return node
      const children = [...(node.children ?? [])]
      const t = children[swapIdx]
      children[swapIdx] = children[info.index]
      children[info.index] = t
      return { ...node, children }
    })
    persistDepartments(next)
  }

  const removeDepartment = () => {
    if (!selectedDeptKey || selectedDeptKey === ROOT_DEPT_ID) return
    Modal.confirm({
      title: '删除部门',
      content: '确认删除该部门吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const removedId = selectedDeptKey
        if (backendOrg) {
          const res = await deleteAdminDepartment(removedId)
          if (!res.ok) {
            message.error(res.message)
            return
          }
          setSelectedDeptKey(ROOT_DEPT_ID)
          message.success('部门已删除')
          reloadAdminOrg()
          return
        }
        const removedName = getOrgNodeById(orgDepartments, removedId)?.name
        const removeNode = (nodes: OrgDepartmentNode[]): OrgDepartmentNode[] =>
          nodes
            .map(n => ({ ...n, children: n.children ? removeNode(n.children) : n.children }))
            .filter(n => n.id !== removedId)
        const nextDepts = removeNode(orgDepartments)
        persistDepartments(nextDepts)
        setSelectedDeptKey(ROOT_DEPT_ID)
        if (removedName) {
          persistMembers(rows.map(m => ((m.department || '未分配部门') === removedName ? { ...m, department: '未分配部门' } : m)))
        }
        message.success('部门已删除')
      }
    })
  }

  const departmentTreeForManage = useMemo(() => {
    const draftNode: DepartmentNode = {
      key: '__draft_new_dept__',
      title: (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <input
            ref={inlineAddInputRef}
            placeholder="输入部门名称"
            style={{ width: 220, height: 28, border: '1px solid #d9d9d9', borderRadius: 4, padding: '0 8px' }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmInlineAddDepartment()
              }
            }}
          />
          <Button type="link" size="small" onClick={confirmInlineAddDepartment}>
            确定
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setInlineAddParentKey(null)
            }}
          >
            取消
          </Button>
        </div>
      ) as unknown as string
    }
    const renameNode = (node: DepartmentNode): DepartmentNode => {
      if (node.key !== inlineRenameKey) return node
      return {
        ...node,
        title: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <input
              ref={inlineRenameInputRef}
              placeholder="输入部门名称"
              style={{ width: 220, height: 28, border: '1px solid #d9d9d9', borderRadius: 4, padding: '0 8px' }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmInlineRenameDepartment()
                }
              }}
            />
            <Button type="link" size="small" onClick={confirmInlineRenameDepartment}>
              确定
            </Button>
            <Button type="link" size="small" onClick={() => setInlineRenameKey(null)}>
              取消
            </Button>
          </div>
        ) as unknown as string
      }
    }
    const inject = (nodes: DepartmentNode[]): DepartmentNode[] =>
      nodes.map(node => {
        const base = renameNode(node)
        const nextChildren = base.children?.length ? inject(base.children) : base.children
        if (inlineAddParentKey && base.key === inlineAddParentKey) {
          return { ...base, children: [...(nextChildren ?? []), draftNode] }
        }
        return nextChildren ? { ...base, children: nextChildren } : base
      })
    return inject(departmentTree)
  }, [departmentTree, inlineAddParentKey, inlineRenameKey])

  const siblingInfo = selectedDeptKey ? findSiblingInfoOrg(orgDepartments, selectedDeptKey) : null
  const canMoveUp = Boolean(siblingInfo && siblingInfo.index > 0)
  const canMoveDown = Boolean(siblingInfo && siblingInfo.index < siblingInfo.siblings.length - 1)

  if (backendOrg && adminOrgLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 24, borderBottom: '1px solid #f0f0f0', marginBottom: 12 }}>
        {[
          { key: 'members' as const, label: '企业成员' },
          { key: 'titles' as const, label: '职位' }
        ].map(item => {
          const active = topTab === item.key
          return (
            <span
              key={item.key}
              onClick={() => setTopTab(item.key)}
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
      {topTab === 'titles' ? (
        <div style={{ flex: 1, minHeight: 0, border: '1px solid #f0f0f0', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingTitle(null)
                setTitleInput('')
                setAddTitleOpen(true)
              }}
            >
              添加职位
            </Button>
          </div>
          <Table
            rowKey="key"
            className="wt-console-table"
            columns={titleColumns}
            dataSource={titles}
            pagination={{ ...memberConsolePagination }}
            bordered={false}
          />
          <Modal
            open={addTitleOpen}
            title={editingTitle ? '编辑职位' : '添加职位'}
            okText="确定"
            cancelText="取消"
            onCancel={() => {
              setAddTitleOpen(false)
              setEditingTitle(null)
              setTitleInput('')
            }}
            onOk={async () => {
              const name = titleInput.trim()
              if (!name) {
                message.warning('请输入职位名称')
                return
              }
              if (backendOrg) {
                if (editingTitle) {
                  const res = await patchAdminJobTitle(editingTitle.key, name)
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                  message.success('职位已更新')
                } else {
                  const res = await postAdminJobTitle(name)
                  if (!res.ok) {
                    message.error(res.message)
                    return
                  }
                  message.success('职位已添加')
                }
                await reloadJobTitles()
              } else if (editingTitle) {
                setTitles(prev => prev.map(x => (x.key === editingTitle.key ? { ...x, name } : x)))
                message.success('职位已更新')
              } else {
                setTitles(prev => [...prev, { key: `t-${Date.now()}`, name }])
                message.success('职位已添加')
              }
              setAddTitleOpen(false)
              setEditingTitle(null)
              setTitleInput('')
            }}
          >
            <Input value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="请输入职位名称" />
          </Modal>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ border: '1px solid #f0f0f0', padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Input allowClear placeholder="搜索姓名、用户名" style={{ marginBottom: 10 }} />
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Tree
                treeData={departmentTree}
                defaultExpandAll
                selectedKeys={[selectedDeptKey]}
                onSelect={keys => setSelectedDeptKey(String(keys[0] ?? 'dep-root-org'))}
                style={{ background: 'transparent' }}
              />
            </div>
            <Button type="primary" block style={{ marginTop: 12 }} onClick={() => setManageDeptOpen(true)}>
              管理部门
            </Button>
          </div>
          <div style={{ border: '1px solid #f0f0f0', padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Typography.Text>{selectedDeptName}</Typography.Text>
              <Space>
                <Button
                  type="primary"
                  onClick={() => {
                    addForm.resetFields()
                    addForm.setFieldsValue({
                      department: backendOrg ? '__none__' : '未分配部门',
                      ...(backendOrg ? { role: 'member' } : {}),
                    })
                    setAddOpen(true)
                  }}
                >
                  + 添加成员
                </Button>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'import',
                        label: 'Excel 批量导入',
                        onClick: () => importExcelInputRef.current?.click()
                      },
                      {
                        key: 'export',
                        label: '导出成员（Excel）',
                        onClick: () => handleExportMembers()
                      }
                    ]
                  }}
                >
                  <Button>更多</Button>
                </Dropdown>
              </Space>
            </div>
            <input
              ref={importExcelInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ''
                if (!file) return
                try {
                  await handleImportMembers(file)
                } catch (err) {
                  console.error(err)
                  message.error('导入失败，请检查文件格式')
                }
              }}
            />
            <Table
              rowKey="key"
              className="wt-console-table"
              columns={columns}
              dataSource={filteredRows}
              pagination={{ ...memberConsolePagination }}
              bordered={false}
              rowSelection={{}}
              scroll={{ y: 'calc(100vh - 260px)' }}
              rowClassName={record => (record.disabled ? 'wt-console-member--disabled' : '')}
            />
          </div>
        </div>
      )}
      <Modal
        open={addOpen}
        title="添加成员"
        width={860}
        okText="确定"
        cancelText="取消"
        onCancel={() => {
          setAddOpen(false)
          addForm.resetFields()
        }}
        onOk={async () => {
          try {
            const values = await addForm.validateFields()
            const name = values.name.trim()
            const phone = (values.phone ?? '').trim()
            const email = (values.email ?? '').trim()
            const department = values.department
            const title = values.title
            if (backendOrg) {
              const username = values.username.trim()
              const password = values.password
              const departmentId = department === '__none__' ? null : department
              const res = await postAdminMember({
                name,
                username,
                password,
                email: email || null,
                mobile: phone || null,
                jobTitle: title || null,
                departmentId,
              })
              if (!res.ok) {
                message.error(res.message)
                return
              }
              const roleKey = String(values.role ?? 'member').trim() || 'member'
              const pr = await putAdminUserSystemRole(res.id, roleKey)
              if (!pr.ok) {
                message.warning(`成员已添加，但系统角色未设为「${roleKey}」：${pr.message}`)
              }
              setAddOpen(false)
              addForm.resetFields()
              message.success('成员已添加')
              reloadAdminOrg()
              void useBackendDataStore.getState().bootstrap()
              return
            }
            const username = values.username.trim()
            const avatarText = name.slice(0, 2).toUpperCase()
            const avatarColor = ['#f58aa8', '#7fd1ae', '#69b1ff', '#ffd666', '#b37feb'][Math.floor(Math.random() * 5)]
            const newMember: AdminMember = {
              id: `u-${Date.now()}`,
              key: `u-${Date.now()}`,
              name,
              username,
              code: username,
              phone,
              email,
              role: '',
              letter: name.slice(0, 1).toUpperCase(),
              avatarText,
              avatarColor,
              department,
              title
            }
            persistMembers([newMember, ...rows])
            setAddOpen(false)
            addForm.resetFields()
            message.success('成员已添加')
          } catch {
            // ignore validation errors
          }
        }}
      >
        <div style={{ marginBottom: 10, color: 'rgba(0,0,0,0.45)' }}>
          快速添加成员账号，设置默认密码。登录可用登录用户名、邮箱或手机号（邮箱/手机选填）；首次登录后建议修改密码。
        </div>
        <Form form={addForm} layout="vertical">
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入对方真实姓名' }]}>
            <Input placeholder="请输入对方真实姓名" />
          </Form.Item>
          <Form.Item label="登录用户名" name="username" rules={[{ required: true, message: '请输入对方用户名' }]}>
            <Input placeholder="请输入对方用户名，如 Lily" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="邮箱" name="email">
                <Input placeholder="输入邮箱地址（选填）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="手机号" name="phone">
                <Input placeholder="输入手机号（选填）" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="默认密码" name="password" rules={[{ required: true, message: '请输入默认密码' }]}>
            <Input.Password placeholder="输入默认密码" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="所属部门" name="department">
                <Select options={departmentOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="职位" name="title">
                <Select allowClear placeholder="请选择职位" options={jobTitleSelectOptions} />
              </Form.Item>
            </Col>
          </Row>
          {backendOrg ? (
            <Form.Item label="系统角色" name="role" initialValue="member" rules={[{ required: true, message: '请选择系统角色' }]}>
              {renderBackendSystemRolePicker()}
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
      <Modal
        open={editOpen}
        title="修改成员"
        width={860}
        onCancel={() => {
          setEditOpen(false)
          setEditingMember(null)
          form.resetFields()
        }}
        onOk={async () => {
          if (!editingMember) return
          try {
            const values = await form.validateFields()
            if (backendOrg) {
              const departmentId = values.department === '__none__' ? null : values.department
              const res = await patchAdminMember(editingMember.id, {
                name: values.name.trim(),
                username: values.username.trim(),
                mobile: (values.phone ?? '').trim() || null,
                email: (values.email ?? '').trim() || null,
                jobTitle: values.title || null,
                departmentId,
              })
              if (!res.ok) {
                message.error(res.message)
                return
              }
              const newRK = String(values.role ?? 'member').trim() || 'member'
              const oldRK = editingMember.systemRoleKey ?? 'member'
              if (newRK !== oldRK) {
                const r2 = await putAdminUserSystemRole(editingMember.id, newRK)
                if (!r2.ok) {
                  message.error(r2.message)
                  return
                }
              }
              message.success('成员已更新')
              setEditOpen(false)
              setEditingMember(null)
              reloadAdminOrg()
              void useBackendDataStore.getState().bootstrap()
              return
            }
            persistMembers(
              rows.map(item =>
                item.key === editingMember.key
                  ? {
                      ...item,
                      name: values.name.trim(),
                      username: values.username.trim(),
                      phone: (values.phone ?? '').trim(),
                      email: (values.email ?? '').trim(),
                      department: values.department,
                      title: values.title
                    }
                  : item
              )
            )
            setEditOpen(false)
            setEditingMember(null)
          } catch {
            // ignore validation errors
          }
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入对方真实姓名" />
          </Form.Item>
          <Form.Item label="登录用户名" name="username" rules={[{ required: true, message: '请输入登录用户名' }]}>
            <Input placeholder="请输入对方用户名，如 Lily" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="邮箱" name="email">
                <Input placeholder="输入邮箱地址（选填）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="手机号" name="phone">
                <Input placeholder="输入手机号（选填）" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="所属部门" name="department">
                <Select options={backendOrg ? departmentOptions : [{ value: '不在任何部门中', label: '不在任何部门中' }, { value: '人资', label: '人资' }, { value: '财务', label: '财务' }, { value: '资讯', label: '资讯' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="职位" name="title">
                <Select allowClear placeholder="请选择职位" options={jobTitleSelectOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="系统角色" name="role" rules={[{ required: true, message: '请选择系统角色' }]}>
            {backendOrg ? (
              renderBackendSystemRolePicker()
            ) : (
              <Select
                options={[
                  { value: '所有者', label: '所有者' },
                  { value: '管理员', label: '管理员' },
                  { value: '普通成员', label: '普通成员' },
                ]}
              />
            )}
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={manageDeptOpen} title="管理部门" width={760} footer={null} onCancel={() => setManageDeptOpen(false)}>
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Space size={8} style={{ marginBottom: 12 }}>
            <Button type="primary" ghost onClick={addDepartment}>
              添加部门
            </Button>
            <Button disabled={!selectedDeptKey || selectedDeptKey === 'dep-root-org'} onClick={renameDepartment}>
              重命名
            </Button>
            <Button disabled={!canMoveUp} onClick={() => moveDepartment('up')}>
              上移
            </Button>
            <Button disabled={!canMoveDown} onClick={() => moveDepartment('down')}>
              下移
            </Button>
            <Button danger disabled={!selectedDeptKey || selectedDeptKey === 'dep-root-org'} onClick={removeDepartment}>
              删除
            </Button>
          </Space>
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #f0f0f0', padding: 8 }}>
            <Tree
              treeData={departmentTreeForManage}
              expandedKeys={expandedDeptKeys}
              onExpand={keys => setExpandedDeptKeys(keys.map(k => String(k)))}
              selectedKeys={[selectedDeptKey]}
              onSelect={keys => {
                const nextKey = String(keys[0] ?? 'dep-root-org')
                if (nextKey === '__draft_new_dept__') return
                setSelectedDeptKey(nextKey)
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}


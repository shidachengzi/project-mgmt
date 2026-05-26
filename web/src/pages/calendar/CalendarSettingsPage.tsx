import { ArrowLeftOutlined, BulbOutlined, CheckOutlined, ControlOutlined, PlusOutlined, SearchOutlined, UserDeleteOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../entities/org/model/useOrgStore'
import { useHasSystemPermission } from '../../entities/permission/systemPermissions'
import type { OrgMember } from '../../entities/org/model/types'
import { deleteCalendar, fetchCalendars, patchCalendar } from '../../shared/api/calendarApi'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import {
  CALENDAR_COLORS,
  type CalendarMemberPermission,
  type CustomCalendar,
  buildMemberAccessForMembers,
  calendarDtoToCustom,
  persistCustomCalendarsLocal,
  readCustomCalendarsFromStorage,
} from '../../shared/calendar/customCalendar'
import {
  type CalendarReminderChannel,
  type CalendarReminderRule,
  loadReminderRules,
  persistReminderRules,
} from '../../shared/calendar/calendarReminderStorage'
import { purgeCalendarFromLocalStorage } from '../../shared/calendar/purgeCalendarLocal'
import '../../styles/pages/calendar.css'
import '../../styles/pages/calendar-settings.css'

type SettingsContextValue = {
  calendar: CustomCalendar
  reload: () => Promise<void>
  setCalendar: (next: CustomCalendar) => void
}

const CalendarSettingsContext = createContext<SettingsContextValue | null>(null)

export function useCalendarSettingsContext() {
  const v = useContext(CalendarSettingsContext)
  if (!v) throw new Error('useCalendarSettingsContext must be used inside calendar settings layout')
  return v
}

function canManageCalendar(item: CustomCalendar, authedUserId: string | null) {
  if (!authedUserId) return false
  if (!item.ownerUserId) return true
  return item.ownerUserId === authedUserId
}

async function loadCalendarById(calendarId: string): Promise<CustomCalendar | null> {
  if (isBackendAuthEnabled()) {
    const res = await fetchCalendars()
    if (!res.ok) return null
    const row = res.data.find(c => c.id === calendarId)
    return row ? calendarDtoToCustom(row) : null
  }
  return readCustomCalendarsFromStorage().find(c => c.id === calendarId) ?? null
}

export function CalendarSettingsMembers() {
  const { calendar, reload, setCalendar } = useCalendarSettingsContext()
  const orgMembers = useOrgStore(s => s.members)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [pickerIds, setPickerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [batchPermOpen, setBatchPermOpen] = useState(false)
  const [batchPermValue, setBatchPermValue] = useState<CalendarMemberPermission>('editor')

  const memberMap = useMemo(() => new Map(orgMembers.map(m => [m.id, m])), [orgMembers])
  const authedUserId = useAuthStore(s => s.authedUserId)
  const ownerId = calendar.ownerUserId ?? authedUserId ?? ''

  const accessMap = useMemo(
    () => buildMemberAccessForMembers(calendar.ownerUserId, calendar.memberIds, calendar.memberAccess),
    [calendar.memberAccess, calendar.memberIds, calendar.ownerUserId],
  )

  const rows = useMemo(() => {
    const ids = new Set<string>()
    if (ownerId) ids.add(ownerId)
    calendar.memberIds.forEach(id => ids.add(id))
    const list = [...ids]
      .map(id => {
        const m = memberMap.get(id)
        const isOwner = id === ownerId
        const perm: 'admin' | CalendarMemberPermission = isOwner ? 'admin' : accessMap[id] === 'viewer' ? 'viewer' : 'editor'
        return { id, member: m, isOwner, perm }
      })
      .filter((r): r is { id: string; member: OrgMember; isOwner: boolean; perm: 'admin' | CalendarMemberPermission } => !!r.member)
    const q = search.trim().toLowerCase()
    const filtered = q ? list.filter(r => (r.member?.name ?? '').toLowerCase().includes(q)) : list
    return filtered.sort((a, b) => Number(b.isOwner) - Number(a.isOwner))
  }, [accessMap, calendar.memberIds, memberMap, ownerId, search])

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize) || 1)
    if (page > totalPages) setPage(totalPages)
  }, [rows.length, page, pageSize])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, page, pageSize])

  type Row = (typeof rows)[number]

  const permissionDesc = (perm: Row['perm']) => {
    if (perm === 'admin') return '系统默认权限，包含日历所有权限不可修改/删除'
    if (perm === 'viewer') return '日历只读角色'
    return '可新增、修改、删除本日历下的日程'
  }

  const persistLocalMembers = (nextIds: string[]) => {
    const nextAccess = buildMemberAccessForMembers(calendar.ownerUserId, nextIds, calendar.memberAccess)
    const all = readCustomCalendarsFromStorage()
    const nextList = all.map(c => (c.id === calendar.id ? { ...c, memberIds: nextIds, memberAccess: nextAccess } : c))
    try {
      persistCustomCalendarsLocal(nextList)
    } catch {
      message.error('保存失败，请稍后重试')
      return false
    }
    setCalendar({ ...calendar, memberIds: nextIds, memberAccess: nextAccess })
    return true
  }

  const saveMemberIds = async (nextIds: string[]) => {
    const uniq = [...new Set(nextIds)]
    if (ownerId && !uniq.includes(ownerId)) uniq.unshift(ownerId)
    const mergedAccess = buildMemberAccessForMembers(calendar.ownerUserId, uniq, calendar.memberAccess)
    setSaving(true)
    try {
      if (isBackendAuthEnabled()) {
        const res = await patchCalendar(calendar.id, { memberIds: uniq, memberAccess: mergedAccess })
        if (!res.ok) {
          message.error(res.message)
          return
        }
        setCalendar(calendarDtoToCustom(res.data))
        message.success('已保存')
        setSelectedRowKeys([])
        await reload()
        return
      }
      if (persistLocalMembers(uniq)) {
        message.success('已保存')
        setSelectedRowKeys([])
      }
    } finally {
      setSaving(false)
    }
  }

  const persistMemberAccess = async (nextAccess: Record<string, CalendarMemberPermission>, successMessage: string): Promise<boolean> => {
    setSaving(true)
    try {
      if (isBackendAuthEnabled()) {
        const res = await patchCalendar(calendar.id, { memberAccess: nextAccess })
        if (!res.ok) {
          message.error(res.message)
          return false
        }
        setCalendar(calendarDtoToCustom(res.data))
        message.success(successMessage)
        setSelectedRowKeys([])
        await reload()
        return true
      }
      const all = readCustomCalendarsFromStorage()
      const nextList = all.map(c => (c.id === calendar.id ? { ...c, memberAccess: nextAccess } : c))
      try {
        persistCustomCalendarsLocal(nextList)
      } catch {
        message.error('保存失败，请稍后重试')
        return false
      }
      setCalendar({ ...calendar, memberAccess: nextAccess })
      message.success(successMessage)
      setSelectedRowKeys([])
      return true
    } finally {
      setSaving(false)
    }
  }

  const openAdd = () => {
    setPickerIds([...calendar.memberIds])
    setAddOpen(true)
  }

  const selectedNonOwnerIds = useMemo(
    () => selectedRowKeys.map(String).filter(id => id !== ownerId),
    [selectedRowKeys, ownerId],
  )

  const selectableIdsOnPage = useMemo(() => pagedRows.filter(r => !r.isOwner).map(r => r.id), [pagedRows])

  const selectedCount = selectedNonOwnerIds.length

  const selectedKeySet = useMemo(() => new Set(selectedRowKeys.map(String)), [selectedRowKeys])

  const allPageSelectableSelected =
    selectableIdsOnPage.length > 0 && selectableIdsOnPage.every(id => selectedKeySet.has(id))
  const somePageSelectableSelected =
    selectableIdsOnPage.some(id => selectedKeySet.has(id)) && !allPageSelectableSelected

  const onBatchSelectAllPage = (checked: boolean) => {
    const keysOnPage = new Set(selectableIdsOnPage)
    if (checked) {
      setSelectedRowKeys(prev => [...new Set([...prev.map(String), ...selectableIdsOnPage])])
    } else {
      setSelectedRowKeys(prev => prev.filter(k => !keysOnPage.has(String(k))))
    }
  }

  const openBatchPermModal = () => {
    setBatchPermValue('editor')
    setBatchPermOpen(true)
  }

  const applyBatchPermission = async (): Promise<void> => {
    if (selectedNonOwnerIds.length === 0) {
      setBatchPermOpen(false)
      return
    }
    const incoming: Record<string, CalendarMemberPermission> = { ...accessMap }
    for (const id of selectedNonOwnerIds) incoming[id] = batchPermValue
    const nextAccess = buildMemberAccessForMembers(calendar.ownerUserId, calendar.memberIds, incoming)
    const ok = await persistMemberAccess(nextAccess, '权限已更新')
    if (!ok) throw new Error('persist')
    setBatchPermOpen(false)
  }

  const removeSelectedMembers = async () => {
    if (selectedNonOwnerIds.length === 0) return
    const nextIds = calendar.memberIds.filter(id => !selectedNonOwnerIds.includes(id))
    await saveMemberIds(nextIds)
  }

  const permissionLabel = (r: Row) => {
    if (r.isOwner) return '管理'
    return r.perm === 'viewer' ? '只读' : '编辑'
  }

  const columns: ColumnsType<Row> = [
    {
      title: '姓名',
      dataIndex: 'member',
      render: (_: unknown, r) => {
        const m = r.member
        return (
          <Space size={8}>
            <Avatar size={28} style={m.avatarColor ? { backgroundColor: m.avatarColor } : undefined}>
              {m.avatarText || m.name.slice(0, 2)}
            </Avatar>
            <span>{m.name}</span>
          </Space>
        )
      },
    },
    {
      title: '权限',
      width: 88,
      render: (_: unknown, r) => <Typography.Text>{permissionLabel(r)}</Typography.Text>,
    },
    {
      title: '权限描述',
      render: (_: unknown, r) => <Typography.Text type="secondary">{permissionDesc(r.perm)}</Typography.Text>,
    },
  ]

  return (
    <div className="wt-calendar-settings__main wt-calendar-settings__main--members">
      <div className="wt-calendar-settings__members-title-row">
        <Typography.Title level={4} className="wt-calendar-settings__members-page-title">
          日历成员
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          添加成员
        </Button>
      </div>
      <div className="wt-calendar-settings__members-toolbar">
        <Input
          allowClear
          className="wt-calendar-settings__members-search"
          prefix={<SearchOutlined className="wt-calendar-settings__search-icon" />}
          placeholder="搜索"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Typography.Text type="secondary" className="wt-calendar-settings__members-count-text">
          {rows.length} 个成员
        </Typography.Text>
      </div>
      {selectedCount > 0 ? (
        <div className="wt-calendar-settings__members-batch-bar">
          <Checkbox
            checked={allPageSelectableSelected}
            indeterminate={somePageSelectableSelected}
            onChange={e => onBatchSelectAllPage(e.target.checked)}
          />
          <Typography.Text className="wt-calendar-settings__members-batch-bar__count">已选中 {selectedCount} 项</Typography.Text>
          <span className="wt-calendar-settings__members-batch-bar__grow" aria-hidden />
          <Space size={4} wrap>
            <Button type="link" size="small" icon={<ControlOutlined />} onClick={openBatchPermModal}>
              设置权限
            </Button>
            <Popconfirm
              title="移出成员"
              description={`确定将选中的 ${selectedCount} 位成员移出本日历？`}
              okText="移除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => void removeSelectedMembers()}
            >
              <Button type="link" size="small" danger icon={<UserDeleteOutlined />}>
                移除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      ) : null}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={pagedRows}
        pagination={{
          current: page,
          pageSize,
          total: rows.length,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: total => `共 ${total} 条`,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps ?? pageSize)
          },
        }}
        size="small"
        loading={saving}
        className="wt-calendar-settings__members-table"
        rowSelection={{
          selectedRowKeys,
          onChange: keys => setSelectedRowKeys(keys),
          getCheckboxProps: (r: Row) => ({ disabled: r.isOwner }),
          columnWidth: 48,
          hideSelectAll: true,
        }}
      />
      <Modal
        title="批量设置权限"
        open={batchPermOpen}
        onCancel={() => setBatchPermOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => applyBatchPermission()}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将应用于已选中的 {selectedCount} 位成员（不含日历所有者）。
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          value={batchPermValue}
          onChange={v => setBatchPermValue(v as CalendarMemberPermission)}
          options={[
            { value: 'editor', label: '编辑' },
            { value: 'viewer', label: '只读' },
          ]}
        />
      </Modal>
      <Modal
        title="添加成员"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => saveMemberIds(pickerIds)}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="从通讯录选择成员"
          value={pickerIds}
          onChange={setPickerIds}
          options={orgMembers.map(member => ({
            value: member.id,
            label: `${member.name}${member.department ? `（${member.department}）` : ''}`,
          }))}
          optionFilterProp="label"
          showSearch
        />
      </Modal>
    </div>
  )
}

export function CalendarSettingsBasic() {
  const { calendar, reload, setCalendar } = useCalendarSettingsContext()
  const canCreatePublicCalendar = useHasSystemPermission('calendar.create_public')
  const canCreatePrivateCalendar = useHasSystemPermission('calendar.create_private')
  const [name, setName] = useState(calendar.name)
  const [color, setColor] = useState(calendar.color)
  const [visibility, setVisibility] = useState(calendar.visibility)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(calendar.name)
    setColor(calendar.color)
    setVisibility(calendar.visibility)
  }, [calendar])

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      message.warning('请输入日历名称')
      return
    }
    if (visibility === 'team' && !canCreatePublicCalendar) {
      message.warning('暂无将日历设为公开的权限')
      return
    }
    if (visibility === 'private' && !canCreatePrivateCalendar) {
      message.warning('暂无将日历设为私有的权限')
      return
    }
    setSaving(true)
    try {
      if (isBackendAuthEnabled()) {
        const res = await patchCalendar(calendar.id, { name: trimmed, color, visibility })
        if (!res.ok) {
          message.error(res.message)
          return
        }
        setCalendar(calendarDtoToCustom(res.data))
        message.success('已保存')
        await reload()
        return
      }
      const all = readCustomCalendarsFromStorage()
      const dup = all.some(c => c.id !== calendar.id && c.name.toLowerCase() === trimmed.toLowerCase())
      if (dup) {
        message.warning('日历名称已存在')
        return
      }
      const nextList = all.map(c => (c.id === calendar.id ? { ...c, name: trimmed, color, visibility } : c))
      try {
        persistCustomCalendarsLocal(nextList)
      } catch {
        message.error('保存失败，请稍后重试')
        return
      }
      setCalendar({ ...calendar, name: trimmed, color, visibility })
      message.success('已保存')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wt-calendar-settings__main">
      <Typography.Title level={4} className="wt-calendar-settings__main-title">
        基本信息
      </Typography.Title>
      <div className="wt-calendar-settings__field">
        <div className="wt-calendar-settings__label">日历名称 *</div>
        <Input value={name} onChange={e => setName(e.target.value)} maxLength={32} placeholder="日历名称（不超过32个字符）" />
      </div>
      <div className="wt-calendar-settings__field">
        <div className="wt-calendar-settings__label">颜色</div>
        <div className="wt-calendar-page__modal-colors">
          {CALENDAR_COLORS.map(c => {
            const active = color === c
            return (
              <button key={c} type="button" className={active ? 'wt-calendar-page__color-dot wt-calendar-page__color-dot--active' : 'wt-calendar-page__color-dot'} style={{ backgroundColor: c }} onClick={() => setColor(c)}>
                {active ? <CheckOutlined /> : null}
              </button>
            )
          })}
        </div>
      </div>
      <div className="wt-calendar-settings__field">
        <div className="wt-calendar-settings__label">可见范围</div>
        <Select
          style={{ maxWidth: 480, width: '100%' }}
          value={visibility}
          onChange={v => setVisibility(v)}
          options={[
            { value: 'private', label: '私有：只有加入的成员才能看见此日历' },
            { value: 'team', label: '公开：团队成员都可查看', disabled: !canCreatePublicCalendar },
          ]}
        />
      </div>
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </Space>
    </div>
  )
}

export function CalendarSettingsReminders() {
  const { calendar } = useCalendarSettingsContext()
  const [rules, setRules] = useState<CalendarReminderRule[]>(() => loadReminderRules(calendar.id))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarReminderRule | null>(null)
  const [form] = Form.useForm<{ minutesBefore: number; channel: CalendarReminderChannel }>()

  const channelLabel = (ch: CalendarReminderChannel) => {
    if (ch === 'email') return '邮件'
    if (ch === 'both') return '站内信 + 邮件'
    return '站内信'
  }

  useEffect(() => {
    setRules(loadReminderRules(calendar.id))
    setPage(1)
  }, [calendar.id])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rules.length / pageSize) || 1)
    if (page > totalPages) setPage(totalPages)
  }, [rules.length, page, pageSize])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return rules.slice(start, start + pageSize)
  }, [rules, page, pageSize])

  const ruleLabel = (r: CalendarReminderRule) => `提前 ${r.minutesBefore} 分钟 提醒`

  const openAdd = () => {
    setEditing(null)
    form.setFieldsValue({ minutesBefore: 15, channel: 'system' })
    setModalOpen(true)
  }

  const openConfigure = (r: CalendarReminderRule) => {
    setEditing(r)
    form.setFieldsValue({ minutesBefore: r.minutesBefore, channel: r.channel })
    setModalOpen(true)
  }

  const commitModal = async () => {
    try {
      const values = await form.validateFields()
      const minutes = Math.max(1, Math.min(10080, Math.floor(Number(values.minutesBefore) || 15)))
      const channel = values.channel ?? 'system'
      const next: CalendarReminderRule[] = editing
        ? rules.map(x => (x.id === editing.id ? { ...x, minutesBefore: minutes, channel } : x))
        : [...rules, { id: `rule-${Date.now()}`, minutesBefore: minutes, channel }]
      setRules(next)
      persistReminderRules(calendar.id, next)
      setModalOpen(false)
      message.success(editing ? '已保存' : '已添加')
    } catch {
      return Promise.reject()
    }
  }

  const removeRule = (id: string) => {
    const next = rules.filter(x => x.id !== id)
    setRules(next)
    persistReminderRules(calendar.id, next)
    message.success('已删除')
  }

  const columns: ColumnsType<CalendarReminderRule> = [
    {
      title: '提醒规则',
      dataIndex: 'minutesBefore',
      render: (_: unknown, r) => ruleLabel(r),
    },
    {
      title: '提醒方式',
      width: 200,
      render: (_: unknown, r) => <Tag className="wt-calendar-settings__reminder-method-tag">{channelLabel(r.channel)}</Tag>,
    },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, r) => (
        <Space size="middle">
          <Typography.Link onClick={() => openConfigure(r)}>配置</Typography.Link>
          <Popconfirm title="确定删除该提醒规则？" okText="删除" cancelText="取消" onConfirm={() => removeRule(r.id)}>
            <Typography.Link type="danger">删除</Typography.Link>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="wt-calendar-settings__main wt-calendar-settings__main--reminders">
      <div className="wt-calendar-settings__members-title-row">
        <Typography.Title level={4} className="wt-calendar-settings__members-page-title">
          提醒设置
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          添加提醒
        </Button>
      </div>
      <Alert
        type="info"
        showIcon
        icon={<BulbOutlined />}
        message={
          <span>
            <Typography.Text strong>说明</Typography.Text>
            ：此处规则会写入「新建日程」的默认提醒（存数据库），由后台定时任务在开始前触发。选「站内信」时，提醒出现在顶部铃铛 →
            <Typography.Text strong>「项目通知」</Typography.Text>
            页签（与「系统通知」页签不同）。新建/更新日程时另有「日程已创建 / 已更新」类通知，也在「项目通知」。
            邮件需管理员配置 SMTP。
          </span>
        }
        className="wt-calendar-settings__reminder-tips"
      />
      <Table
        rowKey="id"
        className="wt-calendar-settings__reminders-table"
        columns={columns}
        dataSource={pagedRows}
        pagination={{
          current: page,
          pageSize,
          total: rules.length,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: total => `共 ${total} 条`,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps ?? pageSize)
          },
        }}
        size="middle"
      />
      <Modal
        title={editing ? '配置提醒' : '添加提醒'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => commitModal()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="minutesBefore"
            label="提前提醒（分钟）"
            rules={[
              { required: true, message: '请输入分钟数' },
              {
                validator: async (_, v) => {
                  const n = Number(v)
                  if (!Number.isFinite(n) || n < 1 || n > 10080) throw new Error('范围为 1～10080 分钟')
                },
              },
            ]}
          >
            <InputNumber min={1} max={10080} style={{ width: '100%' }} placeholder="例如 15" />
          </Form.Item>
          <Form.Item
            name="channel"
            label="提醒方式"
            rules={[{ required: true, message: '请选择提醒方式' }]}
            extra="「站内信」= 消息中心的项目通知页签，不是「系统通知」全员公告。"
          >
            <Select
              options={[
                { value: 'system', label: '站内信（项目通知）' },
                { value: 'email', label: '邮件' },
                { value: 'both', label: '站内信 + 邮件' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export function CalendarSettingsAdvanced() {
  const { calendar } = useCalendarSettingsContext()
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const [deleting, setDeleting] = useState(false)

  const isOwner = !calendar.ownerUserId || calendar.ownerUserId === authedUserId

  const handleDelete = async () => {
    if (!isOwner) {
      message.error('只有日历所有者可以删除')
      return
    }
    setDeleting(true)
    try {
      if (isBackendAuthEnabled()) {
        const res = await deleteCalendar(calendar.id)
        if (!res.ok) {
          message.error(res.message)
          return
        }
      } else {
        purgeCalendarFromLocalStorage(calendar.id)
      }
      message.success('日历已删除')
      window.dispatchEvent(new Event('pm-calendar-updated'))
      navigate('/calendar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="wt-calendar-settings__main wt-calendar-settings__main--advanced">
      <Typography.Title level={4} className="wt-calendar-settings__main-title">
        高级设置
      </Typography.Title>
      <div className="wt-calendar-settings__danger-divider" aria-hidden>
        <span className="wt-calendar-settings__danger-badge">
          <WarningOutlined />
          危险区
        </span>
      </div>
      <div className="wt-calendar-settings__danger-block">
        <Typography.Title level={5} className="wt-calendar-settings__danger-title">
          删除日历
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="wt-calendar-settings__danger-desc">
          如果此日历不再使用，可以删除它，删除后日历下的日程也会一并删除，并且无法恢复。
        </Typography.Paragraph>
        <Popconfirm
          title="确定删除此日历？"
          description="删除后该日历下的所有日程将永久移除，此操作不可恢复。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: deleting }}
          onConfirm={() => void handleDelete()}
          disabled={!isOwner}
        >
          <Button type="primary" danger disabled={!isOwner}>
            删除日历
          </Button>
        </Popconfirm>
      </div>
    </div>
  )
}

export function CalendarSettingsPlaceholder({ title }: { title: string }) {
  return (
    <div className="wt-calendar-settings__main">
      <Typography.Title level={4} className="wt-calendar-settings__main-title">
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary">该功能暂未开放，敬请期待。</Typography.Paragraph>
    </div>
  )
}

const NAV_GROUPS: { title: string; items: { key: string; label: string; to: string }[] }[] = [
  {
    title: '通用',
    items: [
      { key: 'members', label: '日历成员', to: 'members' },
      { key: 'reminders', label: '提醒设置', to: 'reminders' },
    ],
  },
  {
    title: '共享',
    items: [
      { key: 'sharing-events', label: '日程共享', to: 'sharing-events' },
      { key: 'sharing-calendar', label: '日历共享', to: 'sharing-calendar' },
    ],
  },
  {
    title: '设置',
    items: [
      { key: 'basic', label: '基本信息', to: 'basic' },
      { key: 'advanced', label: '高级设置', to: 'advanced' },
    ],
  },
]

export function CalendarSettingsLayout() {
  const { calendarId = '' } = useParams<{ calendarId: string }>()
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const [calendar, setCalendarState] = useState<CustomCalendar | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!calendarId) return
    setLoading(true)
    setLoadErr(null)
    try {
      const row = await loadCalendarById(calendarId)
      setCalendarState(row)
      if (!row) setLoadErr('未找到该日历')
    } catch {
      setLoadErr('加载失败')
      setCalendarState(null)
    } finally {
      setLoading(false)
    }
  }, [calendarId])

  useEffect(() => {
    void reload()
  }, [reload])

  const canManage = calendar ? canManageCalendar(calendar, authedUserId) : false

  if (loading) {
    return (
      <div className="wt-calendar-settings wt-calendar-settings--center">
        <Spin size="large" />
      </div>
    )
  }

  if (!calendar || loadErr) {
    return <Navigate to="/calendar" replace state={{ message: loadErr || '未找到该日历' }} />
  }

  if (!canManage) {
    return <Navigate to="/calendar" replace state={{ message: '无权管理此日历' }} />
  }

  const ctx: SettingsContextValue = {
    calendar,
    reload,
    setCalendar: setCalendarState,
  }

  return (
    <CalendarSettingsContext.Provider value={ctx}>
      <div className="wt-calendar-settings">
        <aside className="wt-calendar-settings__sider">
          <Button type="text" className="wt-calendar-settings__back" icon={<ArrowLeftOutlined />} onClick={() => navigate('/calendar')}>
            返回
          </Button>
          {NAV_GROUPS.map(group => (
            <div key={group.title} className="wt-calendar-settings__nav-group">
              <div className="wt-calendar-settings__nav-group-title">{group.title}</div>
              {group.items.map(it => (
                <NavLink key={it.key} to={it.to} className={({ isActive }) => `wt-calendar-settings__nav-item${isActive ? ' wt-calendar-settings__nav-item--active' : ''}`} end>
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <section className="wt-calendar-settings__content">
          <div className="wt-calendar-settings__content-inner">
            <Outlet />
          </div>
        </section>
      </div>
    </CalendarSettingsContext.Provider>
  )
}

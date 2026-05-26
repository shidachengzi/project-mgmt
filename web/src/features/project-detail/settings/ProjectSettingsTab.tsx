import type { Dayjs } from 'dayjs'
import { CameraOutlined } from '@ant-design/icons'
import { Avatar, Button, Checkbox, Col, DatePicker, Divider, Dropdown, Form, Input, Modal, Row, Select, Space, Switch, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import type { CSSProperties, ChangeEvent, Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { ProjectSummary } from '../../../entities/project/model/types'
import { useBackendDataStore } from '../../../entities/workspace/model/backendDataStore'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'
import { deleteProject, patchProject } from '../../../shared/api/projectsApi'
import type { ProjectRoleItem } from './projectRoleDefaults'

type SettingsMenuKey = 'member' | 'role' | 'basic' | 'advanced'
type MemberRecord = { key: string; name: string; role: string; dept: string; action: string }
type RolePermissionSection = { key: string; title: string; items: readonly string[] }

export type ProjectSettingsTabProps = {
  readonlyTipEl: ReactNode
  readonlyBlockStyle?: CSSProperties
  isProjectArchived: boolean
  isProjectReadonlyByRole: boolean
  settingsMenuKey: SettingsMenuKey
  setSettingsMenuKey: Dispatch<SetStateAction<SettingsMenuKey>>
  members: MemberRecord[]
  setMembers: Dispatch<SetStateAction<MemberRecord[]>>
  settingsSelectedMemberKeys: string[]
  setSettingsSelectedMemberKeys: Dispatch<SetStateAction<string[]>>
  setAddMemberModalOpen: Dispatch<SetStateAction<boolean>>
  projectRoles: ProjectRoleItem[]
  setProjectRoles: Dispatch<SetStateAction<ProjectRoleItem[]>>
  setActiveRoleForPermission: Dispatch<SetStateAction<string | null>>
  setRolePermissionOpen: Dispatch<SetStateAction<boolean>>
  rolePermissionOpen: boolean
  activeRoleForPermission: string | null
  rolePermissionsByKey: Record<string, string[]>
  setRolePermissionsByKey: Dispatch<SetStateAction<Record<string, string[]>>>
  rolePermissionSections: ReadonlyArray<RolePermissionSection>
  canManageProjectMembers: boolean
  canManageProjectRoles: boolean
  canArchiveProject: boolean
  canDeleteProject: boolean
  addRoleOpen: boolean
  setAddRoleOpen: Dispatch<SetStateAction<boolean>>
  addRoleForm: FormInstance<{ name: string; note?: string }>
  settingsForm: FormInstance
  isSettingsCoverHover: boolean
  setIsSettingsCoverHover: Dispatch<SetStateAction<boolean>>
  settingsCoverUploadRef: RefObject<HTMLInputElement>
  uploadSettingsCover: (e: ChangeEvent<HTMLInputElement>) => void
  settingsOwnerOptions: string[]
  templateName: string
  saveProjectSettings: () => void
  project: ProjectSummary & { cover?: string; image?: string; id: string }
  setIsProjectArchived: Dispatch<SetStateAction<boolean>>
  onDeleteProject?: (project: ProjectSummary) => void
  onUpdateProject?: (project: ProjectSummary) => void
  addMemberModalEl: ReactNode
  persistProjectRolePermissions?: (
    roleKey: string,
    permissionKeys: string[],
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  createBackendProjectRole?: (name: string, note?: string) => Promise<{ ok: true } | { ok: false; message: string }>
  settingsSelectedRoleKeys: string[]
  setSettingsSelectedRoleKeys: Dispatch<SetStateAction<string[]>>
  rolePermissionSaving: boolean
  roleDeleting: boolean
  roleDefaultSavingKey: string | null
  addRoleSaving: boolean
  setDefaultProjectRole?: (roleKey: string) => Promise<{ ok: true } | { ok: false; message: string }>
  deleteSelectedCustomRoles?: (roleKeys: string[]) => Promise<{ ok: true } | { ok: false; message: string }>
  isCustomProjectRoleKey?: (key: string) => boolean
}

export function ProjectSettingsTab({
  readonlyTipEl,
  readonlyBlockStyle,
  isProjectArchived,
  isProjectReadonlyByRole,
  settingsMenuKey,
  setSettingsMenuKey,
  members,
  setMembers,
  settingsSelectedMemberKeys,
  setSettingsSelectedMemberKeys,
  setAddMemberModalOpen,
  projectRoles,
  setProjectRoles,
  setActiveRoleForPermission,
  setRolePermissionOpen,
  rolePermissionOpen,
  activeRoleForPermission,
  rolePermissionsByKey,
  setRolePermissionsByKey,
  rolePermissionSections,
  canManageProjectMembers,
  canManageProjectRoles,
  canArchiveProject,
  canDeleteProject,
  addRoleOpen,
  setAddRoleOpen,
  addRoleForm,
  settingsForm,
  isSettingsCoverHover,
  setIsSettingsCoverHover,
  settingsCoverUploadRef,
  uploadSettingsCover,
  settingsOwnerOptions,
  templateName,
  saveProjectSettings,
  project,
  setIsProjectArchived,
  onDeleteProject,
  onUpdateProject,
  addMemberModalEl,
  persistProjectRolePermissions,
  createBackendProjectRole,
  settingsSelectedRoleKeys,
  setSettingsSelectedRoleKeys,
  rolePermissionSaving,
  roleDeleting,
  roleDefaultSavingKey,
  addRoleSaving,
  setDefaultProjectRole,
  deleteSelectedCustomRoles,
  isCustomProjectRoleKey: isCustomProjectRoleKeyProp
}: ProjectSettingsTabProps) {
  const bootstrapBackendData = useBackendDataStore(s => s.bootstrap)
  const readonly = isProjectArchived || isProjectReadonlyByRole
  const settingsGroups: Array<{ title: string; items: Array<{ key: SettingsMenuKey | 'placeholder'; label: string }> }> = [
    { title: '成员和角色', items: [{ key: 'member', label: '成员' }, { key: 'role', label: '项目角色' }] },
    { title: '更多', items: [{ key: 'basic', label: '基本设置' }, { key: 'advanced', label: '高级设置' }] }
  ]

  const membersColumns: ColumnsType<MemberRecord> = [
    {
      title: '成员',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => (
        <Space size={10}>
          <Avatar size={28} style={{ background: '#e6f4ff', color: '#1677ff' }}>
            {value.slice(0, 2).toUpperCase()}
          </Avatar>
          <span>{value}</span>
        </Space>
      )
    },
    { title: '角色', dataIndex: 'role', key: 'role', width: 180 },
    { title: '部门', dataIndex: 'dept', key: 'dept', width: 180 }
  ]

  const roleColumns: ColumnsType<ProjectRoleItem> = [
    { title: '角色名称', dataIndex: 'name', key: 'name' },
    { title: '备注', dataIndex: 'note', key: 'note' },
    {
      title: '默认',
      key: 'default',
      width: 120,
      render: (_v, row) => (
        <Switch
          checked={row.isDefault}
          loading={roleDefaultSavingKey === row.key}
          disabled={isProjectArchived || !canManageProjectRoles || roleDefaultSavingKey !== null}
          onChange={checked => {
            if (!canManageProjectRoles) return
            if (!checked) return
            void (async () => {
              const res = await setDefaultProjectRole?.(row.key)
              if (res && !res.ok) message.error(res.message)
            })()
          }}
        />
      )
    },
    {
      title: '权限配置',
      key: 'permission',
      width: 100,
      render: (_v, row) => (
        <Button
          type="link"
          size="small"
          loading={rolePermissionSaving && activeRoleForPermission === row.key}
          disabled={isProjectArchived || !canManageProjectRoles || rolePermissionSaving}
          onClick={() => {
            if (!canManageProjectRoles) return
            setActiveRoleForPermission(row.key)
            setRolePermissionOpen(true)
          }}
        >
          配置
        </Button>
      )
    }
  ]

  const selectedDeletableRoleKeys = settingsSelectedRoleKeys.filter(k => isCustomProjectRoleKeyProp?.(k) ?? false)

  return (
    <>
      <div className="wt-project-detail" style={{ background: '#f5f6f8', padding: 12 }}>
        {readonlyTipEl}
        <div style={{ background: '#fff', border: '1px solid #f0f0f0', minHeight: 'calc(100vh - 92px)', display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', ...readonlyBlockStyle }}>
          <div style={{ borderRight: '1px solid #f0f0f0', padding: '14px 0' }}>
            <div style={{ padding: '0 16px', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>项目设置</div>
            {settingsGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 10 }}>
                <div style={{ padding: '0 16px', fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>{group.title}</div>
                {group.items.map(item => {
                  const active = item.key === settingsMenuKey
                  return (
                    <div
                      key={item.label}
                      style={{
                        height: 40,
                        margin: '0 10px',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 14px',
                        cursor: item.key === 'placeholder' ? 'default' : 'pointer',
                        color: active ? '#1677ff' : 'rgba(0,0,0,0.85)',
                        background: active ? '#eef3ff' : 'transparent',
                        fontSize: 15
                      }}
                      onClick={() => {
                        if (item.key === 'placeholder') return
                        setSettingsMenuKey(item.key)
                      }}
                    >
                      {item.label}
                    </div>
                  )
                })}
                {group.title !== '更多' ? <Divider style={{ margin: '10px 0' }} /> : null}
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 16px' }}>
            {settingsMenuKey === 'member' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>成员</div>
                  <Button type="primary" disabled={readonly || !canManageProjectMembers} onClick={() => setAddMemberModalOpen(true)}>
                    添加成员
                  </Button>
                </div>
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ color: 'rgba(0,0,0,0.45)' }}>当前项目内成员，共 {members.length} 人</div>
                  {settingsSelectedMemberKeys.length > 0 ? (
                    <Space size={8}>
                      <Typography.Text type="secondary">已选中 {settingsSelectedMemberKeys.length} 项</Typography.Text>
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            { key: '普通成员', label: '普通成员' },
                            { key: '管理员', label: '管理员' },
                            { key: '只读成员', label: '只读成员' }
                          ],
                          onClick: ({ key }) => {
                            setMembers(prev =>
                              prev.map(member =>
                                settingsSelectedMemberKeys.includes(member.key) ? { ...member, role: String(key) } : member
                              )
                            )
                            message.success('角色已更新')
                          }
                        }}
                      >
                        <Button disabled={readonly || !canManageProjectMembers}>设置角色</Button>
                      </Dropdown>
                      <Button
                        danger
                        disabled={readonly || !canManageProjectMembers}
                        onClick={() => {
                          const selectedSet = new Set(settingsSelectedMemberKeys)
                          setMembers(prev => prev.filter(member => !selectedSet.has(member.key)))
                          setSettingsSelectedMemberKeys([])
                          message.success('已移除选中成员')
                        }}
                      >
                        移除
                      </Button>
                    </Space>
                  ) : null}
                </div>
                <Table<MemberRecord>
                  rowKey="key"
                  columns={membersColumns}
                  dataSource={members}
                  pagination={false}
                  bordered
                  size="middle"
                  rowSelection={{
                    selectedRowKeys: settingsSelectedMemberKeys,
                    onChange: keys => setSettingsSelectedMemberKeys(keys.map(k => String(k))),
                    getCheckboxProps: () => ({ disabled: isProjectArchived || !canManageProjectMembers })
                  }}
                />
              </>
            ) : settingsMenuKey === 'role' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>项目角色</div>
                  <Button
                    type="primary"
                    disabled={readonly || !canManageProjectRoles}
                    onClick={() => {
                      if (!canManageProjectRoles) return
                      addRoleForm.setFieldsValue({ name: '', note: '' })
                      setAddRoleOpen(true)
                    }}
                  >
                    + 添加角色模式
                  </Button>
                </div>
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ color: 'rgba(0,0,0,0.45)' }}>Tips：为项目「{project.title}」选择合适的角色模式；默认角色用于新加入成员</div>
                  {selectedDeletableRoleKeys.length > 0 ? (
                    <Space size={8}>
                      <Typography.Text type="secondary">已选中 {selectedDeletableRoleKeys.length} 项</Typography.Text>
                      <Button
                        danger
                        loading={roleDeleting}
                        disabled={readonly || !canManageProjectRoles || roleDeleting}
                        onClick={() => {
                          if (!canManageProjectRoles) return
                          void (async () => {
                            const res = await deleteSelectedCustomRoles?.(selectedDeletableRoleKeys)
                            if (res && !res.ok) message.error(res.message)
                          })()
                        }}
                      >
                        删除
                      </Button>
                    </Space>
                  ) : null}
                </div>
                <Table<ProjectRoleItem>
                  rowKey="key"
                  columns={roleColumns}
                  dataSource={projectRoles}
                  pagination={false}
                  bordered
                  size="middle"
                  rowSelection={{
                    selectedRowKeys: settingsSelectedRoleKeys,
                    onChange: keys => setSettingsSelectedRoleKeys(keys.map(k => String(k))),
                    getCheckboxProps: record => ({
                      disabled:
                        isProjectArchived ||
                        !canManageProjectRoles ||
                        !(isCustomProjectRoleKeyProp?.(record.key) ?? false)
                    })
                  }}
                />
                <Modal
                  open={rolePermissionOpen}
                  title="设置角色权限"
                  width={820}
                  okText="确定"
                  cancelText="取消"
                  confirmLoading={rolePermissionSaving}
                  onCancel={() => {
                    if (rolePermissionSaving) return
                    setRolePermissionOpen(false)
                    setActiveRoleForPermission(null)
                  }}
                  onOk={async () => {
                    if (!canManageProjectRoles || rolePermissionSaving) return
                    if (activeRoleForPermission && activeRoleForPermission !== 'admin' && isBackendAuthEnabled()) {
                      try {
                        const keys = rolePermissionsByKey[activeRoleForPermission] ?? []
                        const res = await persistProjectRolePermissions?.(activeRoleForPermission, keys)
                        if (res && !res.ok) {
                          message.error(res.message)
                          return
                        }
                      } catch (err) {
                        console.error(err)
                        message.error('保存角色权限失败，请稍后重试')
                        return
                      }
                    }
                    setRolePermissionOpen(false)
                    setActiveRoleForPermission(null)
                    message.success('角色权限已保存')
                  }}
                >
                  {activeRoleForPermission === 'admin' ? (
                    <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: '#f6ffed', border: '1px solid #b7eb8f', color: '#237804' }}>
                      管理员默认拥有全部项目权限，且不可修改。
                    </div>
                  ) : null}
                  <div style={{ maxHeight: 620, overflow: 'auto', paddingRight: 8 }}>
                    {rolePermissionSections.map(section => (
                      <div key={section.key} style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 10, borderLeft: '3px solid #5b8ff9', paddingLeft: 10 }}>{section.title}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', rowGap: 12 }}>
                          {section.items.map(item => {
                            const permissionKey = `${section.title}::${item}`
                            const isAdminPermissionRole = activeRoleForPermission === 'admin'
                            const checked = isAdminPermissionRole
                              ? true
                              : activeRoleForPermission
                                  ? (rolePermissionsByKey[activeRoleForPermission] ?? []).includes(permissionKey)
                                  : false
                            return (
                              <Checkbox
                                key={permissionKey}
                                checked={checked}
                                disabled={isAdminPermissionRole || !canManageProjectRoles}
                                onChange={e => {
                                  if (!canManageProjectRoles) return
                                  if (!activeRoleForPermission) return
                                  if (isAdminPermissionRole) return
                                  setRolePermissionsByKey(prev => {
                                    const current = prev[activeRoleForPermission] ?? []
                                    const next = e.target.checked ? [...current, permissionKey] : current.filter(x => x !== permissionKey)
                                    return { ...prev, [activeRoleForPermission]: next }
                                  })
                                }}
                              >
                                {item}
                              </Checkbox>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Modal>
                <Modal
                  open={addRoleOpen}
                  title="添加角色模式"
                  okText="确定"
                  cancelText="取消"
                  confirmLoading={addRoleSaving}
                  onCancel={() => {
                    if (addRoleSaving) return
                    setAddRoleOpen(false)
                  }}
                  onOk={async () => {
                    if (!canManageProjectRoles || addRoleSaving) return
                    try {
                      const values = await addRoleForm.validateFields()
                      const name = values.name.trim()
                      const note = values.note?.trim() || name
                      if (isBackendAuthEnabled()) {
                        const res = await createBackendProjectRole?.(name, note)
                        if (res && !res.ok) {
                          message.error(res.message)
                          return
                        }
                        setAddRoleOpen(false)
                        message.success('角色模式已添加')
                        return
                      }
                      const key = `custom-${Date.now()}`
                      setProjectRoles(prev => [...prev, { key, name, note, isDefault: false }])
                      setAddRoleOpen(false)
                      message.success('角色模式已添加')
                    } catch {
                      // ignore validation
                    }
                  }}
                >
                  <Form form={addRoleForm} layout="vertical">
                    <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }, { max: 20, message: '最多 20 个字符' }]}>
                      <Input placeholder="例如：实施成员" />
                    </Form.Item>
                    <Form.Item name="note" label="备注" rules={[{ max: 40, message: '最多 40 个字符' }]}>
                      <Input placeholder="请输入备注（可选）" />
                    </Form.Item>
                  </Form>
                </Modal>
              </>
            ) : settingsMenuKey === 'basic' ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>基本设置</div>
                <Form form={settingsForm} layout="vertical" disabled={readonly}>
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text type="secondary">项目封面</Typography.Text>
                    <div
                      style={{
                        marginTop: 8,
                        width: 280,
                        height: 120,
                        borderRadius: 6,
                        position: 'relative',
                        background:
                          project.cover === 'image' && project.image
                            ? `url(${project.image}) center/cover no-repeat`
                            : 'linear-gradient(145deg, #5aa7f0 0%, #3b82c4 55%, #2f6fb0 100%)'
                      }}
                      onMouseEnter={() => setIsSettingsCoverHover(true)}
                      onMouseLeave={() => setIsSettingsCoverHover(false)}
                    >
                      {isSettingsCoverHover ? (
                        <Button
                          type="primary"
                          shape="circle"
                          icon={<CameraOutlined />}
                          size="small"
                          style={{ position: 'absolute', right: 8, top: 8 }}
                          onClick={() => settingsCoverUploadRef.current?.click()}
                        />
                      ) : null}
                    </div>
                    <input ref={settingsCoverUploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadSettingsCover} />
                  </div>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="项目名称" name="title" rules={[{ required: true, message: '请输入项目名称' }]}>
                        <Input maxLength={60} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="负责人" name="owner" rules={[{ required: true, message: '请选择负责人' }]}>
                        <Select options={settingsOwnerOptions.map(x => ({ value: x, label: x }))} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="开始时间" name="startDate" rules={[{ required: true, message: '请选择开始时间' }]}>
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="截止时间" name="endDate" dependencies={['startDate']} rules={[{ required: true, message: '请选择截止时间' }, ({ getFieldValue }) => ({
                        validator(_, value) {
                          const start = getFieldValue('startDate') as Dayjs | undefined
                          if (!value || !start) return Promise.resolve()
                          if (value.isBefore(start, 'day')) {
                            return Promise.reject(new Error('截止时间不能早于开始时间'))
                          }
                          return Promise.resolve()
                        }
                      })]}>
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="可见范围" name="visibility" rules={[{ required: true, message: '请选择可见范围' }]}>
                        <Select
                          options={[
                            { value: '公开（企业所有成员）', label: '公开（企业所有成员）' },
                            { value: '私有（仅加入的项目成员）', label: '私有（仅加入的项目成员）' }
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="所属模板">
                        <Input value={templateName} readOnly />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="项目描述" name="description">
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="项目状态" name="progressStatus">
                        <Select
                          options={[
                            { value: '未开始', label: '未开始' },
                            { value: '进行中', label: '进行中' },
                            { value: '验收中', label: '验收中' },
                            { value: '已完成', label: '已完成' },
                            { value: '关闭', label: '关闭' }
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="健康度" name="healthStatus">
                        <Select options={[{ value: '正常', label: '正常' }, { value: '有风险', label: '有风险' }, { value: '失控', label: '失控' }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="状态描述" name="statusDescription">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <div style={{ marginTop: 12 }}>
                    <Button type="primary" disabled={readonly} onClick={saveProjectSettings}>
                      保存设置
                    </Button>
                  </div>
                </Form>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>高级设置</div>
                <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 18 }}>高风险操作请谨慎处理，操作后可能影响项目成员协作与数据。</div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>归档项目</div>
                  <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 10 }}>如果此项目已经结束了，你可以归档它，归档后还可以重新激活。</div>
                  {isProjectArchived ? (
                    <Button
                      disabled={!canArchiveProject}
                      onClick={() => {
                        void (async () => {
                          if (!canArchiveProject) {
                            message.warning('当前角色暂无「归档项目」权限')
                            return
                          }
                          if (isBackendAuthEnabled()) {
                            const res = await patchProject(project.id, { archived: false })
                            if (!res.ok) {
                              message.error(res.message)
                              return
                            }
                            setIsProjectArchived(false)
                            onUpdateProject?.({ ...project, backendArchived: false, updatedAt: res.data.updatedAt })
                            await bootstrapBackendData()
                            message.success('项目已重新激活')
                            return
                          }
                          try {
                            const raw = localStorage.getItem('pm-archived-project-ids')
                            const list = raw ? (JSON.parse(raw) as string[]) : []
                            const next = list.filter(id => id !== project.id)
                            localStorage.setItem('pm-archived-project-ids', JSON.stringify(next))
                            setIsProjectArchived(false)
                            message.success('项目已重新激活')
                          } catch {
                            message.error('重新激活失败，请重试')
                          }
                        })()
                      }}
                    >
                      重新激活
                    </Button>
                  ) : (
                    <Button
                      disabled={!canArchiveProject}
                      onClick={() => {
                        void (async () => {
                          if (!canArchiveProject) {
                            message.warning('当前角色暂无「归档项目」权限')
                            return
                          }
                          if (isBackendAuthEnabled()) {
                            const res = await patchProject(project.id, { archived: true })
                            if (!res.ok) {
                              message.error(res.message)
                              return
                            }
                            setIsProjectArchived(true)
                            onUpdateProject?.({ ...project, backendArchived: true, updatedAt: res.data.updatedAt })
                            await bootstrapBackendData()
                            message.success('项目已归档')
                            return
                          }
                          try {
                            const raw = localStorage.getItem('pm-archived-project-ids')
                            const list = raw ? (JSON.parse(raw) as string[]) : []
                            const next = Array.from(new Set([...list, project.id]))
                            localStorage.setItem('pm-archived-project-ids', JSON.stringify(next))
                            setIsProjectArchived(true)
                          } catch {
                            // ignore archive persistence failures
                          }
                          message.success('项目已归档')
                        })()
                      }}
                    >
                      归档项目
                    </Button>
                  )}
                </div>
                <Divider style={{ margin: '20px 0' }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>删除项目</div>
                  <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 10 }}>如果此项目已经不再需要了，你可以删除它，删除后所有任务也将一并删除。</div>
                  <Button
                    danger
                    type="primary"
                    disabled={readonly || !canDeleteProject}
                    onClick={() => {
                      if (!canDeleteProject) {
                        message.warning('当前角色暂无「删除项目」权限')
                        return
                      }
                      Modal.confirm({
                        title: '删除项目',
                        content: `确认删除「${project.title}」吗？将删除该项目的目标、任务、子任务、评论和活动记录。`,
                        okText: '删除',
                        okButtonProps: { danger: true },
                        cancelText: '取消',
                        onOk: () =>
                          (async () => {
                            if (isBackendAuthEnabled()) {
                              const res = await deleteProject(project.id)
                              if (!res.ok) {
                                message.error(res.message)
                                throw new Error(res.message)
                              }
                              await bootstrapBackendData()
                            }
                            onDeleteProject?.(project)
                          })()
                      })
                    }}
                  >
                    删除项目
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {addMemberModalEl}
    </>
  )
}

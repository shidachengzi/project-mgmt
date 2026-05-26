import { CloseOutlined, DeleteOutlined, DownOutlined, FilterOutlined, PlusOutlined, RightOutlined, SearchOutlined, SortAscendingOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Checkbox, Col, DatePicker, Divider, Dropdown, Empty, Form, Input, Modal, Pagination, Popover, Row, Select, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import { renderGroupDropdownPanel } from '../shared/groupDropdownPanel'
import type { TaskGroupMode, TaskManageTableFilterCondition, TaskManageTableFilterField, TaskTableSortKey } from './taskToolbarConfig'
import { TASK_GROUP_DROPDOWN_MENU_ITEMS, TASK_MANAGE_TABLE_FILTER_FIELD_OPTIONS, TASK_SORT_DROPDOWN_MENU_ITEMS, defaultOpForTaskManageTableFilterField, opsForTaskManageTableFilterField } from './taskToolbarConfig'
import type { TaskEditorTab, TaskFilter, TaskManageRecord } from './taskTypes'
import type { TaskManageRecordForColumns } from './taskManageTableColumns'
import { ProjectTableBodySkeleton } from '../shared/ProjectTableTabSkeleton'
type MemberRecord = { key: string; name: string; role: string; dept: string; action: string }

type ProjectTasksTabProps = {
  readonlyBlockStyle?: CSSProperties
  isProjectArchived: boolean
  /** 任务管理::新建任务 */
  canCreateTask: boolean
  taskFilter: TaskFilter
  setTaskFilter: Dispatch<SetStateAction<TaskFilter>>
  taskTypeLabel: string
  taskManageList: TaskManageRecord[]
  taskCount: number
  taskRows: TaskManageRecord[]
  taskManageColumns: ColumnsType<TaskManageRecordForColumns>
  expandedTaskKeys: string[]
  setExpandedTaskKeys: Dispatch<SetStateAction<string[]>>
  setEditingTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  setEditingChildTask: Dispatch<SetStateAction<TaskManageRecord | null>>
  setTaskEditorTab: Dispatch<SetStateAction<TaskEditorTab>>
  createTaskModalOpen: boolean
  setCreateTaskModalOpen: Dispatch<SetStateAction<boolean>>
  createTaskContinue: boolean
  setCreateTaskContinue: Dispatch<SetStateAction<boolean>>
  createTaskForm: FormInstance
  handleCancelCreateTask: () => void
  handleCreateTaskSubmit: () => Promise<void>
  members: MemberRecord[]
  /** 新建任务等表单里「项目阶段」下拉：固定为当前项目模板的阶段列表（如项目管理模板 4 个阶段） */
  taskStageOptions: string[]
  taskManageEditorModalEl: ReactNode
  taskSearchDraft: string
  onTaskSearchDraftChange: Dispatch<SetStateAction<string>>
  onTaskSearchSubmit: () => void
  onTaskSearchClear: () => void
  taskSortKey: TaskTableSortKey
  onTaskSortKeyChange: Dispatch<SetStateAction<TaskTableSortKey>>
  taskGroupMode: TaskGroupMode
  onTaskGroupModeChange: Dispatch<SetStateAction<TaskGroupMode>>
  taskGroupShowEmpty: boolean
  onTaskGroupShowEmptyChange: Dispatch<SetStateAction<boolean>>
  tableScrollX: number
  taskFilterPopoverOpen: boolean
  onTaskFilterPopoverOpenChange: (open: boolean) => void
  taskTableFilterDraft: TaskManageTableFilterCondition[]
  setTaskTableFilterDraft: Dispatch<SetStateAction<TaskManageTableFilterCondition[]>>
  onCommitTaskTableFilterDraft: () => void
  onResetTaskTableFilters: () => void
  taskTableFilterAppliedActive: boolean
  renderTaskTableFilterValue: (row: TaskManageTableFilterCondition) => ReactNode
  tableLoading?: boolean
}

export function ProjectTasksTab({
  readonlyBlockStyle,
  isProjectArchived,
  canCreateTask,
  taskFilter,
  setTaskFilter,
  taskTypeLabel,
  taskManageList: _taskManageList,
  taskCount,
  taskRows,
  taskManageColumns,
  expandedTaskKeys,
  setExpandedTaskKeys,
  setEditingTask,
  setEditingChildTask,
  setTaskEditorTab,
  createTaskModalOpen,
  setCreateTaskModalOpen,
  createTaskContinue,
  setCreateTaskContinue,
  createTaskForm,
  handleCancelCreateTask,
  handleCreateTaskSubmit,
  members,
  taskStageOptions,
  taskManageEditorModalEl,
  taskSearchDraft,
  onTaskSearchDraftChange,
  onTaskSearchSubmit,
  onTaskSearchClear,
  taskSortKey,
  onTaskSortKeyChange,
  taskGroupMode,
  onTaskGroupModeChange,
  taskGroupShowEmpty,
  onTaskGroupShowEmptyChange,
  tableScrollX,
  taskFilterPopoverOpen,
  onTaskFilterPopoverOpenChange,
  taskTableFilterDraft,
  setTaskTableFilterDraft,
  onCommitTaskTableFilterDraft,
  onResetTaskTableFilters,
  taskTableFilterAppliedActive,
  renderTaskTableFilterValue,
  tableLoading = false
}: ProjectTasksTabProps) {
  return (
    <>
      <div className="wt-project-detail wt-task-page" style={readonlyBlockStyle}>
        <div className="wt-task-page__subtabs">
          <Space size={20}>
            <span className={taskFilter === 'all' ? 'wt-task-page__subtab wt-task-page__subtab--active' : 'wt-task-page__subtab'} onClick={() => setTaskFilter('all')}>
              全部任务
            </span>
            <span className={taskFilter === 'unassigned' ? 'wt-task-page__subtab wt-task-page__subtab--active' : 'wt-task-page__subtab'} onClick={() => setTaskFilter('unassigned')}>
              未分配的任务
            </span>
            <span className={taskFilter === 'mine' ? 'wt-task-page__subtab wt-task-page__subtab--active' : 'wt-task-page__subtab'} onClick={() => setTaskFilter('mine')}>
              我负责的任务
            </span>
            <span className={taskFilter === 'overdue' ? 'wt-task-page__subtab wt-task-page__subtab--active' : 'wt-task-page__subtab'} onClick={() => setTaskFilter('overdue')}>
              已延期的任务
            </span>
            <span className="wt-task-page__subtab">
              更多 <SortAscendingOutlined style={{ fontSize: 11 }} />
            </span>
          </Space>
          <Button
            type="primary"
            size="small"
            disabled={isProjectArchived || !canCreateTask}
            onClick={() => {
              if (!canCreateTask) return
              setCreateTaskModalOpen(true)
              createTaskForm.setFieldsValue({
                type: taskTypeLabel,
                priority: '普通',
                stage: taskStageOptions[0]
              })
            }}
          >
            + 新建
          </Button>
        </div>
        <div className="wt-task-page__toolbar wt-target-page__toolbar--inline">
          <Space size={12} wrap align="center">
            <Input
              className="wt-target-page__search"
              allowClear
              value={taskSearchDraft}
              onChange={e => onTaskSearchDraftChange(e.target.value)}
              onPressEnter={onTaskSearchSubmit}
              onClear={onTaskSearchClear}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="搜索任务标题，按 Enter 查询"
              variant="borderless"
              style={{ width: 280 }}
            />
            <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
            <Popover
              trigger="click"
              placement="bottomLeft"
              open={taskFilterPopoverOpen}
              onOpenChange={onTaskFilterPopoverOpenChange}
              rootClassName="wt-target-filter-popover-root"
              content={
                <div className="wt-target-filter-panel">
                  <div className="wt-target-filter-panel__head">
                    <Typography.Text strong>设置筛选条件</Typography.Text>
                    <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭" onClick={() => onTaskFilterPopoverOpenChange(false)} />
                  </div>
                  <div className="wt-target-filter-panel__body">
                    {taskTableFilterDraft.length === 0 ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        暂无筛选条件，点击下方「新增筛选条件」添加
                      </Typography.Text>
                    ) : null}
                    {taskTableFilterDraft.map(row => (
                      <div key={row.id} className="wt-target-filter-panel__row">
                        <span className="wt-target-filter-panel__when">当</span>
                        <Select
                          size="small"
                          className="wt-target-filter-panel__field"
                          value={row.field}
                          options={TASK_MANAGE_TABLE_FILTER_FIELD_OPTIONS}
                          onChange={field =>
                            setTaskTableFilterDraft(prev =>
                              prev.map(r =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      field: field as TaskManageTableFilterField,
                                      op: defaultOpForTaskManageTableFilterField(field as TaskManageTableFilterField),
                                      value: ''
                                    }
                                  : r
                              )
                            )
                          }
                        />
                        <Select
                          size="small"
                          className="wt-target-filter-panel__op"
                          value={row.op}
                          options={opsForTaskManageTableFilterField(row.field)}
                          onChange={op => setTaskTableFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, op: op as TaskManageTableFilterCondition['op'] } : r)))}
                        />
                        {renderTaskTableFilterValue(row)}
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除条件" onClick={() => setTaskTableFilterDraft(prev => prev.filter(r => r.id !== row.id))} />
                      </div>
                    ))}
                  </div>
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    style={{ paddingLeft: 0 }}
                    onClick={() =>
                      setTaskTableFilterDraft(prev => [
                        ...prev,
                        {
                          id: `qf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                          field: 'status',
                          op: 'eq',
                          value: ''
                        }
                      ])
                    }
                  >
                    新增筛选条件
                  </Button>
                  <Divider style={{ margin: '10px 0 12px' }} />
                  <div className="wt-target-filter-panel__foot">
                    <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={onResetTaskTableFilters}>
                      重置
                    </Button>
                    <Space size={8}>
                      <Button size="small" onClick={() => onTaskFilterPopoverOpenChange(false)}>
                        取消
                      </Button>
                      <Button type="primary" size="small" onClick={onCommitTaskTableFilterDraft}>
                        确定
                      </Button>
                    </Space>
                  </div>
                </div>
              }
            >
              <span className="wt-target-page__tool wt-target-page__tool--filter" style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <FilterOutlined /> 筛选
                {taskTableFilterAppliedActive ? <span className="wt-target-page__filter-badge" aria-hidden /> : null}
              </span>
            </Popover>
            <Dropdown
              trigger={['click']}
              menu={{
                items: TASK_SORT_DROPDOWN_MENU_ITEMS,
                selectable: true,
                selectedKeys: [taskSortKey],
                onClick: ({ key }) => onTaskSortKeyChange(key as TaskTableSortKey)
              }}
            >
              <span className={`wt-target-page__tool${taskSortKey !== 'custom' ? ' wt-target-page__tool--active' : ''}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <SortAscendingOutlined /> 排序
              </span>
            </Dropdown>
            <Dropdown
              trigger={['click']}
              overlayClassName="wt-target-group-dropdown-overlay"
              menu={{
                items: TASK_GROUP_DROPDOWN_MENU_ITEMS,
                selectable: true,
                selectedKeys: [taskGroupMode],
                onClick: ({ key }) => onTaskGroupModeChange(key as TaskGroupMode)
              }}
              popupRender={menu => renderGroupDropdownPanel(menu, taskGroupShowEmpty, onTaskGroupShowEmptyChange)}
            >
              <span className={`wt-target-page__tool${taskGroupMode !== 'none' ? ' wt-target-page__tool--active' : ''}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <UnorderedListOutlined /> 分组
              </span>
            </Dropdown>
            <span className="wt-target-page__tool">更多</span>
            <Typography.Text type="secondary">{taskCount} 个任务</Typography.Text>
          </Space>
        </div>
        {tableLoading ? (
          <ProjectTableBodySkeleton tableClassName="wt-task-page__table" ariaLabel="任务列表加载中" />
        ) : (
          <>
            <Table<TaskManageRecord>
              columns={taskManageColumns as ColumnsType<TaskManageRecord>}
              dataSource={taskRows}
              size="small"
              rowKey="key"
              className="wt-task-page__table"
              scroll={{ x: tableScrollX }}
              pagination={false}
              expandable={{
                expandedRowKeys: expandedTaskKeys,
                onExpandedRowsChange: keys => setExpandedTaskKeys(keys.map(k => String(k))),
                rowExpandable: record => Boolean(record.children?.length),
                expandIconColumnIndex: 0,
                expandIcon: ({ expanded, onExpand, record }) => {
                  if (!record.children?.length) return <span style={{ width: 16, display: 'inline-block' }} />
                  return (
                    <span
                      className="wt-task-page__expand"
                      onClick={e => {
                        e.stopPropagation()
                        onExpand(record, e)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {expanded ? <DownOutlined /> : <RightOutlined />}
                    </span>
                  )
                }
              }}
              rowClassName={record => {
                if (record.kind === 'stage') return 'wt-task-page__stage-row'
                if (record.status === '已完成' || record.status === '关闭') return 'wt-task-page__row-muted'
                return ''
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
              onRow={record =>
                record.kind === 'stage'
                  ? {}
                  : {
                      onClick: () => {
                        setEditingTask(record)
                        setEditingChildTask(null)
                        setTaskEditorTab('任务信息')
                      },
                      style: { cursor: 'pointer' }
                    }
              }
            />
            <div className="wt-target-page__footer">
              <Typography.Text type="secondary">
                第 {taskCount === 0 ? 0 : 1}-{taskCount} 条，共 {taskCount} 条
              </Typography.Text>
          <Pagination size="small" total={taskCount} pageSize={20} />
            </div>
          </>
        )}
        <Modal
          title="新建任务"
          open={createTaskModalOpen}
          onCancel={handleCancelCreateTask}
          width={920}
          destroyOnHidden
          footer={
            <div className="wt-create-target-modal__footer">
              <Checkbox checked={createTaskContinue} onChange={e => setCreateTaskContinue(e.target.checked)}>
                继续创建下一条
              </Checkbox>
              <Space>
                <Button onClick={handleCancelCreateTask}>取消</Button>
                <Button type="primary" onClick={() => void handleCreateTaskSubmit()}>
                  确定
                </Button>
              </Space>
            </div>
          }
        >
          <Form
            form={createTaskForm}
            layout="vertical"
            initialValues={{
              type: taskTypeLabel,
              priority: '普通',
              stage: taskStageOptions[0]
            }}
            requiredMark
          >
            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
              <Input placeholder="请输入标题" allowClear />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
                  <Select placeholder="请选择类型" options={[{ value: taskTypeLabel, label: taskTypeLabel }]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="owner" label="负责人">
                  <Select placeholder="选择负责人" options={members.map(m => ({ value: m.name, label: m.name }))} allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="start" label="开始时间">
                  <DatePicker style={{ width: '100%' }} placeholder="选择开始时间" format="YYYY年M月D日" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="end" label="截止时间">
                  <DatePicker style={{ width: '100%' }} placeholder="选择截止时间" format="YYYY年M月D日" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="stage" label="项目阶段" rules={[{ required: true, message: '请选择项目阶段' }]}>
                  <Select placeholder="选择项目阶段" options={taskStageOptions.map(t => ({ value: t, label: t }))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级' }]}>
                  <Select
                    placeholder="选择优先级"
                    options={[
                      { value: '最高', label: '最高' },
                      { value: '较高', label: '较高' },
                      { value: '普通', label: '普通' },
                      { value: '较低', label: '较低' },
                      { value: '最低', label: '最低' }
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="participants" label="参与人">
              <Select mode="multiple" placeholder="选择参与人" options={members.map(m => ({ value: m.name, label: m.name }))} />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={6} placeholder="请输入描述" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
      {taskManageEditorModalEl}
    </>
  )
}

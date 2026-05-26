import {
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  FilterOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  StarFilled,
  UnorderedListOutlined
} from '@ant-design/icons'
import { Button, Checkbox, Col, Divider, Dropdown, Form, Input, Modal, Pagination, Popover, Row, Select, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance } from 'antd/es/form'
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'
import { renderGroupDropdownPanel } from '../shared/groupDropdownPanel'
import {
  TARGET_GROUP_DROPDOWN_MENU_ITEMS,
  TARGET_SORT_DROPDOWN_MENU_ITEMS,
  type TargetGroupMode,
  type TargetTableSortKey
} from './targetToolbarConfig'
import {
  TARGET_TABLE_FILTER_FIELD_OPTIONS,
  createDefaultTargetTableFilterRow,
  defaultOpForTargetFilterField,
  opsForTargetFilterField,
  type TargetTableFilterCondition,
  type TargetTableFilterOp
} from './targetTableFilters'
import { isTargetGroupTableRow, type TargetTableRow } from './targetTableGrouping'
import type { TargetFilter, TargetRecord } from './targetTypes'
import { ProjectTableBodySkeleton } from '../shared/ProjectTableTabSkeleton'

const CREATE_TARGET_PRIORITY_OPTIONS = TASK_PRIORITY_LEVELS.map((value: TaskPriorityLevel) => ({
  value: value as TargetRecord['priority'],
  label: <PriorityWithMarks priority={value} />
}))

export type ProjectTargetsTabProps = {
  readonlyBlockStyle?: CSSProperties
  targetFilter: TargetFilter
  setTargetFilter: Dispatch<SetStateAction<TargetFilter>>
  canCreateTarget: boolean
  targetTypeLabel: string
  createTargetModalOpen: boolean
  setCreateTargetModalOpen: Dispatch<SetStateAction<boolean>>
  createTargetContinue: boolean
  setCreateTargetContinue: Dispatch<SetStateAction<boolean>>
  createTargetForm: FormInstance
  handleCancelCreateTarget: () => void
  handleCreateTargetSubmit: () => Promise<void>
  targetSearchDraft: string
  setTargetSearchDraft: Dispatch<SetStateAction<string>>
  onTargetSearchSubmit: () => void
  onTargetSearchClear: () => void
  targetFilterPopoverOpen: boolean
  onTargetFilterPopoverOpenChange: (open: boolean) => void
  targetTableFilterDraft: TargetTableFilterCondition[]
  setTargetTableFilterDraft: Dispatch<SetStateAction<TargetTableFilterCondition[]>>
  onCommitTargetTableFilterDraft: () => void
  onResetTargetTableFilters: () => void
  targetTableFilterAppliedActive: boolean
  renderTargetFilterValueControl: (row: TargetTableFilterCondition) => ReactNode
  targetSortKey: TargetTableSortKey
  setTargetSortKey: Dispatch<SetStateAction<TargetTableSortKey>>
  targetGroupMode: TargetGroupMode
  setTargetGroupMode: Dispatch<SetStateAction<TargetGroupMode>>
  targetGroupShowEmpty: boolean
  setTargetGroupShowEmpty: Dispatch<SetStateAction<boolean>>
  targetGrouped: boolean
  filteredTargetsCount: number
  targetTableColumns: ColumnsType<TargetTableRow>
  targetDisplayRows: TargetTableRow[]
  targetTableScrollX: number
  expandedTargetGroupKeys: string[]
  setExpandedTargetGroupKeys: Dispatch<SetStateAction<string[]>>
  onOpenTargetRow: (record: TargetRecord) => void
  targetEditorModalEl: ReactNode
  taskManageEditorModalEl: ReactNode
  tableLoading?: boolean
}

export function ProjectTargetsTab({
  readonlyBlockStyle,
  targetFilter,
  setTargetFilter,
  canCreateTarget,
  targetTypeLabel,
  createTargetModalOpen,
  setCreateTargetModalOpen,
  createTargetContinue,
  setCreateTargetContinue,
  createTargetForm,
  handleCancelCreateTarget,
  handleCreateTargetSubmit,
  targetSearchDraft,
  setTargetSearchDraft,
  onTargetSearchSubmit,
  onTargetSearchClear,
  targetFilterPopoverOpen,
  onTargetFilterPopoverOpenChange,
  targetTableFilterDraft,
  setTargetTableFilterDraft,
  onCommitTargetTableFilterDraft,
  onResetTargetTableFilters,
  targetTableFilterAppliedActive,
  renderTargetFilterValueControl,
  targetSortKey,
  setTargetSortKey,
  targetGroupMode,
  setTargetGroupMode,
  targetGroupShowEmpty,
  setTargetGroupShowEmpty,
  targetGrouped,
  filteredTargetsCount,
  targetTableColumns,
  targetDisplayRows,
  targetTableScrollX,
  expandedTargetGroupKeys,
  setExpandedTargetGroupKeys,
  onOpenTargetRow,
  targetEditorModalEl,
  taskManageEditorModalEl,
  tableLoading = false
}: ProjectTargetsTabProps) {
  return (
    <>
      <div className="wt-project-detail wt-target-page" style={readonlyBlockStyle}>
        <div className="wt-target-page__subtabs">
          <Space size={20}>
            <span className={targetFilter === 'all' ? 'wt-target-page__subtab wt-target-page__subtab--active' : 'wt-target-page__subtab'} onClick={() => setTargetFilter('all')}>
              全部目标
            </span>
            <span className={targetFilter === 'risk' ? 'wt-target-page__subtab wt-target-page__subtab--active' : 'wt-target-page__subtab'} onClick={() => setTargetFilter('risk')}>
              进行中的目标
            </span>
            <span className={targetFilter === 'done' ? 'wt-target-page__subtab wt-target-page__subtab--active' : 'wt-target-page__subtab'} onClick={() => setTargetFilter('done')}>
              已完成的目标
            </span>
            <span className="wt-target-page__subtab">
              更多 <SortAscendingOutlined style={{ fontSize: 11 }} />
            </span>
          </Space>
          <Button
            type="primary"
            size="small"
            disabled={!canCreateTarget}
            onClick={() => {
              setCreateTargetModalOpen(true)
              setCreateTargetContinue(false)
              createTargetForm.resetFields()
              createTargetForm.setFieldsValue({ type: targetTypeLabel })
            }}
          >
            + 新建
          </Button>
        </div>
        <div className="wt-target-page__toolbar wt-target-page__toolbar--inline">
          <Space size={12} wrap align="center">
            <Input
              className="wt-target-page__search"
              allowClear
              value={targetSearchDraft}
              onChange={e => setTargetSearchDraft(e.target.value)}
              onPressEnter={onTargetSearchSubmit}
              onClear={onTargetSearchClear}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="搜索目标标题，按 Enter 查询"
              variant="borderless"
              style={{ width: 280 }}
            />
            <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
            <Popover
              trigger="click"
              placement="bottomLeft"
              open={targetFilterPopoverOpen}
              onOpenChange={onTargetFilterPopoverOpenChange}
              rootClassName="wt-target-filter-popover-root"
              content={
                <div className="wt-target-filter-panel">
                  <div className="wt-target-filter-panel__head">
                    <Typography.Text strong>设置筛选条件</Typography.Text>
                    <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭" onClick={() => onTargetFilterPopoverOpenChange(false)} />
                  </div>
                  <div className="wt-target-filter-panel__body">
                    {targetTableFilterDraft.length === 0 ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        暂无筛选条件，点击下方「新增筛选条件」添加
                      </Typography.Text>
                    ) : null}
                    {targetTableFilterDraft.map(row => (
                      <div key={row.id} className="wt-target-filter-panel__row">
                        <span className="wt-target-filter-panel__when">当</span>
                        <Select
                          size="small"
                          className="wt-target-filter-panel__field"
                          value={row.field}
                          options={TARGET_TABLE_FILTER_FIELD_OPTIONS}
                          onChange={field => setTargetTableFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, field, op: defaultOpForTargetFilterField(field), value: '' } : r)))}
                        />
                        <Select size="small" className="wt-target-filter-panel__op" value={row.op} options={opsForTargetFilterField(row.field)} onChange={op => setTargetTableFilterDraft(prev => prev.map(r => (r.id === row.id ? { ...r, op: op as TargetTableFilterOp } : r)))} />
                        {renderTargetFilterValueControl(row)}
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除条件" onClick={() => setTargetTableFilterDraft(prev => prev.filter(r => r.id !== row.id))} />
                      </div>
                    ))}
                  </div>
                  <Button type="link" size="small" icon={<PlusOutlined />} style={{ paddingLeft: 0 }} onClick={() => setTargetTableFilterDraft(prev => [...prev, createDefaultTargetTableFilterRow()])}>
                    新增筛选条件
                  </Button>
                  <Divider style={{ margin: '10px 0 12px' }} />
                  <div className="wt-target-filter-panel__foot">
                    <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={onResetTargetTableFilters}>
                      重置
                    </Button>
                    <Space size={8}>
                      <Button size="small" onClick={() => onTargetFilterPopoverOpenChange(false)}>
                        取消
                      </Button>
                      <Button type="primary" size="small" onClick={onCommitTargetTableFilterDraft}>
                        确定
                      </Button>
                    </Space>
                  </div>
                </div>
              }
            >
              <span className="wt-target-page__tool wt-target-page__tool--filter" style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <FilterOutlined /> 筛选
                {targetTableFilterAppliedActive ? <span className="wt-target-page__filter-badge" aria-hidden /> : null}
              </span>
            </Popover>
            <Dropdown
              trigger={['click']}
              menu={{
                items: TARGET_SORT_DROPDOWN_MENU_ITEMS,
                selectable: true,
                selectedKeys: [targetSortKey],
                onClick: ({ key }) => setTargetSortKey(key as TargetTableSortKey)
              }}
            >
              <span className={`wt-target-page__tool${targetSortKey !== 'custom' ? ' wt-target-page__tool--active' : ''}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <SortAscendingOutlined /> 排序
              </span>
            </Dropdown>
            <Dropdown
              trigger={['click']}
              overlayClassName="wt-target-group-dropdown-overlay"
              menu={{
                items: TARGET_GROUP_DROPDOWN_MENU_ITEMS,
                selectable: true,
                selectedKeys: [targetGroupMode],
                onClick: ({ key }) => setTargetGroupMode(key as TargetGroupMode)
              }}
              popupRender={menu => renderGroupDropdownPanel(menu, targetGroupShowEmpty, setTargetGroupShowEmpty)}
            >
              <span className={`wt-target-page__tool${targetGrouped ? ' wt-target-page__tool--active' : ''}`} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <UnorderedListOutlined /> 分组
              </span>
            </Dropdown>
            <span className="wt-target-page__tool">更多</span>
            <Typography.Text type="secondary">{filteredTargetsCount} 个目标</Typography.Text>
          </Space>
        </div>
        {tableLoading ? (
          <ProjectTableBodySkeleton tableClassName="wt-target-page__table" ariaLabel="目标列表加载中" />
        ) : (
          <>
            <Table<TargetTableRow>
              columns={targetTableColumns}
              dataSource={targetDisplayRows}
              pagination={false}
              size="small"
              rowKey="key"
              className="wt-target-page__table"
              scroll={{ x: targetTableScrollX }}
              {...(targetGrouped
                ? {
                    expandable: {
                      expandedRowKeys: expandedTargetGroupKeys,
                      onExpandedRowsChange: keys => setExpandedTargetGroupKeys(keys.map(k => String(k))),
                      rowExpandable: record => isTargetGroupTableRow(record) && Boolean(record.children?.length),
                      expandIconColumnIndex: 0,
                      expandIcon: ({ expanded, onExpand, record }) => {
                        if (!isTargetGroupTableRow(record) || !record.children?.length) {
                          return <span style={{ width: 16, display: 'inline-block' }} />
                        }
                        return (
                          <span
                            className="wt-target-page__expand"
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
                    },
                    rowClassName: record => (isTargetGroupTableRow(record) ? 'wt-target-page__group-row' : '')
                  }
                : {})}
              onRow={record =>
                isTargetGroupTableRow(record)
                  ? {}
                  : {
                      onClick: () => onOpenTargetRow(record),
                      style: { cursor: 'pointer' }
                    }
              }
            />
            <div className="wt-target-page__footer">
              <Typography.Text type="secondary">
                第 1-{filteredTargetsCount} 条，共 {filteredTargetsCount} 条
              </Typography.Text>
              <Pagination size="small" total={filteredTargetsCount} pageSize={20} />
            </div>
          </>
        )}
        {targetEditorModalEl}
        <Modal
          title="新建目标"
          open={createTargetModalOpen}
          onCancel={handleCancelCreateTarget}
          width={640}
          destroyOnHidden
          footer={
            <div className="wt-create-target-modal__footer">
              <Checkbox checked={createTargetContinue} onChange={e => setCreateTargetContinue(e.target.checked)}>
                继续创建下一条
              </Checkbox>
              <Space>
                <Button onClick={handleCancelCreateTarget}>取消</Button>
                <Button type="primary" onClick={() => void handleCreateTargetSubmit()}>
                  确定
                </Button>
              </Space>
            </div>
          }
        >
          <Form form={createTargetForm} layout="vertical" initialValues={{ type: targetTypeLabel }} requiredMark>
            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
              <Input placeholder="请输入标题" allowClear />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
                  <Select
                    placeholder="请选择类型"
                    options={[
                      {
                        value: targetTypeLabel,
                        label: (
                          <Space size={6}>
                            <StarFilled style={{ color: '#faad14' }} />
                            {targetTypeLabel}
                          </Space>
                        )
                      }
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级' }]}>
                  <Select placeholder="选择优先级" options={CREATE_TARGET_PRIORITY_OPTIONS} allowClear={false} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={6} placeholder="请输入描述" showCount maxLength={2000} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
      {taskManageEditorModalEl}
    </>
  )
}

import {
  ApartmentOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  FilterOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Divider, Dropdown, Empty, Input, Popover, Segmented, Select, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { readStoredColumnWidths } from '../../ui/resizableColumnTitle'
import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials } from '../../ui/unifiedWorkflowStatusTag'
import {
  GANTT_SORT_DROPDOWN_MENU_ITEMS,
  type GanttTableFilterCondition,
  type GanttTableFilterField,
  type GanttTableSortKey,
} from './ganttToolbarConfig'
import { useProjectGanttFilters } from './useProjectGanttFilters'
import type { GanttRowData } from './useProjectGanttData'
import { ProjectGanttBodySkeleton } from './ProjectGanttTabSkeleton'

/** 与表头日格列、行背景竖线宽度一致，条形图按像素对齐 */
const GANTT_DAY_COLUMN_PX = 46

/** 左侧栏约 400px 内边距后可用宽度约 380px，标题列 min 60px → 状态+负责人列宽之和上限 */
const GANTT_OWNER_COL_MIN = 64
const GANTT_STATUS_COL_MIN = 88
const GANTT_SIDE_COL_MAX_ONE = 240
/** 左侧内容区约 380px，标题列 minmax(60px) 略留余量，两列固定宽之和上限 */
const GANTT_SIDE_COL_MAX_SUM = 318

type GanttLeftSideWidths = { status: number; owner: number }

const DEFAULT_GANTT_LEFT_SIDE: GanttLeftSideWidths = { status: 132, owner: 112 }

function clampGanttSidePair(status: number, owner: number): GanttLeftSideWidths {
  let s = Math.max(GANTT_STATUS_COL_MIN, Math.min(GANTT_SIDE_COL_MAX_ONE, Math.round(status)))
  let o = Math.max(GANTT_OWNER_COL_MIN, Math.min(GANTT_SIDE_COL_MAX_ONE, Math.round(owner)))
  if (s + o <= GANTT_SIDE_COL_MAX_SUM) return { status: s, owner: o }
  const excess = s + o - GANTT_SIDE_COL_MAX_SUM
  if (s >= o) s -= excess
  else o -= excess
  s = Math.max(GANTT_STATUS_COL_MIN, s)
  o = Math.max(GANTT_OWNER_COL_MIN, o)
  if (s + o > GANTT_SIDE_COL_MAX_SUM) {
    if (s >= o) s = GANTT_SIDE_COL_MAX_SUM - o
    else o = GANTT_SIDE_COL_MAX_SUM - s
  }
  return { status: s, owner: o }
}

/** 时间条背景/字色与状态胶囊同一套色板 */
function ganttBarStatusClass(status: string): string {
  if (status === '进行中') return 'wt-gantt-page__bar--running'
  if (status === '已完成') return 'wt-gantt-page__bar--done'
  if (status === '搁置中') return 'wt-gantt-page__bar--hold'
  if (status === '关闭') return 'wt-gantt-page__bar--closed'
  return 'wt-gantt-page__bar--todo'
}

export type GanttGroupBy = 'none' | 'status' | 'priority' | 'owner' | 'creator' | 'stage'

/** @deprecated 使用 GanttRowData；保留别名便于现有引用 */
export type GanttRow = GanttRowData

type GanttRange = {
  start: Dayjs
  end: Dayjs
}

type GanttDisplayItem =
  | { kind: 'group'; id: string; label: string; count: number; groupKey: string }
  | { kind: 'task'; row: GanttRow }

const STATUS_ORDER = ['未开始', '进行中', '搁置中', '已完成', '关闭'] as const
const PRIORITY_ORDER = ['最高', '较高', '普通', '较低', '最低'] as const

function groupKey(row: GanttRowData, by: GanttGroupBy): string {
  switch (by) {
    case 'none':
      return ''
    case 'status':
      return row.status
    case 'priority':
      return row.priority
    case 'owner':
      return row.owner?.trim() || '未分配'
    case 'stage':
      return row.stageTitle || '—'
    case 'creator': {
      if (!row.createdAt?.trim()) return '__empty__'
      const t = dayjs(row.createdAt)
      return t.isValid() ? t.format('YYYY-MM-DD') : '__empty__'
    }
    default:
      return ''
  }
}

function groupLabel(by: GanttGroupBy, key: string): string {
  if (by === 'creator' && key === '__empty__') return '无创建时间'
  if (by === 'creator') return `创建 ${key}`
  return key
}

function orderedGroupKeys(
  by: GanttGroupBy,
  bucketKeys: Set<string>,
  showEmpty: boolean,
  stageTitles: string[],
): string[] {
  if (by === 'none') return []

  if (by === 'status') {
    const base = showEmpty ? [...STATUS_ORDER] : STATUS_ORDER.filter(k => bucketKeys.has(k))
    const extra = [...bucketKeys].filter(k => !(base as readonly string[]).includes(k)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    return [...base, ...extra]
  }

  if (by === 'priority') {
    const base = showEmpty ? [...PRIORITY_ORDER] : PRIORITY_ORDER.filter(k => bucketKeys.has(k))
    const extra = [...bucketKeys].filter(k => !(base as readonly string[]).includes(k)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    return [...base, ...extra]
  }

  if (by === 'stage') {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of stageTitles) {
      if (!seen.has(t)) {
        seen.add(t)
        if (showEmpty || bucketKeys.has(t)) out.push(t)
      }
    }
    for (const k of [...bucketKeys].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
      if (!seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
    return out
  }

  if (by === 'owner') {
    return [...bucketKeys].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }

  // creator: 日期字符串排序，无记录放最后
  const dates = [...bucketKeys].filter(k => k !== '__empty__').sort()
  if (bucketKeys.has('__empty__')) dates.push('__empty__')
  return dates
}

function buildDisplayItems(
  rows: GanttRowData[],
  by: GanttGroupBy,
  showEmpty: boolean,
  stageTitles: string[],
  collapsedGroupKeys: Set<string>,
): GanttDisplayItem[] {
  if (by === 'none') return rows.map(row => ({ kind: 'task' as const, row }))

  const buckets = new Map<string, GanttRowData[]>()
  for (const row of rows) {
    const k = groupKey(row, by)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(row)
  }

  const keys = orderedGroupKeys(by, new Set(buckets.keys()), showEmpty, stageTitles)
  const out: GanttDisplayItem[] = []
  for (const key of keys) {
    const list = buckets.get(key) ?? []
    const count = list.length
    if (count === 0 && !showEmpty) continue
    out.push({
      kind: 'group',
      id: `g-${by}-${key}`,
      label: groupLabel(by, key),
      count,
      groupKey: key,
    })
    if (!collapsedGroupKeys.has(key)) {
      for (const row of list) out.push({ kind: 'task', row })
    }
  }
  return out
}

export type ProjectGanttTabProps = {
  readonlyBlockStyle?: CSSProperties
  ganttDays: Dayjs[]
  ganttRows: GanttRow[]
  ganttRange: GanttRange
  taskManageEditorModalEl: ReactNode
  ganttExpandLevel: number
  onGanttExpandLevelChange: (level: number) => void
  ganttDisplayMode: 'flat' | 'tree'
  onGanttDisplayModeChange: (mode: 'flat' | 'tree') => void
  /** 模板阶段顺序，用于「项目阶段」分组排序与空分组 */
  taskStageOptionTitles: string[]
  /** 点击任务标题打开详情（甘特内应始终打开主详情，避免与子任务弹层冲突） */
  onOpenTaskDetail?: (taskKey: string) => void
  /** 用于负责人头像配色匹配 */
  members?: { key: string; name: string }[]
  /** 传入项目 id 等，用于左侧状态/负责人列宽 localStorage 分项目持久化 */
  columnResizeStorageKey?: string
  /** 仅甘特主体区加载中（工具条仍展示） */
  contentLoading?: boolean
}

export function ProjectGanttTab({
  readonlyBlockStyle,
  ganttDays,
  ganttRows,
  ganttRange,
  taskManageEditorModalEl,
  ganttExpandLevel,
  onGanttExpandLevelChange,
  ganttDisplayMode,
  onGanttDisplayModeChange,
  taskStageOptionTitles,
  onOpenTaskDetail,
  members = [],
  columnResizeStorageKey,
  contentLoading = false,
}: ProjectGanttTabProps) {
  const ganttLeftStorageKey = columnResizeStorageKey ? `pm-gantt-left-cols-${columnResizeStorageKey}` : null

  const [ganttSideWidths, setGanttSideWidths] = useState<GanttLeftSideWidths>(() => ({ ...DEFAULT_GANTT_LEFT_SIDE }))

  useLayoutEffect(() => {
    if (!ganttLeftStorageKey) {
      setGanttSideWidths({ ...DEFAULT_GANTT_LEFT_SIDE })
      return
    }
    const raw = readStoredColumnWidths(ganttLeftStorageKey, DEFAULT_GANTT_LEFT_SIDE)
    // 旧版默认状态列 96px 过窄，自动抬升到新默认以便完整显示状态胶囊
    const status = raw.status < 100 ? DEFAULT_GANTT_LEFT_SIDE.status : raw.status
    setGanttSideWidths(clampGanttSidePair(status, raw.owner))
  }, [ganttLeftStorageKey])

  const ganttSideRef = useRef(ganttSideWidths)
  ganttSideRef.current = ganttSideWidths

  useEffect(() => {
    if (!ganttLeftStorageKey) return
    try {
      localStorage.setItem(ganttLeftStorageKey, JSON.stringify(ganttSideWidths))
    } catch {
      /* ignore */
    }
  }, [ganttLeftStorageKey, ganttSideWidths])

  const onGanttLeftColResizeMouseDown = useCallback(
    (edge: 'status' | 'owner') => (e: ReactMouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const snap = ganttSideRef.current
      const startVal = edge === 'status' ? snap.status : snap.owner

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        const cur = ganttSideRef.current
        if (edge === 'status') {
          /* 拖的是「标题 | 状态」分界线：鼠标右移应加宽标题(1fr)、收窄状态列 */
          setGanttSideWidths(clampGanttSidePair(startVal - delta, cur.owner))
        } else {
          setGanttSideWidths(clampGanttSidePair(cur.status, startVal + delta))
        }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('mouseup', onUp, true)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('mouseup', onUp, true)
    },
    [],
  )

  const ganttLeftCssVars = useMemo(
    () =>
      ({
        ['--gantt-col-status' as string]: `${ganttSideWidths.status}px`,
        ['--gantt-col-owner' as string]: `${ganttSideWidths.owner}px`,
      }) as CSSProperties,
    [ganttSideWidths.status, ganttSideWidths.owner],
  )

  const [collapsedParentKeys, setCollapsedParentKeys] = useState<Set<string>>(() => new Set())
  const [ganttGroupBy, setGanttGroupBy] = useState<GanttGroupBy>('none')
  const [showEmptyGroups, setShowEmptyGroups] = useState(true)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set())
  const {
    ganttSearchDraft,
    setGanttSearchDraft,
    onGanttSearchSubmit,
    onGanttSearchClear,
    ganttSortKey,
    setGanttSortKey,
    ganttFilterPopoverOpen,
    handleGanttFilterPopoverOpenChange,
    ganttFilterDraft,
    setGanttFilterDraft,
    commitGanttFilterDraft,
    resetGanttFilters,
    ganttFilterAppliedActive,
    renderGanttFilterValue,
    ganttSorted,
    ganttFilterFieldOptions,
    defaultOpForGanttFilterField,
    opsForGanttFilterField,
    newGanttTableFilterId
  } = useProjectGanttFilters({ ganttRows, taskStageOptionTitles, members })

  useEffect(() => {
    if (ganttExpandLevel < 2) setCollapsedParentKeys(new Set())
  }, [ganttExpandLevel])

  useEffect(() => {
    setCollapsedGroupKeys(new Set())
  }, [ganttGroupBy, showEmptyGroups])

  const visibleGanttRows = useMemo(() => {
    if (ganttExpandLevel < 2) return ganttSorted
    return ganttSorted.filter(r => !r.parentKey || !collapsedParentKeys.has(r.parentKey))
  }, [ganttSorted, ganttExpandLevel, collapsedParentKeys])

  const displayItems = useMemo(
    () => buildDisplayItems(visibleGanttRows, ganttGroupBy, showEmptyGroups, taskStageOptionTitles, collapsedGroupKeys),
    [visibleGanttRows, ganttGroupBy, showEmptyGroups, taskStageOptionTitles, collapsedGroupKeys],
  )

  const timelineWidthPx = Math.max(1, ganttDays.length) * GANTT_DAY_COLUMN_PX

  const indentPx = (row: GanttRow) => {
    if (ganttDisplayMode !== 'tree') return 0
    return Math.max(0, row.depth - 1) * 16
  }

  const toggleParentCollapsed = (parentKey: string) => {
    setCollapsedParentKeys(prev => {
      const next = new Set(prev)
      if (next.has(parentKey)) next.delete(parentKey)
      else next.add(parentKey)
      return next
    })
  }

  const toggleGroupCollapsed = (groupKey: string) => {
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const hierarchyMenu = {
    selectable: true as const,
    selectedKeys: [String(ganttExpandLevel)],
    items: [1, 2, 3, 4, 5].map(n => ({
      key: String(n),
      label: `展开到 ${n} 级任务`,
      onClick: () => onGanttExpandLevelChange(n),
    })),
  }

  const groupMenuItems: MenuProps['items'] = [
    { key: 'none', label: '不分组', icon: ganttGroupBy === 'none' ? <CheckOutlined /> : undefined },
    { type: 'divider' },
    { key: 'status', label: '状态', icon: ganttGroupBy === 'status' ? <CheckOutlined /> : undefined },
    { key: 'priority', label: '优先级', icon: ganttGroupBy === 'priority' ? <CheckOutlined /> : undefined },
    { key: 'owner', label: '负责人', icon: ganttGroupBy === 'owner' ? <CheckOutlined /> : undefined },
    {
      key: 'creator',
      label: '创建人',
      icon: ganttGroupBy === 'creator' ? <CheckOutlined /> : undefined,
      title: '当前无创建人字段，按任务创建日期（日）分组',
    },
    { key: 'stage', label: '项目阶段', icon: ganttGroupBy === 'stage' ? <CheckOutlined /> : undefined },
    { type: 'divider' },
    {
      key: '__show_empty__',
      label: showEmptyGroups ? '✓ 显示空分组' : '显示空分组',
    },
  ]

  const onGroupMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === '__show_empty__') {
      setShowEmptyGroups(v => !v)
      return
    }
    if (key === 'none' || key === 'status' || key === 'priority' || key === 'owner' || key === 'creator' || key === 'stage') {
      setGanttGroupBy(key as GanttGroupBy)
    }
  }

  return (
    <>
      <div className="wt-project-detail wt-gantt-page" style={readonlyBlockStyle}>
        <div className="wt-gantt-page__toolbar wt-task-page__toolbar wt-target-page__toolbar--inline">
          <Space size={12} wrap align="center">
            <Input
              className="wt-target-page__search"
              allowClear
              value={ganttSearchDraft}
              onChange={e => setGanttSearchDraft(e.target.value)}
              onPressEnter={onGanttSearchSubmit}
              onClear={onGanttSearchClear}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="搜索任务标题，按 Enter 查询"
              variant="borderless"
              style={{ width: 280 }}
            />
            <Divider type="vertical" style={{ height: 18, margin: 0, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
            <Popover
              trigger="click"
              placement="bottomLeft"
              open={ganttFilterPopoverOpen}
              onOpenChange={handleGanttFilterPopoverOpenChange}
              rootClassName="wt-target-filter-popover-root"
              content={
                <div className="wt-target-filter-panel">
                  <div className="wt-target-filter-panel__head">
                    <Typography.Text strong>设置筛选条件</Typography.Text>
                    <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭" onClick={() => handleGanttFilterPopoverOpenChange(false)} />
                  </div>
                  <div className="wt-target-filter-panel__body">
                    {ganttFilterDraft.length === 0 ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        暂无筛选条件，点击下方「新增筛选条件」添加
                      </Typography.Text>
                    ) : null}
                    {ganttFilterDraft.map(condRow => (
                      <div key={condRow.id} className="wt-target-filter-panel__row">
                        <span className="wt-target-filter-panel__when">当</span>
                        <Select
                          size="small"
                          className="wt-target-filter-panel__field"
                          value={condRow.field}
                          options={ganttFilterFieldOptions}
                          onChange={field =>
                            setGanttFilterDraft(prev =>
                              prev.map(r =>
                                r.id === condRow.id
                                  ? {
                                      ...r,
                                      field: field as GanttTableFilterField,
                                      op: defaultOpForGanttFilterField(field as GanttTableFilterField),
                                      value: '',
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                        <Select
                          size="small"
                          className="wt-target-filter-panel__op"
                          value={condRow.op}
                          options={opsForGanttFilterField(condRow.field)}
                          onChange={op =>
                            setGanttFilterDraft(prev =>
                              prev.map(r => (r.id === condRow.id ? { ...r, op: op as GanttTableFilterCondition['op'] } : r)),
                            )
                          }
                        />
                        {renderGanttFilterValue(condRow)}
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label="删除条件"
                          onClick={() => setGanttFilterDraft(prev => prev.filter(r => r.id !== condRow.id))}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    style={{ paddingLeft: 0 }}
                    onClick={() =>
                      setGanttFilterDraft(prev => [
                        ...prev,
                        {
                          id: newGanttTableFilterId(),
                          field: 'status',
                          op: 'eq',
                          value: '',
                        },
                      ])
                    }
                  >
                    新增筛选条件
                  </Button>
                  <Divider style={{ margin: '10px 0 12px' }} />
                  <div className="wt-target-filter-panel__foot">
                    <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={resetGanttFilters}>
                      重置
                    </Button>
                    <Space size={8}>
                      <Button size="small" onClick={() => handleGanttFilterPopoverOpenChange(false)}>
                        取消
                      </Button>
                      <Button type="primary" size="small" onClick={commitGanttFilterDraft}>
                        确定
                      </Button>
                    </Space>
                  </div>
                </div>
              }
            >
              <span className="wt-target-page__tool wt-target-page__tool--filter" style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <FilterOutlined /> 筛选
                {ganttFilterAppliedActive ? <span className="wt-target-page__filter-badge" aria-hidden /> : null}
              </span>
            </Popover>
            <Dropdown
              trigger={['click']}
              menu={{
                items: GANTT_SORT_DROPDOWN_MENU_ITEMS,
                selectable: true,
                selectedKeys: [ganttSortKey],
                onClick: ({ key }) => setGanttSortKey(key as GanttTableSortKey),
              }}
            >
              <span
                className={`wt-target-page__tool${ganttSortKey !== 'custom' ? ' wt-target-page__tool--active' : ''}`}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
              >
                <SortAscendingOutlined /> 排序
              </span>
            </Dropdown>
            <Dropdown
              menu={{ items: groupMenuItems, onClick: onGroupMenuClick }}
              trigger={['click']}
              placement="bottomLeft"
            >
              <span
                className={`wt-target-page__tool${ganttGroupBy !== 'none' ? ' wt-target-page__tool--active' : ''}`}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
              >
                <UnorderedListOutlined /> 分组
              </span>
            </Dropdown>
            <Dropdown menu={hierarchyMenu} trigger={['click']} placement="bottomLeft">
              <span className="wt-target-page__tool" style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <ApartmentOutlined /> 层级
              </span>
            </Dropdown>
            <Segmented
              size="small"
              className="wt-gantt-page__toolbar-segmented"
              options={[
                { label: '平铺', value: 'flat' },
                { label: '树状', value: 'tree' },
              ]}
              value={ganttDisplayMode}
              onChange={v => onGanttDisplayModeChange(v as 'flat' | 'tree')}
            />
            <Typography.Text type="secondary">{visibleGanttRows.length} 个任务</Typography.Text>
          </Space>
        </div>
        {contentLoading ? (
          <ProjectGanttBodySkeleton />
        ) : (
        <div className="wt-gantt-page__body">
          <div className="wt-gantt-page__left" style={ganttLeftCssVars}>
            <div className="wt-gantt-page__left-head">
              <div className="wt-gantt-page__col wt-gantt-page__col--title wt-gantt-page__col--with-resize">
                <div className="wt-gantt-page__title-head-cell">
                  {ganttExpandLevel >= 2 ? <span className="wt-gantt-page__tree-toggle wt-gantt-page__tree-toggle--placeholder" aria-hidden /> : null}
                  <span className="wt-gantt-page__head-th-label">
                    <FileTextOutlined aria-hidden />
                    标题
                  </span>
                </div>
                <span
                  className="wt-gantt-page__resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="拖动调整状态列宽"
                  onMouseDown={onGanttLeftColResizeMouseDown('status')}
                />
              </div>
              <div className="wt-gantt-page__col wt-gantt-page__col--status wt-gantt-page__col--with-resize">
                <span className="wt-gantt-page__head-th-label">
                  <CheckCircleOutlined aria-hidden />
                  状态
                </span>
                <span
                  className="wt-gantt-page__resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="拖动调整负责人列宽"
                  onMouseDown={onGanttLeftColResizeMouseDown('owner')}
                />
              </div>
              <div className="wt-gantt-page__col wt-gantt-page__col--owner">
                <span className="wt-gantt-page__head-th-label">
                  <UserOutlined aria-hidden />
                  负责人
                </span>
              </div>
            </div>
            <div className="wt-gantt-page__left-list">
              {displayItems.map(item => {
                if (item.kind === 'group') {
                  const collapsed = collapsedGroupKeys.has(item.groupKey)
                  return (
                    <div key={item.id} className="wt-gantt-page__left-row wt-gantt-page__left-row--group">
                      <button
                        type="button"
                        className="wt-gantt-page__group-header"
                        onClick={() => toggleGroupCollapsed(item.groupKey)}
                        aria-expanded={!collapsed}
                      >
                        <span className="wt-gantt-page__group-toggle">{collapsed ? <RightOutlined /> : <DownOutlined />}</span>
                        <span className="wt-gantt-page__group-label">
                          {item.label}
                          <Typography.Text type="secondary" className="wt-gantt-page__group-count">
                            {' '}
                            ({item.count})
                          </Typography.Text>
                        </span>
                      </button>
                    </div>
                  )
                }
                const row = item.row
                const showTreeToggle = ganttExpandLevel >= 2 && row.depth === 1 && row.hasChildren
                const collapsed = collapsedParentKeys.has(row.key)
                const showToggleColumn = ganttExpandLevel >= 2
                return (
                  <div key={`left-${row.key}`} className="wt-gantt-page__left-row">
                    <div className="wt-gantt-page__col wt-gantt-page__col--title">
                      <div className="wt-gantt-page__title-cell">
                        {showToggleColumn ? (
                          showTreeToggle ? (
                            <button
                              type="button"
                              className="wt-gantt-page__tree-toggle"
                              aria-expanded={!collapsed}
                              onClick={e => {
                                e.stopPropagation()
                                toggleParentCollapsed(row.key)
                              }}
                            >
                              {collapsed ? <RightOutlined /> : <DownOutlined />}
                            </button>
                          ) : (
                            <span className="wt-gantt-page__tree-toggle wt-gantt-page__tree-toggle--placeholder" aria-hidden />
                          )
                        ) : null}
                        <button
                          type="button"
                          className="wt-gantt-page__title-link"
                          style={{ paddingLeft: indentPx(row) }}
                          title={row.title}
                          disabled={!onOpenTaskDetail}
                          onClick={e => {
                            e.stopPropagation()
                            onOpenTaskDetail?.(row.key)
                          }}
                        >
                          <span className="wt-gantt-page__title-link-inner">
                            <FileTextOutlined className="wt-gantt-page__title-row-icon" aria-hidden />
                            <span className="wt-gantt-page__title-link-text">{row.title}</span>
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="wt-gantt-page__col wt-gantt-page__col--status">
                      <UnifiedWorkflowStatusTag status={row.status} />
                    </div>
                    <div className="wt-gantt-page__col wt-gantt-page__col--owner">
                      <div className="wt-gantt-page__owner-cell">
                        <Avatar
                          size={22}
                          className={`${UNIFIED_OWNER_AVATAR_CLASS}${(row.owner || '').trim() ? '' : ' wt-reports-detail__owner-avatar--empty'}`}
                        >
                          {(row.owner || '').trim() ? unifiedOwnerAvatarInitials(row.owner!) : <UserOutlined />}
                        </Avatar>
                        <span className="wt-gantt-page__owner-name" title={row.owner || '未分配'}>
                          {row.owner || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {visibleGanttRows.length === 0 ? (
                <div className="wt-gantt-page__empty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务数据" />
                </div>
              ) : null}
            </div>
          </div>
          <div className="wt-gantt-page__right">
            <div className="wt-gantt-page__timeline-scroll">
              <div className="wt-gantt-page__timeline-inner" style={{ width: timelineWidthPx, minWidth: timelineWidthPx }}>
                <div className="wt-gantt-page__timeline-head">
                  {ganttDays.map(date => (
                    <div key={`day-${date.format('YYYY-MM-DD')}`} className="wt-gantt-page__day-cell">
                      {date.format('M/D')}
                    </div>
                  ))}
                </div>
                <div className="wt-gantt-page__timeline-body">
                  {displayItems.map(item => {
                    if (item.kind === 'group') {
                      return (
                        <div
                          key={`tg-${item.id}`}
                          className="wt-gantt-page__timeline-row wt-gantt-page__timeline-row--group"
                          style={{
                            width: timelineWidthPx,
                            minWidth: timelineWidthPx,
                            backgroundSize: `${GANTT_DAY_COLUMN_PX}px 44px`,
                          }}
                        />
                      )
                    }
                    const row = item.row
                    const offsetDays = Math.max(0, row.startDate.diff(ganttRange.start, 'day'))
                    const durationDays = Math.max(1, row.endDate.diff(row.startDate, 'day') + 1)
                    const leftPx = offsetDays * GANTT_DAY_COLUMN_PX
                    const widthPx = durationDays * GANTT_DAY_COLUMN_PX
                    return (
                      <div
                        key={`bar-${row.key}`}
                        className="wt-gantt-page__timeline-row"
                        style={{
                          width: timelineWidthPx,
                          minWidth: timelineWidthPx,
                          backgroundSize: `${GANTT_DAY_COLUMN_PX}px 44px`,
                        }}
                      >
                        <div className={`wt-gantt-page__bar ${ganttBarStatusClass(row.status)}`} style={{ left: leftPx, width: widthPx }}>
                          <span className="wt-gantt-page__bar-text">
                            {row.startLabel} - {row.endLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {taskManageEditorModalEl}
    </>
  )
}

import { Card } from 'antd'

const PROJECT_ROW_COUNT = 5
const TASK_ROW_COUNT = 6
const SCHEDULE_ROW_COUNT = 4

/** 宽度错落，避免每行完全一致 */
const TITLE_WIDTHS = ['58%', '72%', '48%', '65%', '80%', '54%', '70%'] as const

type SkLineProps = {
  width?: number | string
  className?: string
}

function Sk({ width, className = '' }: SkLineProps) {
  const style = width != null ? { width: typeof width === 'number' ? `${width}px` : width } : undefined
  return <span className={`wt-wb-sk wt-wb-sk--line ${className}`.trim()} style={style} aria-hidden />
}

function SkIcon() {
  return <span className="wt-wb-sk wt-wb-sk--icon" aria-hidden />
}

function SkAvatar() {
  return <span className="wt-wb-sk wt-wb-sk--avatar" aria-hidden />
}

function SkPill() {
  return <span className="wt-wb-sk wt-wb-sk--pill" aria-hidden />
}

function WorkbenchProjectRowSkeleton({ index }: { index: number }) {
  const titleW = TITLE_WIDTHS[index % TITLE_WIDTHS.length]
  return (
    <div className="wt-workbench__row wt-workbench__row--project wt-workbench__row--skeleton">
      <div className="wt-workbench__name">
        <SkIcon />
        <Sk width={titleW} />
      </div>
      <div className="wt-workbench__meta-col wt-workbench__meta-col--owner">
        <SkAvatar />
        <Sk width={index % 2 === 0 ? 40 : 52} />
      </div>
      <SkPill />
      <Sk width={72} className="wt-wb-sk--end" />
    </div>
  )
}

function WorkbenchTaskRowSkeleton({ index }: { index: number }) {
  const titleW = TITLE_WIDTHS[(index + 2) % TITLE_WIDTHS.length]
  return (
    <div className="wt-workbench__row wt-workbench__row--task wt-workbench__row--skeleton">
      <div className="wt-workbench__name">
        <SkIcon />
        <Sk width={titleW} />
      </div>
      <div className="wt-workbench__meta-col wt-workbench__meta-col--owner">
        <SkAvatar />
        <Sk width={44} />
      </div>
      <SkPill />
      <Sk width={68} className="wt-wb-sk--end" />
      <div className="wt-workbench__meta-col wt-workbench__meta-col--project">
        <SkIcon />
        <Sk width={56} />
      </div>
    </div>
  )
}

function WorkbenchScheduleRowSkeleton({ index }: { index: number }) {
  return (
    <div className="wt-workbench__schedule-item wt-workbench__schedule-item--skeleton">
      <Sk width={42} />
      <Sk width={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} />
    </div>
  )
}

export function WorkbenchProjectsListSkeleton() {
  return (
    <div className="wt-workbench__list wt-workbench__list--projects wt-workbench__list--skeleton">
      {Array.from({ length: PROJECT_ROW_COUNT }, (_, i) => (
        <WorkbenchProjectRowSkeleton key={i} index={i} />
      ))}
    </div>
  )
}

export function WorkbenchTasksListSkeleton() {
  return (
    <div className="wt-workbench__list wt-workbench__list--tasks wt-workbench__list--skeleton">
      {Array.from({ length: TASK_ROW_COUNT }, (_, i) => (
        <WorkbenchTaskRowSkeleton key={i} index={i} />
      ))}
    </div>
  )
}

export function WorkbenchScheduleRowsSkeleton() {
  return (
    <div className="wt-workbench__schedule-list wt-workbench__list--skeleton">
      {Array.from({ length: SCHEDULE_ROW_COUNT }, (_, i) => (
        <WorkbenchScheduleRowSkeleton key={i} index={i} />
      ))}
    </div>
  )
}

type WorkbenchPageSkeletonProps = {
  projects?: boolean
  schedule?: boolean
  tasks?: boolean
}

/** 与真实工作台同结构的整页骨架（使用真实 Card，避免假卡片样式错位） */
export function WorkbenchPageSkeleton({ projects = true, schedule = true, tasks = true }: WorkbenchPageSkeletonProps) {
  return (
    <div className="wt-workbench__grid wt-workbench__grid--custom" aria-busy="true" aria-label="工作台加载中">
      {projects ? (
        <Card
          className="wt-workbench__panel"
          title="我参与的项目"
          extra={<Sk width={52} className="wt-wb-sk--extra" />}
        >
          <WorkbenchProjectsListSkeleton />
        </Card>
      ) : null}

      {schedule ? (
        <Card
          className="wt-workbench__panel wt-workbench__panel--schedule"
          title={
            <div className="wt-workbench__schedule-head-title">
              <span className="wt-workbench__schedule-head-title-text">我的日程</span>
              <span className="wt-wb-sk wt-wb-sk--date" aria-hidden />
            </div>
          }
        >
          <div className="wt-workbench__schedule-stack">
            <div className="wt-workbench__schedule-scroll">
              <WorkbenchScheduleRowsSkeleton />
            </div>
          </div>
        </Card>
      ) : null}

      {tasks ? (
        <Card
          className="wt-workbench__panel wt-workbench__panel--tasks"
          title="我负责的任务"
          extra={<Sk width={52} className="wt-wb-sk--extra" />}
        >
          <WorkbenchTasksListSkeleton />
        </Card>
      ) : null}
    </div>
  )
}

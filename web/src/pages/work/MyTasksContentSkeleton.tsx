import { DetailSk, DetailSkPill, widthAt } from '../../features/project-detail/shared/projectDetailSkeletonPrimitives'

const COLUMN_META = ['收件箱', '今天要做', '下一步要做', '以后再做'] as const

type MyTasksTableBodySkeletonProps = {
  rowCount?: number
}

/** 我的任务 · 表格视图：仅表体 + 分页条占位 */
export function MyTasksTableBodySkeleton({ rowCount = 10 }: MyTasksTableBodySkeletonProps) {
  return (
    <div className="wt-my-tasks__content-skeleton" aria-busy="true" aria-label="任务列表加载中">
      <div className="wt-my-tasks__table-wrap wt-my-tasks__table-wrap--skeleton">
        <div className="wt-my-tasks-table-skeleton">
          <div className="wt-my-tasks-table-skeleton__thead">
            <DetailSk width={20} />
            <DetailSk width={72} />
            <DetailSk width="22%" />
            <DetailSk width={48} />
            <DetailSk width={52} />
            <DetailSk width={64} />
            <DetailSk width={72} />
            <DetailSk width={44} />
            <DetailSk width={80} />
            <DetailSk width={80} />
            <DetailSk width={56} />
            <DetailSk width={56} className="wt-wb-sk--end" />
          </div>
          {Array.from({ length: rowCount }, (_, i) => (
            <div key={i} className="wt-my-tasks-table-skeleton__row">
              <DetailSk width={16} />
              <DetailSk width={88} />
              <DetailSk width={widthAt(i)} />
              <DetailSk width={40} />
              <DetailSkPill />
              <DetailSk width={56} />
              <DetailSk width={64} />
              <DetailSk width={36} />
              <DetailSk width={72} />
              <DetailSk width={72} />
              <DetailSk width={48} />
              <DetailSk width={48} className="wt-wb-sk--end" />
            </div>
          ))}
        </div>
      </div>
      <div className="wt-my-tasks__table-pagination wt-my-tasks__table-pagination--skeleton">
        <DetailSk width={140} />
        <DetailSk width={200} className="wt-wb-sk--end" />
      </div>
    </div>
  )
}

type MyTasksBoardBodySkeletonProps = {
  cardsPerColumn?: number
}

/** 我的任务 · 看板视图：仅四列卡片区占位 */
export function MyTasksBoardBodySkeleton({ cardsPerColumn = 2 }: MyTasksBoardBodySkeletonProps) {
  return (
    <div className="wt-my-tasks__board wt-my-tasks__board--skeleton" aria-busy="true" aria-label="看板加载中">
      {COLUMN_META.map(title => (
        <div key={title} className="wt-my-tasks__column wt-my-tasks-board-skeleton__column">
          <div className="wt-my-tasks__column-header">
            <DetailSk width={56} />
            <DetailSk width={28} className="wt-wb-sk--end" />
          </div>
          <div className="wt-my-tasks__column-progress">
            <DetailSk width="100%" style={{ height: 6, borderRadius: 3 }} />
          </div>
          <div className="wt-my-tasks__column-body">
            <div className="wt-my-tasks__card-list">
              {Array.from({ length: cardsPerColumn }, (_, i) => (
                <div key={i} className="wt-my-tasks-board-skeleton__card">
                  <DetailSk width="78%" />
                  <DetailSk width="42%" style={{ marginTop: 10 }} />
                  <div className="wt-my-tasks-board-skeleton__card-foot">
                    <DetailSkPill />
                    <DetailSk width={22} style={{ borderRadius: '50%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

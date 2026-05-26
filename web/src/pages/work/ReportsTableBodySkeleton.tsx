import { DetailSk, DetailSkPill, widthAt } from '../../features/project-detail/shared/projectDetailSkeletonPrimitives'

type ReportsTableBodySkeletonProps = {
  /** 与主表列数一致：项目进度 7、项目延期 8、成员 6 */
  columnCount?: 6 | 7 | 8
  rowCount?: number
}

const GRID_BY_COLUMNS: Record<6 | 7 | 8, string> = {
  6: 'minmax(140px, 1.2fr) repeat(4, 72px) minmax(120px, 1fr)',
  7: 'minmax(160px, 1.3fr) 88px repeat(4, 72px) minmax(140px, 1fr)',
  8: 'minmax(160px, 1.2fr) 88px repeat(5, 72px) minmax(120px, 1fr)'
}

/** 报表页 · 仅主表数据区（表头 + 行 + 分页）骨架 */
export function ReportsTableBodySkeleton({ columnCount = 7, rowCount = 10 }: ReportsTableBodySkeletonProps) {
  const grid = GRID_BY_COLUMNS[columnCount]

  return (
    <div className="wt-reports-table-skeleton" aria-busy="true" aria-label="报表加载中" style={{ ['--wt-reports-sk-grid' as string]: grid }}>
      <div className="wt-reports-table-skeleton__table">
        <div className="wt-reports-table-skeleton__thead">
          {Array.from({ length: columnCount }, (_, i) => (
            <DetailSk
              key={i}
              width={i === 0 ? '28%' : i === columnCount - 1 ? '55%' : i === 1 && columnCount >= 7 ? 64 : 56}
              className={i === columnCount - 1 ? 'wt-wb-sk--end' : ''}
            />
          ))}
        </div>
        {Array.from({ length: rowCount }, (_, ri) => (
          <div key={ri} className="wt-reports-table-skeleton__row">
            {Array.from({ length: columnCount }, (_, ci) => {
              if (ci === 0) return <DetailSk key={ci} width={widthAt(ri)} />
              if (ci === 1 && columnCount >= 7) return <DetailSkPill key={ci} />
              if (ci === columnCount - 1) return <DetailSk key={ci} width="70%" className="wt-wb-sk--end" />
              return <DetailSk key={ci} width={36} />
            })}
          </div>
        ))}
      </div>
      <div className="wt-reports-table-skeleton__footer">
        <DetailSk width={72} />
        <DetailSk width={180} className="wt-wb-sk--end" />
      </div>
    </div>
  )
}

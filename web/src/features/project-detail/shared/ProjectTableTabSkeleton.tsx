import { DetailSk, DetailSkPill, widthAt } from './projectDetailSkeletonPrimitives'

type ProjectTableBodySkeletonProps = {
  /** 与真实 Table 的 className 一致，便于占位高度对齐 */
  tableClassName?: string
  rowCount?: number
  /** 是否占位底部分页条区域 */
  showFooter?: boolean
  ariaLabel?: string
}

/** 仅表格数据区（表头 + 行 + 可选分页条）骨架 */
export function ProjectTableBodySkeleton({
  tableClassName = 'wt-target-page__table',
  rowCount = 8,
  showFooter = true,
  ariaLabel = '表格加载中'
}: ProjectTableBodySkeletonProps) {
  return (
    <div className="wt-table-body-skeleton" aria-busy="true" aria-label={ariaLabel}>
      <div className={`wt-table-tab-skeleton__table ${tableClassName}`}>
        <div className="wt-table-tab-skeleton__thead">
          <DetailSk width={24} />
          <DetailSk width="28%" />
          <DetailSk width={72} />
          <DetailSk width={64} />
          <DetailSk width={56} />
          <DetailSk width={80} />
          <DetailSk width={48} />
        </div>
        {Array.from({ length: rowCount }, (_, i) => (
          <div key={i} className="wt-table-tab-skeleton__row">
            <DetailSk width={16} />
            <DetailSk width={widthAt(i)} />
            <DetailSkPill />
            <DetailSk width={52} />
            <DetailSk width={44} />
            <DetailSk width={68} className="wt-wb-sk--end" />
            <DetailSk width={36} className="wt-wb-sk--end" />
          </div>
        ))}
      </div>
      {showFooter ? (
        <div className="wt-target-page__footer wt-table-tab-skeleton__footer">
          <DetailSk width={120} />
          <DetailSk width={160} className="wt-table-tab-skeleton__pager" />
        </div>
      ) : null}
    </div>
  )
}

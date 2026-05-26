import { DetailSk, DetailSkPill, widthAt } from '../shared/projectDetailSkeletonPrimitives'

const DAY_COLS = 14

/** 仅甘特图主体（左侧列表 + 时间轴），不含工具条 */
export function ProjectGanttBodySkeleton() {
  return (
    <div className="wt-gantt-page__body wt-gantt-tab-skeleton__body" aria-busy="true" aria-label="甘特图内容加载中">
      <div className="wt-gantt-page__left">
        <div className="wt-gantt-page__left-head wt-gantt-tab-skeleton__left-head">
          <DetailSk width="40%" />
          <DetailSk width={72} />
          <DetailSk width={64} />
        </div>
        <div className="wt-gantt-page__left-list">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="wt-gantt-page__left-row wt-gantt-tab-skeleton__left-row">
              <DetailSk width={widthAt(i + 1)} style={{ paddingLeft: i % 2 === 0 ? 0 : 16 }} />
              <DetailSkPill />
              <div className="wt-gantt-tab-skeleton__owner">
                <span className="wt-wb-sk wt-wb-sk--avatar" aria-hidden />
                <DetailSk width={48} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="wt-gantt-tab-skeleton__timeline">
        <div className="wt-gantt-tab-skeleton__day-head">
          {Array.from({ length: DAY_COLS }, (_, i) => (
            <DetailSk key={i} width={32} style={{ height: 14 }} />
          ))}
        </div>
        <div className="wt-gantt-tab-skeleton__day-rows">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="wt-gantt-tab-skeleton__day-row">
              <span
                className="wt-wb-sk wt-wb-sk--line wt-gantt-tab-skeleton__bar"
                style={{
                  marginLeft: `${(i % 4) * 12 + 8}%`,
                  width: `${28 + (i % 3) * 12}%`
                }}
                aria-hidden
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

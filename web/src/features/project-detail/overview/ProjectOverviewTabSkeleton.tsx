import { Card, Col, Row } from 'antd'

const TITLE_WIDTHS = ['70%', '55%', '62%', '48%'] as const

function Sk({ width, className = '' }: { width?: number | string; className?: string }) {
  const style = width != null ? { width: typeof width === 'number' ? `${width}px` : width } : undefined
  return <span className={`wt-wb-sk wt-wb-sk--line ${className}`.trim()} style={style} aria-hidden />
}

function SkPill() {
  return <span className="wt-wb-sk wt-wb-sk--pill" aria-hidden />
}

/** 项目概览 Tab 加载骨架（与 ProjectOverviewTabView 布局一致） */
export function ProjectOverviewTabSkeleton() {
  return (
    <div className="wt-project-detail wt-project-detail--skeleton" aria-busy="true" aria-label="项目概览加载中">
      <div className="wt-project-detail__titlebar">
        <span className="wt-wb-sk wt-wb-sk--line" style={{ width: 72, height: 16 }} />
        <span className="wt-wb-sk wt-wb-sk--pill" style={{ width: 56, height: 28, borderRadius: 6 }} />
      </div>

      <div className="wt-project-detail__body">
        <div className="wt-project-detail__main">
          <Card variant="borderless" className="wt-panel">
            <div className="wt-project-hero wt-project-hero--skeleton">
              <div className="wt-project-hero__head-row">
                <span className="wt-wb-sk wt-wb-sk--icon" style={{ width: 72, height: 72, borderRadius: 8 }} />
                <div className="wt-project-hero__title-block" style={{ flex: 1, minWidth: 0 }}>
                  <Sk width="42%" />
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    <Sk width={88} />
                    <Sk width={88} />
                    <Sk width={120} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Sk width="100%" />
                <div style={{ marginTop: 8 }}>
                  <Sk width="78%" />
                </div>
              </div>
            </div>
          </Card>

          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} lg={12}>
              <Card variant="borderless" className="wt-panel" title={<Sk width={64} />}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <SkPill />
                  <SkPill />
                  <SkPill />
                </div>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <Sk width={i % 2 === 0 ? '55%' : '48%'} />
                    <Sk width={40} />
                  </div>
                ))}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card variant="borderless" className="wt-panel" title={<Sk width={80} />}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span className="wt-wb-sk wt-wb-sk--avatar" style={{ width: 48, height: 48 }} />
                  <div style={{ flex: 1 }}>
                    <Sk width="60%" />
                    <div style={{ marginTop: 8 }}>
                      <Sk width="40%" />
                    </div>
                  </div>
                </div>
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <Sk width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
                  </div>
                ))}
              </Card>
            </Col>
          </Row>
        </div>

        <div className="wt-project-detail__side">
          <Card variant="borderless" className="wt-panel" title={<Sk width={56} />}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span className="wt-wb-sk wt-wb-sk--avatar" />
                <div style={{ flex: 1 }}>
                  <Sk width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
                  <div style={{ marginTop: 6 }}>
                    <Sk width={64} />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

import { Empty, Typography } from 'antd'

/** 未配置后端 API 时阻断业务路由 */
export function BackendRequiredGate() {
  return (
    <div className="wt-backend-gate" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Empty
        description={
          <div style={{ maxWidth: 420 }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              需要连接后端服务
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              请配置 web/.env：开发环境留空 VITE_BACKEND_API_BASE（走 /api 代理），或填写完整 API 地址；并确保 npm run dev:stack 已启动后端。
            </Typography.Paragraph>
          </div>
        }
      />
    </div>
  )
}

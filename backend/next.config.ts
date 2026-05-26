import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** 与仓库根目录 lockfile 并存时，以启动 Next 时的目录（一般为 backend）为依赖追踪根 */
  outputFileTracingRoot: path.resolve(process.cwd()),
  /** 避免 Webpack 打包 native/体积依赖；运行时从 node_modules 加载 */
  serverExternalPackages: ['nodemailer', 'bcryptjs', 'mysql2', 'node-cron'],
  /**
   * Vite 前端放入 public/ 后由 Next 托管：无 app/page.tsx，需把未匹配路径回退到 index.html（React Router）。
   * fallback 在 /api、/assets、/_next 等之后生效，不会盖住 API。
   */
  async rewrites() {
    return {
      fallback: [
        { source: '/', destination: '/index.html' },
        { source: '/:path*', destination: '/index.html' },
      ],
    }
  },
}

export default nextConfig


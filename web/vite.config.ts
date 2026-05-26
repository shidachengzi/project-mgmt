import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:3000';
  const imSocketTarget = env.VITE_IM_SOCKET_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/im-uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: imSocketTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});

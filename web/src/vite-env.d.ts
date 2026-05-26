/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 企业 IM 外链模板，如 `https://im.example.com/chat?uid={{userId}}&name={{name}}` */
  readonly VITE_IM_CHAT_URL_TEMPLATE?: string
  /** 浏览器直连 Socket.io 的 origin（不设则开发环境用当前页 origin + Vite 代理） */
  readonly VITE_IM_SOCKET_BASE?: string
  /** Vite 开发时把 `/socket.io` 代理到 IM 进程（默认 http://localhost:3001） */
  readonly VITE_IM_SOCKET_PROXY_TARGET?: string
}
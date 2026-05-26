import { App } from 'antd'
import type { TabsProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../entities/auth/model/useAuthStore'
import { useOrgStore } from '../../../entities/org/model/useOrgStore'
import { clearAllLocalImThreads, removeImThread } from '../../../features/contacts-im/contactLocalImStorage'
import { useContactImUnreadStore } from '../../../features/contacts-im/contactImUnreadStore'
import { isBackendAuthEnabled } from '../../../shared/api/backendClient'
import {
  deleteInAppNotification,
  fetchInAppNotifications,
  fetchInAppUnreadSummary,
  patchInAppNotificationRead,
  postInAppNotificationsClearAll,
  postInAppNotificationsReadAll,
  type InAppNotificationCategory,
  type InAppNotificationDTO,
} from '../../../shared/api/inAppNotificationsApi'
import { buildImHeaderRows } from '../layoutUtils'
import { buildMessageInboxTabItems } from './messageInboxTabItems'

export type MessageInboxTabKey = 'system' | 'project' | 'chat'

export function useMessageInbox() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const orgMembers = useOrgStore(s => s.members)
  const imUnreadCounts = useContactImUnreadStore(s => s.counts)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MessageInboxTabKey>('system')
  const [imListTick, setImListTick] = useState(0)

  const showImInMessages = isBackendAuthEnabled() && Boolean(authedUserId)
  const inboxBackend = Boolean(isBackendAuthEnabled() && authedUserId)

  const [inboxSummary, setInboxSummary] = useState({ system: 0, project: 0 })
  const [inboxSystemItems, setInboxSystemItems] = useState<InAppNotificationDTO[]>([])
  const [inboxProjectItems, setInboxProjectItems] = useState<InAppNotificationDTO[]>([])
  const [inboxSystemTotal, setInboxSystemTotal] = useState(0)
  const [inboxProjectTotal, setInboxProjectTotal] = useState(0)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxReadFilter, setInboxReadFilter] = useState<'all' | 'read' | 'unread'>('all')
  const [inboxSystemPage, setInboxSystemPage] = useState(1)
  const [inboxProjectPage, setInboxProjectPage] = useState(1)
  const [inboxLoadMoreTab, setInboxLoadMoreTab] = useState<'system' | 'project' | null>(null)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpen(true), [])

  const imTotalUnread = useMemo(
    () => Object.values(imUnreadCounts).reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0),
    [imUnreadCounts],
  )
  const headerBellCount = (inboxBackend ? inboxSummary.system + inboxSummary.project : 0) + imTotalUnread

  const imHeaderRows = useMemo(
    () => (showImInMessages ? buildImHeaderRows(imUnreadCounts, orgMembers, authedUserId) : []),
    [showImInMessages, imUnreadCounts, orgMembers, authedUserId, imListTick],
  )

  const refreshInboxSummary = useCallback(async () => {
    if (!inboxBackend) {
      setInboxSummary({ system: 0, project: 0 })
      return
    }
    const res = await fetchInAppUnreadSummary()
    if (res.ok) setInboxSummary(res.data)
  }, [inboxBackend])

  const reloadInboxLists = useCallback(async () => {
    if (!inboxBackend) {
      setInboxSystemItems([])
      setInboxProjectItems([])
      setInboxSystemTotal(0)
      setInboxProjectTotal(0)
      return
    }
    setInboxLoading(true)
    setInboxSystemPage(1)
    setInboxProjectPage(1)
    try {
      const [sysRes, projRes] = await Promise.all([
        fetchInAppNotifications({ category: 'system', read: inboxReadFilter, page: 1, pageSize: 10 }),
        fetchInAppNotifications({ category: 'project', read: inboxReadFilter, page: 1, pageSize: 10 }),
      ])
      if (sysRes.ok) {
        setInboxSystemItems(sysRes.data.items)
        setInboxSystemTotal(sysRes.data.total)
      } else {
        setInboxSystemItems([])
        setInboxSystemTotal(0)
        message.warning(sysRes.message)
      }
      if (projRes.ok) {
        setInboxProjectItems(projRes.data.items)
        setInboxProjectTotal(projRes.data.total)
      } else {
        setInboxProjectItems([])
        setInboxProjectTotal(0)
        message.warning(projRes.message)
      }
      void refreshInboxSummary()
    } finally {
      setInboxLoading(false)
    }
  }, [inboxBackend, inboxReadFilter, message, refreshInboxSummary])

  const loadMoreInbox = useCallback(
    async (category: 'system' | 'project') => {
      if (!inboxBackend) return
      const page = category === 'system' ? inboxSystemPage : inboxProjectPage
      const nextPage = page + 1
      setInboxLoadMoreTab(category)
      try {
        const res = await fetchInAppNotifications({
          category,
          read: inboxReadFilter,
          page: nextPage,
          pageSize: 10,
        })
        if (!res.ok) {
          message.warning(res.message)
          return
        }
        if (category === 'system') {
          setInboxSystemItems(prev => [...prev, ...res.data.items])
          setInboxSystemPage(nextPage)
          setInboxSystemTotal(res.data.total)
        } else {
          setInboxProjectItems(prev => [...prev, ...res.data.items])
          setInboxProjectPage(nextPage)
          setInboxProjectTotal(res.data.total)
        }
      } finally {
        setInboxLoadMoreTab(null)
      }
    },
    [inboxBackend, inboxProjectPage, inboxReadFilter, inboxSystemPage, message],
  )

  useEffect(() => {
    void refreshInboxSummary()
  }, [refreshInboxSummary])

  useEffect(() => {
    if (!inboxBackend) return
    const onPing = () => {
      void refreshInboxSummary()
      if (drawerOpen) void reloadInboxLists()
    }
    window.addEventListener('pm-inbox-summary-refresh', onPing)
    return () => window.removeEventListener('pm-inbox-summary-refresh', onPing)
  }, [inboxBackend, drawerOpen, refreshInboxSummary, reloadInboxLists])

  useEffect(() => {
    if (!inboxBackend) return
    const id = window.setInterval(() => void refreshInboxSummary(), 60000)
    const onFocus = () => void refreshInboxSummary()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [inboxBackend, refreshInboxSummary])

  useEffect(() => {
    if (!showImInMessages) return
    const bump = () => setImListTick(t => t + 1)
    window.addEventListener('pm-im-thread-updated', bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener('pm-im-thread-updated', bump)
      window.removeEventListener('storage', bump)
    }
  }, [showImInMessages])

  useEffect(() => {
    if (drawerOpen && showImInMessages) useContactImUnreadStore.getState().hydrate()
  }, [drawerOpen, showImInMessages])

  useEffect(() => {
    if (!showImInMessages && activeTab === 'chat') setActiveTab('system')
  }, [showImInMessages, activeTab])

  useEffect(() => {
    if (!drawerOpen) return
    if (inboxSummary.project > 0) setActiveTab('project')
    else if (inboxSummary.system > 0) setActiveTab('system')
    else if (showImInMessages && imTotalUnread > 0) setActiveTab('chat')
    else setActiveTab('system')
  }, [drawerOpen, showImInMessages, imTotalUnread, inboxSummary.system, inboxSummary.project])

  useEffect(() => {
    if (!drawerOpen || !inboxBackend) return
    void reloadInboxLists()
  }, [drawerOpen, inboxBackend, reloadInboxLists])

  const markInboxRead = useCallback(
    async (id: string) => {
      const res = await patchInAppNotificationRead(id)
      if (!res.ok) {
        message.warning(res.message)
        return
      }
      void reloadInboxLists()
    },
    [message, reloadInboxLists],
  )

  const markInboxCategoryAllRead = useCallback(
    async (category: InAppNotificationCategory) => {
      const res = await postInAppNotificationsReadAll({ category })
      if (!res.ok) {
        message.warning(res.message)
        return
      }
      message.success(`已标记 ${res.data.updated} 条为已读`)
      void reloadInboxLists()
    },
    [message, reloadInboxLists],
  )

  const deleteInboxOne = useCallback(
    async (id: string) => {
      const res = await deleteInAppNotification(id)
      if (!res.ok) {
        message.warning(res.message)
        return
      }
      message.success('已清除')
      void reloadInboxLists()
    },
    [message, reloadInboxLists],
  )

  const clearInboxCategory = useCallback(
    async (category: InAppNotificationCategory) => {
      const res = await postInAppNotificationsClearAll({ category })
      if (!res.ok) {
        message.warning(res.message)
        return
      }
      message.success(`已清除 ${res.data.deleted} 条`)
      void reloadInboxLists()
    },
    [message, reloadInboxLists],
  )

  const clearAllChats = useCallback(() => {
    clearAllLocalImThreads()
    useContactImUnreadStore.getState().clearAll()
    setImListTick(t => t + 1)
    message.success('已清除全部本地会话与未读')
  }, [message])

  const clearOneChat = useCallback(
    (peerId: string) => {
      removeImThread(peerId)
      useContactImUnreadStore.getState().clear(peerId)
      setImListTick(t => t + 1)
      message.success('已清除该会话')
    },
    [message],
  )

  const openFromInboxRow = useCallback(
    (row: InAppNotificationDTO) => {
      if (row.taskId && row.projectId) {
        closeDrawer()
        navigate(`/projects/${row.projectId}/tasks?openTask=${encodeURIComponent(row.taskId)}`)
        return
      }
      if (row.eventId) {
        closeDrawer()
        navigate('/calendar')
        return
      }
      if (row.projectId) {
        closeDrawer()
        navigate(`/projects/${row.projectId}/overview`)
      }
    },
    [closeDrawer, navigate],
  )

  const openImPeer = useCallback(
    (peerId: string) => {
      closeDrawer()
      navigate({ pathname: '/contacts', search: `?imPeerId=${encodeURIComponent(peerId)}` })
    },
    [closeDrawer, navigate],
  )

  const tabItems: TabsProps['items'] = useMemo(
    () =>
      buildMessageInboxTabItems({
        showImInMessages,
        imHeaderRows,
        imTotalUnread,
        inboxBackend,
        inboxSummary,
        inboxLoading,
        inboxSystemItems,
        inboxProjectItems,
        inboxSystemTotal,
        inboxProjectTotal,
        inboxReadFilter,
        inboxLoadMoreTab,
        setInboxReadFilter,
        loadMoreInbox,
        markInboxCategoryAllRead,
        clearInboxCategory,
        markInboxRead,
        deleteInboxOne,
        openFromInboxRow,
        clearAllChats,
        clearOneChat,
        openImPeer,
      }),
    [
      showImInMessages,
      imHeaderRows,
      imTotalUnread,
      inboxBackend,
      inboxSummary,
      inboxLoading,
      inboxSystemItems,
      inboxProjectItems,
      inboxSystemTotal,
      inboxProjectTotal,
      inboxReadFilter,
      inboxLoadMoreTab,
      loadMoreInbox,
      markInboxCategoryAllRead,
      clearInboxCategory,
      markInboxRead,
      deleteInboxOne,
      openFromInboxRow,
      clearAllChats,
      clearOneChat,
      openImPeer,
    ],
  )

  const resolvedActiveTab: MessageInboxTabKey =
    tabItems?.some(t => t?.key === activeTab) ? activeTab : ((tabItems?.[0]?.key as MessageInboxTabKey) ?? 'system')

  return {
    headerBellCount,
    drawerOpen,
    openDrawer,
    closeDrawer,
    activeTab: resolvedActiveTab,
    setActiveTab,
    tabItems,
  }
}

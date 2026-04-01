/**
 * Notification Center Composable
 *
 * Singleton composable providing notification state and actions for the UI.
 * Connects to SSE stream for instant push delivery, with 30s polling fallback.
 * Fetches full notification list on-demand when the panel opens.
 */

import type {
  UserNotification,
  NotificationCategory,
  NotificationStatus,
  NotificationListResponse
} from '#shared/types/notifications'
import { FILTER_GROUP_CATEGORIES } from '#shared/types/notifications'
import type { NotificationFilterGroup } from '#shared/types/notifications'

const logger = createLogger('Notifications')

// Singleton state — shared across all component instances
const unreadCount = ref(0)
const notifications = ref<UserNotification[]>([])
const isLoading = ref(false)
const isPanelOpen = ref(false)
const hasMore = ref(false)
const nextKey = ref<string | null>(null)
const activeFilter = ref<'all' | 'unread' | string>('all')

// Polling state
let pollInterval: ReturnType<typeof setInterval> | null = null
const POLL_INTERVAL_MS = 30_000 // 30 seconds (fallback when SSE unavailable)
const SSE_POLL_INTERVAL_MS = 60_000 // 60 seconds (reduced when SSE active)

// SSE state
let eventSourceInstance: EventSource | null = null
let sseReconnectAttempts = 0
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null
const sseConnected = ref(false)

export function useNotifications() {
  const { loggedIn } = useOidcAuth()

  // ------------------------------------------------------------------
  // SSE: real-time push delivery
  // ------------------------------------------------------------------

  function connectSSE() {
    if (eventSourceInstance) return
    if (!import.meta.client) return

    try {
      eventSourceInstance = new EventSource('/api/notifications/stream')

      eventSourceInstance.addEventListener('connected', () => {
        sseConnected.value = true
        sseReconnectAttempts = 0
        logger.info('SSE connected — slowing poll interval')
        // Slow down polling since SSE handles real-time delivery
        stopPolling()
        pollInterval = setInterval(fetchUnreadCount, SSE_POLL_INTERVAL_MS)
      })

      eventSourceInstance.addEventListener('notification', (e: MessageEvent) => {
        try {
          const notification = JSON.parse(e.data) as UserNotification
          unreadCount.value++
          // Prepend to list if panel is open
          if (isPanelOpen.value) {
            notifications.value = [notification, ...notifications.value]
          }
        } catch (err) {
          logger.warn('Failed to parse SSE notification:', err)
        }
      })

      eventSourceInstance.addEventListener('ping', () => {
        // Keep-alive acknowledgment — no action needed
      })

      eventSourceInstance.onerror = () => {
        disconnectSSE()
        // Exponential backoff reconnect: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, sseReconnectAttempts), 30_000)
        sseReconnectAttempts++
        logger.info(`SSE disconnected — reconnecting in ${delay}ms (attempt ${sseReconnectAttempts})`)
        sseReconnectTimer = setTimeout(connectSSE, delay)
        // Restore fast polling as fallback
        stopPolling()
        pollInterval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)
      }
    } catch {
      // EventSource not supported or other error — rely on polling
      logger.warn('SSE not available, using polling only')
    }
  }

  function disconnectSSE() {
    if (eventSourceInstance) {
      eventSourceInstance.close()
      eventSourceInstance = null
    }
    sseConnected.value = false
    if (sseReconnectTimer) {
      clearTimeout(sseReconnectTimer)
      sseReconnectTimer = null
    }
  }

  // ------------------------------------------------------------------
  // Polling: unread count (fallback + periodic sync)
  // ------------------------------------------------------------------

  function startPolling() {
    if (pollInterval) return // Already polling

    // Fetch immediately, then poll
    fetchUnreadCount()
    pollInterval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)
    logger.info('Started notification polling')
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  async function fetchUnreadCount() {
    try {
      const result = await $fetch<{ success: boolean; data: { count: number } }>('/api/notifications/unread-count')

      if (result.success) {
        unreadCount.value = result.data.count
      }
    } catch (error) {
      logger.warn('Failed to fetch unread count:', error)
    }
  }

  // ------------------------------------------------------------------
  // Notification list
  // ------------------------------------------------------------------

  async function fetchNotifications(reset = true) {
    if (isLoading.value) return

    isLoading.value = true
    try {
      const params: Record<string, string> = {}

      if (!reset && nextKey.value) {
        params.lastKey = nextKey.value
      }
      if (activeFilter.value === 'unread') {
        params.status = 'unread'
      } else if (activeFilter.value !== 'all') {
        const groupCategories = FILTER_GROUP_CATEGORIES[activeFilter.value as NotificationFilterGroup]
        if (groupCategories) {
          params.category = groupCategories.join(',')
        } else {
          params.category = activeFilter.value
        }
      }

      const queryString = new URLSearchParams(params).toString()
      const url = `/api/notifications/list${queryString ? `?${queryString}` : ''}`

      const response = await $fetch<{ success: boolean; data: NotificationListResponse }>(url)

      if (response.success) {
        if (reset) {
          notifications.value = response.data.notifications
        } else {
          notifications.value = [...notifications.value, ...response.data.notifications]
        }
        nextKey.value = response.data.nextKey
        hasMore.value = response.data.hasMore
      }
    } catch (error) {
      logger.error('Failed to fetch notifications:', error)
    } finally {
      isLoading.value = false
    }
  }

  function loadMore() {
    if (hasMore.value && !isLoading.value) {
      fetchNotifications(false)
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  async function markAsRead(notificationId: string) {
    try {
      await $fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })

      // Optimistic update
      const notif = notifications.value.find(n => n.notificationId === notificationId)
      if (notif && notif.status === 'unread') {
        notif.status = 'read'
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (error) {
      logger.error('Failed to mark notification as read:', error)
    }
  }

  async function markAllAsRead() {
    try {
      await $fetch('/api/notifications/mark-all-read', { method: 'POST' })

      // Optimistic update
      notifications.value.forEach(n => { n.status = 'read' })
      unreadCount.value = 0
    } catch (error) {
      logger.error('Failed to mark all as read:', error)
    }
  }

  async function removeNotification(notificationId: string) {
    try {
      await $fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })

      // Optimistic update
      const idx = notifications.value.findIndex(n => n.notificationId === notificationId)
      if (idx !== -1) {
        const notif = notifications.value[idx]
        if (notif && notif.status === 'unread') {
          unreadCount.value = Math.max(0, unreadCount.value - 1)
        }
        notifications.value.splice(idx, 1)
      }
    } catch (error) {
      logger.error('Failed to delete notification:', error)
    }
  }

  // ------------------------------------------------------------------
  // Bulk actions: clear all, mute
  // ------------------------------------------------------------------

  async function clearAll() {
    try {
      await $fetch('/api/notifications/clear-all', { method: 'POST' })
      notifications.value = []
      unreadCount.value = 0
    } catch (error) {
      logger.error('Failed to clear all notifications:', error)
      throw error
    }
  }

  async function muteTemporarily(duration: '1h' | '4h' | '24h'): Promise<string | null> {
    try {
      const result = await $fetch<{ success: boolean; data: { mutedUntil: string | null } }>('/api/notifications/mute', {
        method: 'POST',
        body: { duration }
      })
      if (result.success) {
        // Temporarily stop polling while muted
        stopPolling()
        return result.data.mutedUntil
      }
      return null
    } catch (error) {
      logger.error('Failed to mute notifications:', error)
      throw error
    }
  }

  // ------------------------------------------------------------------
  // Panel open/close
  // ------------------------------------------------------------------

  function openPanel() {
    isPanelOpen.value = true
    fetchNotifications()
  }

  function closePanel() {
    isPanelOpen.value = false
  }

  function togglePanel() {
    if (isPanelOpen.value) {
      closePanel()
    } else {
      openPanel()
    }
  }

  function setFilter(filter: string) {
    activeFilter.value = filter
    fetchNotifications()
  }

  // ------------------------------------------------------------------
  // Lifecycle: auto-start/stop based on auth
  // ------------------------------------------------------------------

  if (import.meta.client) {
    watch(loggedIn, (isLoggedIn) => {
      if (isLoggedIn) {
        startPolling()
        connectSSE()
      } else {
        stopPolling()
        disconnectSSE()
        unreadCount.value = 0
        notifications.value = []
      }
    }, { immediate: true })
  }

  return {
    // State
    unreadCount: readonly(unreadCount),
    notifications: readonly(notifications),
    isLoading: readonly(isLoading),
    isPanelOpen: readonly(isPanelOpen),
    hasMore: readonly(hasMore),
    activeFilter: readonly(activeFilter),
    sseConnected: readonly(sseConnected),

    // Actions
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    muteTemporarily,
    openPanel,
    closePanel,
    togglePanel,
    setFilter,
    startPolling,
    stopPolling
  }
}

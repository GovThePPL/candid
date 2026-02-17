import { useState, useCallback, useRef, useEffect } from 'react'
import api from '../lib/api'
import { onNotification } from '../lib/socket'
import { useNotificationCount } from '../contexts/NotificationContext'

/**
 * Hook for paginated notification inbox with real-time updates.
 *
 * @returns {object} Notification state and controls
 */
export default function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const cursorRef = useRef(null)
  const fetchIdRef = useRef(0)
  const { decrementUnread, clearUnread } = useNotificationCount()

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    const id = ++fetchIdRef.current
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    cursorRef.current = null

    try {
      const result = await api.notifications.getNotifications({ limit: 20 })

      if (id !== fetchIdRef.current) return false

      setNotifications(result.items || [])
      cursorRef.current = result.nextCursor
      setHasMore(result.hasMore || false)
      return true
    } catch (err) {
      if (id !== fetchIdRef.current) return false
      console.error('[useNotifications] Fetch error:', err)
      setNotifications([])
      return false
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const result = await api.notifications.getNotifications({
        cursor: cursorRef.current,
        limit: 20,
      })

      setNotifications(prev => [...prev, ...(result.items || [])])
      cursorRef.current = result.nextCursor
      setHasMore(result.hasMore || false)
    } catch (err) {
      console.error('[useNotifications] Load more error:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore])

  const handleRefresh = useCallback(() => {
    fetchNotifications(true)
  }, [fetchNotifications])

  const markRead = useCallback(async (notificationId) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    )
    decrementUnread()

    try {
      await api.notifications.markRead(notificationId)
    } catch (err) {
      console.error('[useNotifications] Mark read error:', err)
      // Revert on failure
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: false } : n)
      )
    }
  }, [decrementUnread])

  // Listen for real-time notifications
  useEffect(() => {
    const cleanup = onNotification((notification) => {
      setNotifications(prev => [notification, ...prev])
    })
    return cleanup
  }, [])

  // Initial fetch — mark all read on server but preserve local isRead state
  useEffect(() => {
    fetchNotifications().then(success => {
      if (success) {
        api.notifications.markAllRead().catch(() => {})
        clearUnread()
      }
    })
  }, [fetchNotifications, clearUnread])

  return {
    notifications,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    fetchNotifications,
    loadMore,
    handleRefresh,
    markRead,
  }
}

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'
import { onNotification } from '../lib/socket'

const NotificationContext = createContext({
  unreadCount: 0,
  incrementUnread: () => {},
  decrementUnread: () => {},
  clearUnread: () => {},
  refreshUnreadCount: () => {},
})

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const mountedRef = useRef(true)

  const refreshUnreadCount = useCallback(async () => {
    try {
      const result = await api.notifications.getUnreadCount()
      if (mountedRef.current) {
        setUnreadCount(result.count || 0)
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch unread count:', err)
    }
  }, [])

  // Fetch initial count on mount
  useEffect(() => {
    mountedRef.current = true
    refreshUnreadCount()
    return () => { mountedRef.current = false }
  }, [refreshUnreadCount])

  // Listen for real-time notification events
  useEffect(() => {
    const cleanup = onNotification(() => {
      if (mountedRef.current) {
        setUnreadCount(prev => prev + 1)
      }
    })
    return cleanup
  }, [])

  const incrementUnread = useCallback(() => {
    setUnreadCount(prev => prev + 1)
  }, [])

  const decrementUnread = useCallback(() => {
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const clearUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return (
    <NotificationContext.Provider value={{
      unreadCount,
      incrementUnread,
      decrementUnread,
      clearUnread,
      refreshUnreadCount,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotificationCount() {
  return useContext(NotificationContext)
}

export default NotificationContext

/**
 * Hook for managing chat history data with stale-while-revalidate caching.
 *
 * Handles: fetching chat list, metadata-based cache invalidation,
 * kudos sending, and pull-to-refresh.
 */
import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../contexts/UserContext'
import api, { translateError } from '../lib/api'
import { CacheManager, CacheKeys } from '../lib/cache'
import { useToast } from '../components/Toast'

export default function useChatHistory() {
  const { user } = useContext(UserContext)
  const { t } = useTranslation('chat')
  const showToast = useToast()

  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchChats = useCallback(async (isRefresh = false) => {
    if (!user?.id) return

    const cacheKey = CacheKeys.userChats(user.id)

    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      // Try to show cached data immediately (stale-while-revalidate)
      if (!isRefresh) {
        const cached = await CacheManager.get(cacheKey)
        if (cached?.data) {
          setChats(cached.data)
          setLoading(false)
        }
      }

      // Check metadata to see if we need to fetch fresh data
      const shouldFetch = await (async () => {
        if (isRefresh) return true // Always fetch on pull-to-refresh

        try {
          const metadata = await api.chat.getUserChatsMetadata(user.id)
          const cached = await CacheManager.get(cacheKey)

          // No cache - need to fetch
          if (!cached) return true

          // Check if count changed
          if (metadata.count !== cached.metadata?.count) return true

          // Check if last activity time changed
          if (metadata.lastActivityTime !== cached.metadata?.lastActivityTime) return true

          // Cache is fresh - no need to fetch
          return false
        } catch {
          // If metadata check fails, fetch full data to be safe
          return true
        }
      })()

      if (shouldFetch) {
        const data = await api.chat.getUserChats(user.id, { limit: 50 })
        setChats(data)

        // Get fresh metadata for cache
        let metadata = null
        try {
          metadata = await api.chat.getUserChatsMetadata(user.id)
        } catch {
          metadata = { count: data.length, lastActivityTime: new Date().toISOString() }
        }

        // Cache the result
        await CacheManager.set(cacheKey, data, { metadata })
      }
    } catch (err) {
      console.error('Failed to fetch chats:', err)
      // If we have cached data, show it with a warning
      const cached = await CacheManager.get(cacheKey)
      if (cached?.data) {
        setChats(cached.data)
      }
      setError(translateError(err.message, t) || t('failedLoadChats'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchChats()
  }, [fetchChats])

  const handleSendKudos = useCallback(async (chatId) => {
    try {
      await api.chat.sendKudos(chatId)
      // Update local state to reflect kudos sent
      setChats(prev => prev.map(chat =>
        chat.id === chatId ? { ...chat, kudosSent: true } : chat
      ))
      // Invalidate chat list cache since kudos status changed
      if (user?.id) {
        await CacheManager.invalidate(CacheKeys.userChats(user.id))
      }
    } catch (err) {
      // 409 = already sent kudos to this user for this topic — treat as sent
      if (err?.status === 409 || err?.message?.includes('409')) {
        setChats(prev => prev.map(chat =>
          chat.id === chatId ? { ...chat, kudosSent: true } : chat
        ))
      } else {
        console.error('Failed to send kudos:', err)
        showToast(t('errorKudosFailed'))
      }
    }
  }, [user?.id, showToast, t])

  const handleRefresh = useCallback(() => {
    fetchChats(true)
  }, [fetchChats])

  return {
    chats, loading, refreshing, error,
    fetchChats, handleSendKudos, handleRefresh,
  }
}

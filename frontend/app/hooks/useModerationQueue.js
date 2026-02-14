/**
 * Hook for managing the moderation queue state, fetching, and action handlers.
 */
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import api, { translateError } from '../lib/api'
import { useUser } from './useUser'

export default function useModerationQueue() {
  const { t } = useTranslation('moderation')
  const router = useRouter()
  const { user } = useUser()

  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)
  const [dismissModalVisible, setDismissModalVisible] = useState(false)
  const [appealResponseModalVisible, setAppealResponseModalVisible] = useState(false)
  const [appealResponseType, setAppealResponseType] = useState(null)
  const [modifyModalVisible, setModifyModalVisible] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [historyUserId, setHistoryUserId] = useState(null)
  const [historyUser, setHistoryUser] = useState(null)

  const currentItem = queue[currentIndex]

  const handleChatPress = useCallback((chatId, reporterId) => {
    if (chatId) {
      router.push(`/chat/${chatId}?from=moderation${reporterId ? `&reporterId=${reporterId}` : ''}`)
    }
  }, [router])

  const handleHistoryPress = useCallback((user) => {
    setHistoryUserId(user.id)
    setHistoryUser(user)
    setHistoryModalVisible(true)
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.moderation.getQueue()
      setQueue(data || [])
      setCurrentIndex(0)
    } catch (err) {
      console.error('Failed to fetch mod queue:', err)
      setError(translateError(err.message, t) || t('failedLoadQueue'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Auto-claim reports when they become the current item
  const currentReportId = currentItem?.type === 'report' ? currentItem.data.id : null
  useEffect(() => {
    if (currentReportId) {
      api.moderation.claimReport(currentReportId, user?.id).catch(err => {
        console.error('Failed to claim report:', err)
      })
    }
  }, [currentReportId])

  const advanceQueue = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      fetchQueue()
    }
  }, [currentIndex, queue.length, fetchQueue])

  // Report actions
  const handlePass = useCallback(async () => {
    if (currentItem?.type === 'report') {
      try {
        await api.moderation.releaseReport(currentItem.data.id)
      } catch (err) {
        console.error('Failed to release report:', err)
      }
    }
    advanceQueue()
  }, [currentItem, advanceQueue])

  const handleDismiss = useCallback(async () => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, {
        modResponse: 'dismiss',
        modResponseText: responseText || undefined,
      })
      setDismissModalVisible(false)
      setResponseText('')
      advanceQueue()
    } catch (err) {
      console.error('Failed to dismiss report:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, responseText, advanceQueue, processing])

  const handleMarkSpurious = useCallback(async () => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, {
        modResponse: 'mark_spurious',
      })
      advanceQueue()
    } catch (err) {
      console.error('Failed to mark spurious:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  const handleTakeAction = useCallback(async (actionRequest) => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, actionRequest)
      setActionModalVisible(false)
      advanceQueue()
    } catch (err) {
      console.error('Failed to take action:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  // Appeal actions
  const handleAppealResponse = useCallback(async () => {
    if (!currentItem || !appealResponseType || processing) return
    setProcessing(true)
    try {
      await api.moderation.respondToAppeal(currentItem.data.id, {
        response: appealResponseType,
        responseText: responseText,
      })
      setAppealResponseModalVisible(false)
      setResponseText('')
      setAppealResponseType(null)
      advanceQueue()
    } catch (err) {
      console.error('Failed to respond to appeal:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, appealResponseType, responseText, advanceQueue, processing])

  const handleDismissAdminResponse = useCallback(async () => {
    if (!currentItem || currentItem.type !== 'admin_response_notification' || processing) return
    setProcessing(true)
    try {
      await api.moderation.dismissAdminResponseNotification(currentItem.data.modActionAppealId)
      advanceQueue()
    } catch (err) {
      console.error('Failed to dismiss admin response notification:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  const handleModifyAction = useCallback(async (actionRequest) => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.respondToAppeal(currentItem.data.id, {
        response: 'modify',
        responseText: actionRequest.modResponseText || '',
        actions: actionRequest.actions,
      })
      setModifyModalVisible(false)
      advanceQueue()
    } catch (err) {
      console.error('Failed to modify action:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  return {
    // State
    queue, currentItem, loading, error, processing,
    responseText, setResponseText,
    appealResponseType, setAppealResponseType,
    // Modal visibility
    actionModalVisible, setActionModalVisible,
    dismissModalVisible, setDismissModalVisible,
    appealResponseModalVisible, setAppealResponseModalVisible,
    modifyModalVisible, setModifyModalVisible,
    historyModalVisible, setHistoryModalVisible,
    historyUserId, historyUser,
    // Handlers
    fetchQueue,
    handleChatPress, handleHistoryPress,
    handlePass, handleDismiss, handleMarkSpurious, handleTakeAction,
    handleAppealResponse, handleDismissAdminResponse, handleModifyAction,
  }
}

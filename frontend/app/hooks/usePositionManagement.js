/**
 * Hook for managing position and chatting list data in the Create screen.
 *
 * Handles: fetching, CRUD operations, cache invalidation, and data normalization
 * for both "My Positions" and "Chatting List" sections.
 */
import { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react'
import { Platform, Alert as RNAlert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../contexts/UserContext'
import api, { translateError } from '../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'

// Cross-platform alert that works on web
const Alert = {
  alert: (title, message, buttons) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length === 2) {
        const destructiveButton = buttons.find(b => b.style === 'destructive')
        const cancelButton = buttons.find(b => b.style === 'cancel')
        if (destructiveButton && cancelButton) {
          if (window.confirm(`${title}\n\n${message}`)) {
            destructiveButton.onPress?.()
          }
          return
        }
      }
      window.alert(`${title}\n\n${message}`)
    } else {
      RNAlert.alert(title, message, buttons)
    }
  }
}

export default function usePositionManagement() {
  const { t } = useTranslation('create')
  const { user, positionsVersion } = useContext(UserContext)

  const [myPositions, setMyPositions] = useState([])
  const [chattingList, setChattingList] = useState([])
  const [chattingListLoading, setChattingListLoading] = useState(false)
  const lastFetchedVersion = useRef(-1)

  const fetchMyPositions = useCallback(async () => {
    try {
      const cacheKey = user?.id ? CacheKeys.userPositions(user.id) : null
      if (cacheKey) {
        const cached = await CacheManager.get(cacheKey)
        if (cached && !CacheManager.isStale(cached, CacheDurations.POSITIONS)) {
          setMyPositions(cached.data)
          return
        }
      }
      const positionsData = await api.users.getMyPositions('all')
      setMyPositions(positionsData || [])
      if (cacheKey) {
        await CacheManager.set(cacheKey, positionsData || [])
      }
    } catch (err) {
      console.error('Failed to fetch my positions:', err)
    }
  }, [user?.id])

  const fetchChattingList = useCallback(async () => {
    try {
      setChattingListLoading(true)
      const cacheKey = user?.id ? CacheKeys.chattingList(user.id) : null
      if (cacheKey) {
        const cached = await CacheManager.get(cacheKey)
        if (cached && !CacheManager.isStale(cached, CacheDurations.CHATTING_LIST)) {
          setChattingList(cached.data)
          setChattingListLoading(false)
          return
        }
      }
      const data = await api.chattingList.getList()
      setChattingList(data || [])
      if (cacheKey) {
        await CacheManager.set(cacheKey, data || [])
      }
    } catch (err) {
      console.error('Failed to fetch chatting list:', err)
    } finally {
      setChattingListLoading(false)
    }
  }, [user?.id])

  // Initial fetch and version-based refetch
  useEffect(() => {
    async function fetchData() {
      await fetchMyPositions()
      await fetchChattingList()
      lastFetchedVersion.current = positionsVersion
    }
    fetchData()
  }, [fetchMyPositions, fetchChattingList, positionsVersion])

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (lastFetchedVersion.current !== positionsVersion) {
        if (user?.id) CacheManager.invalidate(CacheKeys.userPositions(user.id))
        fetchMyPositions()
        lastFetchedVersion.current = positionsVersion
      }
      fetchChattingList()
    }, [fetchMyPositions, fetchChattingList, positionsVersion, user?.id])
  )

  // --- Position CRUD ---

  const handleTogglePositionActive = useCallback(async (id, newActive) => {
    const newStatus = newActive ? 'active' : 'inactive'
    try {
      await api.users.updatePosition(id, newStatus)
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      setMyPositions(prev => prev.map(p =>
        p.id === id ? { ...p, status: newStatus } : p
      ))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedUpdate'))
    }
  }, [user?.id])

  const handleDeletePositions = useCallback(async (ids) => {
    try {
      for (const id of ids) {
        await api.users.deletePosition(id)
      }
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      setMyPositions(prev => prev.filter(p => !ids.includes(p.id)))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedDelete'))
      await fetchMyPositions()
    }
  }, [user?.id, fetchMyPositions])

  const handleBulkTogglePositions = useCallback(async (ids, newActive) => {
    const newStatus = newActive ? 'active' : 'inactive'
    try {
      for (const id of ids) {
        await api.users.updatePosition(id, newStatus)
      }
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      setMyPositions(prev => prev.map(p =>
        ids.includes(p.id) ? { ...p, status: newStatus } : p
      ))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedUpdateItems'))
      await fetchMyPositions()
    }
  }, [user?.id, fetchMyPositions])

  // Adopt an existing position (returns true on success)
  const adoptPosition = useCallback(async (positionId) => {
    try {
      await api.positions.adopt(positionId)
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      await fetchMyPositions()
      return true
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedAdopt'))
      return false
    }
  }, [user?.id, fetchMyPositions])

  // Create a new position (returns { success, error })
  const createPosition = useCallback(async (statement, categoryId, locationId) => {
    try {
      await api.positions.create(statement, categoryId, locationId)
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      await fetchMyPositions()
      return { success: true }
    } catch (err) {
      return { success: false, error: translateError(err.message, t) || t('failedCreate') }
    }
  }, [user?.id, fetchMyPositions])

  // --- Chatting list CRUD ---

  const handleToggleChattingActive = useCallback(async (id, newActive) => {
    try {
      await api.chattingList.toggleActive(id, newActive)
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      setChattingList(prev => prev.map(i =>
        i.id === id ? { ...i, isActive: newActive } : i
      ))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedUpdateItem'))
    }
  }, [user?.id])

  const handleDeleteChattingItems = useCallback(async (ids) => {
    try {
      await api.chattingList.bulkRemove({ itemIds: ids })
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      const idSet = new Set(ids)
      setChattingList(prev => prev.filter(i => !idSet.has(i.id)))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedRemoveItems'))
      await fetchChattingList()
    }
  }, [user?.id, fetchChattingList])

  const handleBulkToggleChattingItems = useCallback(async (ids, newActive) => {
    try {
      for (const id of ids) {
        await api.chattingList.toggleActive(id, newActive)
      }
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      setChattingList(prev => prev.map(i =>
        ids.includes(i.id) ? { ...i, isActive: newActive } : i
      ))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedUpdateItems'))
      await fetchChattingList()
    }
  }, [user?.id, fetchChattingList])

  const addToChattingList = useCallback(async (positionId) => {
    try {
      await api.chattingList.addPosition(positionId)
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      await fetchChattingList()
      return true
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedAddToList'))
      return false
    }
  }, [user?.id, fetchChattingList])

  // --- Normalized data for PositionListManager ---

  const normalizedMyPositions = useMemo(() =>
    myPositions.map(p => ({
      id: p.id,
      statement: p.statement,
      isActive: p.status === 'active',
      locationName: p.locationName || t('unknownLocation'),
      locationCode: p.locationCode || '',
      categoryName: p.categoryName || t('uncategorized'),
      categoryId: p.categoryId,
    })),
    [myPositions]
  )

  const normalizedChattingList = useMemo(() =>
    chattingList.map(item => ({
      id: item.id,
      statement: item.position?.statement,
      isActive: item.isActive,
      locationName: item.position?.location?.name || t('unknownLocation'),
      locationCode: item.position?.location?.code || '',
      categoryName: item.position?.category?.label || t('uncategorized'),
      categoryId: item.position?.categoryId,
      meta: item.pendingRequestCount > 0 ? t('pendingCount', { count: item.pendingRequestCount }) : undefined,
    })),
    [chattingList]
  )

  return {
    // State
    chattingList, chattingListLoading,
    // Normalized data
    normalizedMyPositions, normalizedChattingList,
    // Position actions
    handleTogglePositionActive, handleDeletePositions, handleBulkTogglePositions,
    adoptPosition, createPosition,
    // Chatting list actions
    handleToggleChattingActive, handleDeleteChattingItems, handleBulkToggleChattingItems,
    addToChattingList,
  }
}

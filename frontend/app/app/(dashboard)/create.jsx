import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, Alert as RNAlert, ActivityIndicator, Animated, LayoutAnimation, UIManager } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react'

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SemanticColors } from '../../constants/Colors'
import { Shadows, Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'
import { UserContext } from '../../contexts/UserContext'
import api, { translateError } from '../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'

import ThemedText from "../../components/ThemedText"
import ThemedTextInput from "../../components/ThemedTextInput"
import ThemedButton from '../../components/ThemedButton'
import Header from '../../components/Header'
import InfoModal from '../../components/InfoModal'
import LocationCategorySelector from '../../components/LocationCategorySelector'
import EmptyState from '../../components/EmptyState'
import BottomDrawerModal from '../../components/BottomDrawerModal'
import PositionListManager from '../../components/PositionListManager'

const MAX_STATEMENT_LENGTH = 140  // Polis has a 140 character limit
const SEARCH_DEBOUNCE_MS = 500
const MIN_SEARCH_LENGTH = 20

// Cross-platform alert that works on web
const Alert = {
  alert: (title, message, buttons) => {
    if (Platform.OS === 'web') {
      // For web, use window.confirm for destructive actions
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
      // For simple alerts
      window.alert(`${title}\n\n${message}`)
    } else {
      RNAlert.alert(title, message, buttons)
    }
  }
}

export default function Create() {
  const { t } = useTranslation('create')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [statement, setStatement] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [myPositions, setMyPositions] = useState([])
  const [similarPositions, setSimilarPositions] = useState([])
  const [searchingSimilar, setSearchingSimilar] = useState(false)
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [categoryAutoSelected, setCategoryAutoSelected] = useState(false)

  // Rules modal state
  const [showRules, setShowRules] = useState(false)
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)

  // Chatting List state
  const [chattingList, setChattingList] = useState([])
  const [chattingListLoading, setChattingListLoading] = useState(false)
  const [showChattingSearch, setShowChattingSearch] = useState(false)
  const [chattingSearchQuery, setChattingSearchQuery] = useState('')
  const [chattingSearchResults, setChattingSearchResults] = useState([])
  const [searchingChatting, setSearchingChatting] = useState(false)
  const [showChattingExplanation, setShowChattingExplanation] = useState(false)

  // Floating action bar state (shared across both PositionListManagers, supports delete and chat modes)
  const [floatingBar, setFloatingBar] = useState({ visible: false, count: 0, mode: null, ref: null })
  const positionsListRef = useRef(null)
  const chattingListRef = useRef(null)
  const scrollViewRef = useRef(null)
  const myPositionsSectionY = useRef(0)
  const chattingListSectionY = useRef(0)
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const router = useRouter()
  const searchTimeoutRef = useRef(null)
  const chattingSearchTimeoutRef = useRef(null)
  const { user, positionsVersion, isBanned } = useContext(UserContext)
  const lastFetchedVersion = useRef(-1) // -1 means never fetched

  // Animation values for similar positions
  const similarFadeAnim = useRef(new Animated.Value(0)).current
  const previousSimilarCount = useRef(0)

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

  async function fetchRules() {
    if (rules.length > 0) return // Already fetched
    setRulesLoading(true)
    try {
      const data = await api.moderation.getRules()
      setRules(data || [])
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    } finally {
      setRulesLoading(false)
    }
  }

  function handleOpenRules() {
    setShowRules(true)
    fetchRules()
  }

  useEffect(() => {
    async function fetchData() {
      await fetchMyPositions()
      await fetchChattingList()
      lastFetchedVersion.current = positionsVersion
    }
    fetchData()
  }, [fetchMyPositions, fetchChattingList, positionsVersion])

  // Refresh positions and chatting list when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (lastFetchedVersion.current !== positionsVersion) {
        // Invalidate positions cache when version changes
        if (user?.id) CacheManager.invalidate(CacheKeys.userPositions(user.id))
        fetchMyPositions()
        lastFetchedVersion.current = positionsVersion
      }
      // Chatting list uses cache - will only fetch if stale
      fetchChattingList()
    }, [fetchMyPositions, fetchChattingList, positionsVersion, user?.id])
  )

  // Debounced search for similar positions and category suggestion
  useEffect(() => {
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Don't search if statement is too short
    if (statement.trim().length < MIN_SEARCH_LENGTH) {
      setSimilarPositions([])
      setSearchingSimilar(false)
      setSuggestedCategory(null)
      return
    }

    setSearchingSimilar(true)

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Search for similar positions WITHOUT category filter to get broad results
        const similarResults = await api.positions.searchSimilar(statement.trim(), {
          locationId: selectedLocation,
          limit: 10, // Get more results to better determine category
        })

        setSimilarPositions((similarResults || []).slice(0, 5)) // Show only top 5

        // Suggest category based on most common category among similar positions
        if (similarResults && similarResults.length > 0) {
          // Count categories, weighted by similarity score
          const categoryScores = {}
          similarResults.forEach(result => {
            const catId = result.position.categoryId
            const catName = result.position.category?.label
            if (catId && catName) {
              if (!categoryScores[catId]) {
                categoryScores[catId] = { id: catId, label: catName, score: 0, count: 0 }
              }
              categoryScores[catId].score += result.similarity
              categoryScores[catId].count += 1
            }
          })

          // Find category with highest weighted score
          const topCategory = Object.values(categoryScores)
            .sort((a, b) => b.score - a.score)[0]

          if (topCategory) {
            setSuggestedCategory({
              category: { id: topCategory.id, label: topCategory.label },
              score: topCategory.score / topCategory.count // Average similarity
            })

            // Auto-select if no category manually selected by user
            // (either no selection yet, or previous selection was auto)
            if (!selectedCategory || categoryAutoSelected) {
              setSelectedCategory(topCategory.id)
              setCategoryAutoSelected(true)
            }
          }
        }
      } catch (err) {
        console.error('Error searching similar positions:', err)
        setSimilarPositions([])
      } finally {
        setSearchingSimilar(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [statement, selectedLocation])

  // Animate when similar positions appear/disappear
  useEffect(() => {
    const showingSimilar = searchingSimilar || similarPositions.length > 0
    const wasShowingSimilar = previousSimilarCount.current > 0

    if (showingSimilar && !wasShowingSimilar) {
      // Fade in when similar positions appear
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      Animated.timing(similarFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    } else if (!showingSimilar && wasShowingSimilar) {
      // Fade out when similar positions disappear
      Animated.timing(similarFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start()
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    }

    previousSimilarCount.current = showingSimilar ? 1 : 0
  }, [searchingSimilar, similarPositions.length, similarFadeAnim])

  async function handleAdoptPosition(positionId) {
    try {
      await api.positions.adopt(positionId)
      // Invalidate positions cache
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      // Clear form and refresh my positions
      setStatement('')
      setSimilarPositions([])
      setSelectedCategory(null)
      setCategoryAutoSelected(false)
      setSuggestedCategory(null)
      await fetchMyPositions()
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedAdopt'))
    }
  }

  async function handleSubmit() {
    if (!statement.trim()) {
      setError(t('errorEnterStatement'))
      return
    }
    if (!selectedCategory) {
      setError(t('errorSelectCategory'))
      return
    }
    if (!selectedLocation) {
      setError(t('errorSelectLocation'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      await api.positions.create(statement.trim(), selectedCategory, selectedLocation)

      // Invalidate positions cache
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))

      setStatement("")
      setSelectedCategory(null)
      setCategoryAutoSelected(false)
      setSuggestedCategory(null)
      setSimilarPositions([])

      // Refresh the positions list to show the new position
      await fetchMyPositions()
    } catch (err) {
      setError(translateError(err.message, t) || t('failedCreate'))
    } finally {
      setLoading(false)
    }
  }

  // Scroll to section when search input is focused
  const scrollToMyPositions = useCallback(() => {
    // Offset past the section header (~60px for title + subtitle + margin)
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: myPositionsSectionY.current + 60, animated: true })
    }, 50)
  }, [])
  const scrollToChattingList = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: chattingListSectionY.current + 60, animated: true })
    }, 50)
  }, [])

  // --- PositionListManager callbacks for My Positions ---

  async function handleTogglePositionActive(id, newActive) {
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
  }

  async function handleDeletePositions(ids) {
    try {
      for (const id of ids) {
        await api.users.deletePosition(id)
      }
      if (user?.id) await CacheManager.invalidate(CacheKeys.userPositions(user.id))
      setMyPositions(prev => prev.filter(p => !ids.includes(p.id)))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedDelete'))
      // Refresh to get accurate state
      await fetchMyPositions()
    }
  }

  async function handleBulkTogglePositions(ids, newActive) {
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
  }

  // --- PositionListManager callbacks for Chatting List ---

  async function handleToggleChattingActive(id, newActive) {
    try {
      await api.chattingList.toggleActive(id, newActive)
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      setChattingList(prev => prev.map(i =>
        i.id === id ? { ...i, isActive: newActive } : i
      ))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedUpdateItem'))
    }
  }

  async function handleDeleteChattingItems(ids) {
    try {
      await api.chattingList.bulkRemove({ itemIds: ids })
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      const idSet = new Set(ids)
      setChattingList(prev => prev.filter(i => !idSet.has(i.id)))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedRemoveItems'))
      await fetchChattingList()
    }
  }

  async function handleBulkToggleChattingItems(ids, newActive) {
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
  }

  // --- Normalize data for PositionListManager ---

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

  // Chatting list search with debounce
  useEffect(() => {
    if (chattingSearchTimeoutRef.current) {
      clearTimeout(chattingSearchTimeoutRef.current)
    }

    if (!showChattingSearch || chattingSearchQuery.trim().length < MIN_SEARCH_LENGTH) {
      setChattingSearchResults([])
      setSearchingChatting(false)
      return
    }

    setSearchingChatting(true)

    chattingSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.positions.searchSimilar(chattingSearchQuery.trim(), {
          limit: 10,
        })

        // Filter out positions already in chatting list
        const chattingListPositionIds = new Set(chattingList.map(item => item.positionId))
        const filtered = (results || []).filter(
          result => !chattingListPositionIds.has(result.position.id)
        )

        setChattingSearchResults(filtered.slice(0, 5))
      } catch (err) {
        console.error('Error searching positions for chatting list:', err)
        setChattingSearchResults([])
      } finally {
        setSearchingChatting(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (chattingSearchTimeoutRef.current) {
        clearTimeout(chattingSearchTimeoutRef.current)
      }
    }
  }, [chattingSearchQuery, showChattingSearch, chattingList])

  async function handleAddToChattingList(positionId) {
    try {
      await api.chattingList.addPosition(positionId)
      // Invalidate chatting list cache
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      await fetchChattingList()
      // Remove from search results
      setChattingSearchResults(prev => prev.filter(r => r.position.id !== positionId))
    } catch (err) {
      Alert.alert(t('errorTitle'), translateError(err.message, t) || t('failedAddToList'))
    }
  }

  const remainingChars = MAX_STATEMENT_LENGTH - statement.length
  const isOverLimit = remainingChars < 0

  if (isBanned) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <EmptyState
          icon="ban-outline"
          title={t('bannedTitle')}
          subtitle={t('bannedSubtitle')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
        <ScrollView ref={scrollViewRef} contentContainerStyle={[
          styles.scrollContent,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
        ]} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionHeaderAreaCompact}>
            <View style={styles.headingRow}>
              <ThemedText variant="h1" color="primary">
                {t('addPosition')}
              </ThemedText>
              <TouchableOpacity
                style={styles.rulesButton}
                onPress={handleOpenRules}
                accessibilityRole="button"
                accessibilityLabel={t('communityRules')}
              >
                <Ionicons name="book-outline" size={15} color={colors.primary} />
                <ThemedText variant="label" color="primary" style={styles.rulesButtonText}>{t('communityRules')}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.form}>
            <LocationCategorySelector
              selectedLocation={selectedLocation}
              selectedCategory={selectedCategory}
              onLocationChange={setSelectedLocation}
              onCategoryChange={(id) => {
                setSelectedCategory(id)
                setCategoryAutoSelected(false)
              }}
              showLabels
              defaultLocation="last"
              categoryAutoSelected={categoryAutoSelected}
              style={{ paddingHorizontal: 0, marginBottom: 12 }}
            />

            <View style={styles.inputGroupCompact}>
              <ThemedTextInput
                style={styles.statementInput}
                placeholder={t('positionPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                value={statement}
                onChangeText={setStatement}
                multiline={true}
                maxLength={MAX_STATEMENT_LENGTH + 20}
              />
              <ThemedText variant="caption" color="secondary" style={[
                styles.charCount,
                isOverLimit && styles.charCountOver
              ]}>
                {t('charsRemaining', { count: remainingChars })}
              </ThemedText>

              {/* Similar Positions Suggestions */}
              {(searchingSimilar || similarPositions.length > 0) && (
                <Animated.View style={[styles.similarContainer, { opacity: similarFadeAnim }]}>
                  <View style={styles.similarHeader}>
                    <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                    <ThemedText variant="label" color="primary" style={styles.similarTitle}>
                      {searchingSimilar ? t('searchingSimilar') : t('similarAdopt')}
                    </ThemedText>
                    {searchingSimilar && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                    )}
                  </View>

                  {!searchingSimilar && similarPositions.map((result) => (
                    <View key={result.position.id} style={styles.similarItem}>
                      <View style={styles.similarContent}>
                        {result.wasPreviouslyHeld && (
                          <View style={styles.previouslyHeldBadge}>
                            <Ionicons name="time-outline" size={12} color={colors.primary} />
                            <ThemedText variant="caption" color="primary" style={styles.previouslyHeldText}>{t('previouslyHeld')}</ThemedText>
                          </View>
                        )}
                        <ThemedText variant="bodySmall" color="dark" style={styles.similarStatement} numberOfLines={2}>
                          "{result.position.statement}"
                        </ThemedText>
                        <ThemedText variant="caption" color="secondary" style={styles.similarMeta}>
                          {t('matchPercent', { percent: Math.round(result.similarity * 100) })}
                          {result.position.category?.label && ` · ${result.position.category.label}`}
                        </ThemedText>
                      </View>
                      <TouchableOpacity
                        style={styles.adoptButton}
                        onPress={() => handleAdoptPosition(result.position.id)}
                        accessibilityRole="button"
                        accessibilityLabel={t('adoptA11y', { statement: result.position.statement })}
                      >
                        <Ionicons name="add-circle" size={28} color={SemanticColors.agree} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {!searchingSimilar && similarPositions.length === 0 && statement.trim().length >= MIN_SEARCH_LENGTH && (
                    <ThemedText variant="bodySmall" color="secondary" style={styles.noSimilarText}>
                      {t('noSimilarFound')}
                    </ThemedText>
                  )}
                </Animated.View>
              )}
            </View>

            {error && (
              <View style={styles.errorContainerCompact}>
                <ThemedText variant="bodySmall" color="error">{error}</ThemedText>
              </View>
            )}

            <ThemedButton
              onPress={handleSubmit}
              disabled={loading || isOverLimit || !statement.trim() || !selectedCategory || !selectedLocation}
            >
              {loading ? t('creating') : t('createPosition')}
            </ThemedButton>
          </View>

          {/* My Positions Section */}
          <View style={styles.myPositionsSection} onLayout={(e) => { myPositionsSectionY.current = e.nativeEvent.layout.y }}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="h1" color="primary">
                {t('myPositions')}
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary" style={styles.sectionSubtitle}>
                {t('myPositionsSubtitle')}
              </ThemedText>
            </View>
            <PositionListManager
              ref={positionsListRef}
              items={normalizedMyPositions}
              onToggleActive={handleTogglePositionActive}
              onDeleteItems={handleDeletePositions}
              onBulkToggle={handleBulkTogglePositions}
              onFloatingBarChange={(state) => setFloatingBar({ ...state, ref: positionsListRef })}
              onSearchFocus={scrollToMyPositions}
              emptyIcon="megaphone-outline"
              emptyTitle={t('noPositionsTitle')}
              emptySubtitle={t('noPositionsSubtitle')}
            />
          </View>

          {/* Chatting List Section */}
          <View style={styles.chattingListSection} onLayout={(e) => { chattingListSectionY.current = e.nativeEvent.layout.y }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeadingRow}>
                <ThemedText variant="h1" color="primary">
                  {t('chattingList')}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowChattingExplanation(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('chattingListHelp')}
                >
                  <Ionicons name="help-circle-outline" size={20} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
              <ThemedText variant="bodySmall" color="secondary" style={styles.sectionSubtitle}>
                {t('chattingListSubtitle')}
              </ThemedText>
            </View>

            <InfoModal
              visible={showChattingExplanation}
              onClose={() => setShowChattingExplanation(false)}
              icon="chatbubbles"
              iconColor={colors.chat}
              title={t('chattingListHelp')}
              paragraphs={[
                t('chattingListInfoP1'),
                t('chattingListInfoP2'),
              ]}
            />

            {/* Add Position Button */}
            <TouchableOpacity
              style={styles.addToListButton}
              onPress={() => setShowChattingSearch(!showChattingSearch)}
              accessibilityRole="button"
              accessibilityLabel={showChattingSearch ? t('closeSearch') : t('addToList')}
            >
              <Ionicons
                name={showChattingSearch ? 'close-circle' : 'add-circle'}
                size={22}
                color={colors.primary}
              />
              <ThemedText variant="body" color="primary" style={styles.addToListButtonText}>
                {showChattingSearch ? t('closeSearch') : t('addToList')}
              </ThemedText>
            </TouchableOpacity>

            {/* Search Interface */}
            {showChattingSearch && (
              <View style={styles.chattingSearchContainer}>
                <ThemedTextInput
                  style={styles.chattingSearchInput}
                  placeholder={t('searchPositions')}
                  placeholderTextColor={colors.placeholderText}
                  value={chattingSearchQuery}
                  onChangeText={setChattingSearchQuery}
                />

                {searchingChatting && (
                  <View style={styles.chattingSearchLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <ThemedText variant="bodySmall" color="secondary">{t('searching')}</ThemedText>
                  </View>
                )}

                {!searchingChatting && chattingSearchResults.length > 0 && (
                  <View style={styles.chattingSearchResults}>
                    {chattingSearchResults.map(result => (
                      <View key={result.position.id} style={styles.chattingSearchResult}>
                        <View style={styles.chattingSearchResultContent}>
                          <ThemedText variant="bodySmall" color="dark" style={styles.chattingSearchResultStatement} numberOfLines={2}>
                            "{result.position.statement}"
                          </ThemedText>
                          <ThemedText variant="caption" color="secondary" style={styles.chattingSearchResultMeta}>
                            {t('matchPercent', { percent: Math.round(result.similarity * 100) })}
                            {result.position.category?.label && ` · ${result.position.category.label}`}
                          </ThemedText>
                        </View>
                        <TouchableOpacity
                          style={styles.addToListItemButton}
                          onPress={() => handleAddToChattingList(result.position.id)}
                          accessibilityRole="button"
                          accessibilityLabel={t('addToChattingA11y', { statement: result.position.statement })}
                        >
                          <Ionicons name="add-circle" size={28} color={SemanticColors.agree} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {!searchingChatting && chattingSearchQuery.trim().length >= MIN_SEARCH_LENGTH && chattingSearchResults.length === 0 && (
                  <ThemedText variant="bodySmall" color="secondary" style={styles.noSearchResultsText}>
                    {t('noMatchingPositions')}
                  </ThemedText>
                )}

                {chattingSearchQuery.trim().length > 0 && chattingSearchQuery.trim().length < MIN_SEARCH_LENGTH && (
                  <ThemedText variant="bodySmall" color="secondary" style={styles.searchHintText}>
                    {t('searchMinChars', { min: MIN_SEARCH_LENGTH })}
                  </ThemedText>
                )}
              </View>
            )}

            <PositionListManager
              ref={chattingListRef}
              items={normalizedChattingList}
              onToggleActive={handleToggleChattingActive}
              onDeleteItems={handleDeleteChattingItems}
              onBulkToggle={handleBulkToggleChattingItems}
              onFloatingBarChange={(state) => setFloatingBar({ ...state, ref: chattingListRef })}
              onSearchFocus={scrollToChattingList}
              loading={chattingListLoading}
              emptyIcon="chatbubbles-outline"
              emptyTitle={t('emptyChattingTitle')}
              emptySubtitle={t('emptyChattingSubtitle')}
            />
          </View>
        </ScrollView>

      {/* Floating delete bar - positioned above tab bar */}
      {floatingBar.visible && (
        <View style={styles.floatingDeleteBar}>
          <ThemedText variant="body" color="dark" style={styles.floatingDeleteCount}>
            {t('countSelected', { count: floatingBar.count })}
          </ThemedText>
          <View style={styles.floatingDeleteActions}>
            <TouchableOpacity
              style={styles.floatingDeleteCancelButton}
              onPress={() => floatingBar.ref?.current?.cancelDelete()}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <ThemedText variant="bodySmall" color="secondary" style={styles.floatingDeleteCancelText}>{t('cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingDeleteButton}
              onPress={() => floatingBar.ref?.current?.confirmDelete()}
              accessibilityRole="button"
              accessibilityLabel={t('deleteSelected')}
            >
              <Ionicons name="trash" size={18} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" color="inverse">{t('deleteSelected')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomDrawerModal
        visible={showRules}
        onClose={() => setShowRules(false)}
        title={t('communityRules')}
      >
        {rulesLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: 32 }} />
        ) : rules.length === 0 ? (
          <ThemedText variant="bodySmall" color="secondary" style={styles.rulesEmptyText}>{t('noRulesDefined')}</ThemedText>
        ) : (
          <ScrollView style={styles.rulesScrollView}>
            {rules.map((rule, index) => (
              <View key={rule.id} style={[styles.ruleItem, index === rules.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.ruleHeader}>
                  <ThemedText variant="body" color="dark" style={styles.ruleTitle}>{rule.title}</ThemedText>
                  {rule.severity && (
                    <View style={[
                      styles.severityBadge,
                      rule.severity === 'high' && styles.severityHigh,
                      rule.severity === 'medium' && styles.severityMedium,
                    ]}>
                      <ThemedText variant="caption" style={[
                        styles.severityText,
                        rule.severity === 'high' && styles.severityTextHigh,
                        rule.severity === 'medium' && styles.severityTextMedium,
                      ]}>
                        {t('severity', { level: rule.severity })}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText variant="bodySmall" color="secondary">{rule.text}</ThemedText>
              </View>
            ))}
          </ScrollView>
        )}
      </BottomDrawerModal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  sectionHeaderAreaCompact: {
    marginBottom: 12,
  },
  form: {
    flex: 1,
  },
  inputGroupCompact: {
    marginBottom: 12,
  },
  statementInput: {
    padding: 12,
    borderRadius: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    ...Typography.body,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.darkText,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 4,
  },
  charCountOver: {
    color: SemanticColors.warning,
  },
  errorContainerCompact: {
    backgroundColor: colors.errorBannerBg,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SemanticColors.warning,
    marginBottom: 12,
  },
  // My Positions Section
  myPositionsSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    marginTop: 2,
  },
  // Similar Positions Suggestions
  similarContainer: {
    marginTop: 10,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...Shadows.card,
  },
  similarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarTitle: {
    marginLeft: 6,
    flex: 1,
  },
  similarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  similarContent: {
    flex: 1,
  },
  previouslyHeldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  previouslyHeldText: {
    fontWeight: '500',
  },
  similarStatement: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
  similarMeta: {
    marginTop: 2,
  },
  adoptButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSimilarText: {
    textAlign: 'center',
    paddingVertical: 8,
  },
  // Chatting List Section
  chattingListSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 25,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  addToListButtonText: {
    fontWeight: '600',
  },
  chattingSearchContainer: {
    marginBottom: 16,
  },
  chattingSearchInput: {
    padding: 14,
    borderRadius: 30,
    ...Typography.button,
    fontWeight: undefined,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.darkText,
  },
  chattingSearchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  chattingSearchResults: {
    marginTop: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  chattingSearchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  chattingSearchResultContent: {
    flex: 1,
  },
  chattingSearchResultStatement: {
    fontStyle: 'italic',
  },
  chattingSearchResultMeta: {
    marginTop: 4,
  },
  addToListItemButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSearchResultsText: {
    textAlign: 'center',
    paddingVertical: 16,
  },
  searchHintText: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  // Floating delete bar (positioned above tab bar)
  floatingDeleteBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SemanticColors.warning,
    ...Shadows.elevated,
  },
  floatingDeleteCount: {
    fontWeight: '600',
  },
  floatingDeleteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingDeleteCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  floatingDeleteCancelText: {
    fontWeight: '500',
  },
  floatingDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SemanticColors.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    gap: 6,
  },
  // Community Rules
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rulesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rulesButtonText: {
    fontWeight: '500',
  },
  rulesScrollView: {
    paddingHorizontal: 16,
  },
  rulesEmptyText: {
    textAlign: 'center',
    paddingVertical: 32,
  },
  ruleItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  ruleTitle: {
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.severityLowBg,
  },
  severityHigh: {
    backgroundColor: colors.severityHighBg,
  },
  severityMedium: {
    backgroundColor: colors.severityMediumBg,
  },
  severityText: {
    fontWeight: '600',
    color: colors.severityLowText,
    textTransform: 'capitalize',
  },
  severityTextHigh: {
    color: SemanticColors.warning,
  },
  severityTextMedium: {
    color: colors.severityMediumText,
  },
})

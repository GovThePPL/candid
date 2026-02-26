import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../../hooks/useThemeColors'
import useIsDesktop from '../../../hooks/useIsDesktop'
import useKeyboardHeight from '../../../hooks/useKeyboardHeight'
import { Typography } from '../../../constants/Theme'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import OpinionMapVisualization from '../../../components/stats/OpinionMapVisualization'
import GroupTabBar from '../../../components/stats/GroupTabBar'
import PositionCarousel from '../../../components/stats/PositionCarousel'
import PositionCard from '../../../components/stats/PositionCard'
import GroupDemographicsModal from '../../../components/stats/GroupDemographicsModal'
import SurveyResultsModal from '../../../components/stats/SurveyResultsModal'
import InfoModal from '../../../components/InfoModal'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from '../../../components/Skeleton'
import api, { statsApiWrapper, surveysApiWrapper, API_BASE_URL, translateError } from '../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'
import { useAuth } from '../../../contexts/UserContext'
import { useLocationSession } from '../../../contexts/LocationSessionContext'
import { STAGE_TO_PHASE } from '../../../constants/Sessions'

const CARD_MIN_WIDTH = 280
const SEARCH_DEBOUNCE_MS = 800
const SEARCH_PAGE_SIZE = 20

function StatsContentSkeleton({ styles }) {
  return (
    <SkeletonPulse>
      {/* Opinion map area */}
      <View style={styles.section}>
        <SkeletonLine width={120} height={16} style={{ marginLeft: 16, marginBottom: 8 }} />
        <SkeletonBox width="100%" height={200} borderRadius={12} style={{ marginHorizontal: 16 }} />
      </View>
      {/* Tab bar pills */}
      <View style={styles.skeletonTabRow}>
        <SkeletonBox width={80} height={32} borderRadius={16} />
        <SkeletonBox width={70} height={32} borderRadius={16} />
        <SkeletonBox width={70} height={32} borderRadius={16} />
      </View>
      {/* Demographics row */}
      <View style={styles.skeletonDemographicsRow}>
        <SkeletonLine width={100} height={12} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBox width={60} height={24} borderRadius={12} />
          <SkeletonBox width={70} height={24} borderRadius={12} />
          <SkeletonBox width={55} height={24} borderRadius={12} />
        </View>
      </View>
      {/* Position cards */}
      <View style={styles.section}>
        <SkeletonLine width={200} height={16} style={{ marginLeft: 16, marginBottom: 12 }} />
        <View style={styles.skeletonCarouselRow}>
          <View style={styles.skeletonPositionCard}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <SkeletonBox width={30} height={18} borderRadius={8} />
              <SkeletonLine width={50} height={12} />
            </View>
            <SkeletonLine width="85%" height={13} />
            <SkeletonLine width="60%" height={13} />
            <SkeletonBox width="100%" height={24} borderRadius={6} style={{ marginTop: 10 }} />
          </View>
          <View style={styles.skeletonPositionCard}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <SkeletonBox width={30} height={18} borderRadius={8} />
              <SkeletonLine width={60} height={12} />
            </View>
            <SkeletonLine width="70%" height={13} />
            <SkeletonLine width="90%" height={13} />
            <SkeletonBox width="100%" height={24} borderRadius={6} style={{ marginTop: 10 }} />
          </View>
        </View>
      </View>
    </SkeletonPulse>
  )
}

export default function Stats() {
  const { user } = useAuth()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('stats')

  const isDesktop = useIsDesktop()
  const { selectedLocation, selectedSession, sessionData, effectiveStage, loaded: prefsLoaded } = useLocationSession()
  const [statsData, setStatsData] = useState(null)
  const [activeTab, setActiveTab] = useState('majority')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showDemographicsModal, setShowDemographicsModal] = useState(false)
  const [showLabelHelpModal, setShowLabelHelpModal] = useState(false)
  const [showSurveyResultsModal, setShowSurveyResultsModal] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searchExecuted, setSearchExecuted] = useState(false)
  const searchDebounceRef = useRef(null)
  const scrollViewRef = useRef(null)
  const positionsSectionY = useRef(0)
  const { width: screenWidth } = useWindowDimensions()
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()
  const [measuredWidth, setMeasuredWidth] = useState(0)

  const onScrollViewLayout = useCallback((e) => {
    setMeasuredWidth(e.nativeEvent.layout.width)
  }, [])

  const isSearchActive = selectedSession === 'all' && activeTab === 'majority'
    && searchQuery.trim().length > 0 && (searchResults.length > 0 || searchLoading || searchExecuted)

  // Scroll the search input into view on focus
  const handleSearchFocus = Platform.OS === 'web'
    ? (e) => {
        setTimeout(() => e.target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 300)
      }
    : () => {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, positionsSectionY.current - 8), animated: true })
        }, 50)
      }

  // On desktop, always use 2 columns with flex-based sizing (no measurement needed).
  // On mobile, calculate columns from measured container width.
  const availableWidth = measuredWidth > 0 ? measuredWidth - 32 : screenWidth - 32
  const gap = 12
  const numColumns = isDesktop ? 2 : Math.max(1, Math.floor((availableWidth + gap) / (CARD_MIN_WIDTH + gap)))
  const cardWidth = isDesktop ? undefined : (availableWidth - (numColumns - 1) * gap) / numColumns

  // Search API call
  const executeSearch = useCallback(async (query, locationId, offset = 0) => {
    if (!query.trim() || query.trim().length < 2 || !locationId) return

    try {
      setSearchLoading(true)
      const data = await api.positions.searchStats(query.trim(), locationId, {
        offset,
        limit: SEARCH_PAGE_SIZE,
      })
      if (offset === 0) {
        setSearchResults(data.results || [])
      } else {
        setSearchResults(prev => [...prev, ...(data.results || [])])
      }
      setSearchHasMore(data.hasMore || false)
      setSearchOffset(offset)
      setSearchExecuted(true)
    } catch (err) {
      console.error('Search error:', err)
      if (offset === 0) setSearchResults([])
      setSearchExecuted(true)
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search on query change
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (!searchQuery.trim() || searchQuery.trim().length < 2 || selectedSession !== 'all' || activeTab !== 'majority') {
      setSearchResults([])
      setSearchHasMore(false)
      setSearchOffset(0)
      setSearchExecuted(false)
      return
    }

    searchDebounceRef.current = setTimeout(() => {
      executeSearch(searchQuery, selectedLocation, 0)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery, selectedLocation, selectedSession, activeTab, executeSearch])

  // Clear search when switching away from all-sessions majority tab
  useEffect(() => {
    if (selectedSession !== 'all' || activeTab !== 'majority') {
      setSearchQuery('')
      setSearchResults([])
      setSearchHasMore(false)
      setSearchOffset(0)
      setSearchExecuted(false)
    }
  }, [selectedSession, activeTab])

  const loadMoreResults = useCallback(() => {
    if (searchLoading || !searchHasMore) return
    executeSearch(searchQuery, selectedLocation, searchOffset + SEARCH_PAGE_SIZE)
  }, [searchLoading, searchHasMore, searchQuery, selectedLocation, searchOffset, executeSearch])

  // Infinite scroll handler
  const handleScroll = useCallback(({ nativeEvent }) => {
    if (!isSearchActive || !searchHasMore || searchLoading) return
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
    const paddingToBottom = 200
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
      loadMoreResults()
    }
  }, [isSearchActive, searchHasMore, searchLoading, loadMoreResults])

  // Derive phase from effective stage (respects archived stage viewing)
  const phase = useMemo(() => {
    if (!selectedSession || selectedSession === 'all') return null
    if (!effectiveStage) return null
    return STAGE_TO_PHASE[effectiveStage] || null
  }, [selectedSession, effectiveStage])

  // Fetch stats when location/session/phase changes
  useEffect(() => {
    if (selectedLocation && selectedSession) {
      fetchStats()
    }
  }, [selectedLocation, selectedSession, phase])

  const fetchStats = async () => {
    if (!selectedLocation || !selectedSession) return

    const cacheKey = CacheKeys.stats(selectedLocation, selectedSession, phase)

    try {
      setError(null)

      // Check cache first
      const cached = await CacheManager.get(cacheKey)

      if (cached && !CacheManager.isStale(cached, CacheDurations.STATS)) {
        // Fresh cache — use immediately, no fetch needed
        setStatsData(cached.data)
        setActiveTab('majority')
        setLoading(false)
        return
      }

      if (cached) {
        // Stale cache — show cached data immediately, refresh in background
        setStatsData(cached.data)
        setLoading(false)

        // Background refresh
        try {
          const data = await statsApiWrapper.getStats(selectedLocation, selectedSession, { phase })
          setStatsData(data)
          setActiveTab('majority')
          await CacheManager.set(cacheKey, data)
        } catch (err) {
          // Silently fail — stale data is already displayed
          console.warn('Background stats refresh failed:', err)
        }
        return
      }

      // No cache — show loading, fetch normally
      setLoading(true)
      const data = await statsApiWrapper.getStats(selectedLocation, selectedSession, { phase })
      setStatsData(data)
      setActiveTab('majority')
      await CacheManager.set(cacheKey, data)
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError(translateError(err.message, t) || t('failedLoadStats'))
      setStatsData(null)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    if (!selectedLocation || !selectedSession) return
    setRefreshing(true)
    try {
      const cacheKey = CacheKeys.stats(selectedLocation, selectedSession, phase)
      await CacheManager.invalidate(cacheKey)
      const data = await statsApiWrapper.getStats(selectedLocation, selectedSession, { phase })
      setStatsData(data)
      setActiveTab('majority')
      await CacheManager.set(cacheKey, data)
      setError(null)
    } catch (err) {
      console.error('Error refreshing stats:', err)
      setError(translateError(err.message, t) || t('failedLoadStats'))
    } finally {
      setRefreshing(false)
    }
  }, [selectedLocation, selectedSession, phase])

  const handleGroupSelect = (groupId) => {
    setActiveTab(groupId)
  }

  // Get section title and help content based on active tab
  const getPositionsSectionInfo = () => {
    if (activeTab === 'majority') {
      return {
        title: t('consensusPositions'),
        helpTitle: t('consensusPositions'),
        helpText: t('consensusHelpText'),
      }
    }
    if (activeTab === 'my_positions') {
      return {
        title: t('myPositions'),
        helpTitle: t('myPositions'),
        helpText: t('myPositionsHelpText'),
      }
    }
    // Group tab
    const groupLabel = statsData?.groups?.find(g => g.id === activeTab)?.label || activeTab
    return {
      title: t('definingPositions'),
      helpTitle: t('definingPositions'),
      helpText: t('definingHelpText', { label: groupLabel }),
    }
  }

  const sectionInfo = getPositionsSectionInfo()

  const handleOpenPolisReport = () => {
    if (statsData?.polisReportUrl) {
      // Construct full URL - polisReportUrl is now just /report/{id}
      const baseHost = API_BASE_URL.replace(/\/api\/v1$/, '')
      const fullUrl = `${baseHost}${statsData.polisReportUrl}`
      console.debug('Opening Polis report:', fullUrl)

      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank')
      } else {
        Linking.openURL(fullUrl).catch(err => {
          console.error('Failed to open URL:', err)
        })
      }
    } else {
      console.debug('No polisReportUrl available:', statsData)
    }
  }

  const handleViewClosures = (positionId) => {
    router.push(`/position-closures/${positionId}`)
  }

  const renderHelpModal = () => (
    <InfoModal
      visible={showHelpModal}
      onClose={() => setShowHelpModal(false)}
      title={sectionInfo.helpTitle}
    >
      <InfoModal.Paragraph>{sectionInfo.helpText}</InfoModal.Paragraph>
      <InfoModal.Paragraph>
        {t('helpBarText')}
      </InfoModal.Paragraph>
      <InfoModal.Paragraph>
        <ThemedText variant="label">{t('helpAllLabel')}</ThemedText> {t('helpAllDesc')}
      </InfoModal.Paragraph>
      <InfoModal.Paragraph>
        <ThemedText variant="label">{t('helpGroupsLabel')}</ThemedText> {t('helpGroupsDesc')}
      </InfoModal.Paragraph>
    </InfoModal>
  )

  const renderContent = () => {
    if (loading && !refreshing) {
      return <StatsContentSkeleton styles={styles} />
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="bodySmall" color="disagree" style={styles.errorText}>{error}</ThemedText>
        </View>
      )
    }

    if (!selectedLocation || !selectedSession) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="bodySmall" color="secondary" style={styles.placeholderText}>
            {t('selectPrompt')}
          </ThemedText>
        </View>
      )
    }

    return (
      <>
        {/* Opinion Map Section */}
        <View style={styles.section}>
          <ThemedText variant="h3" style={styles.sectionTitle}>{t('opinionMap')}</ThemedText>
          <OpinionMapVisualization
            groups={statsData?.groups || []}
            userPosition={statsData?.userPosition}
            userInfo={user ? { displayName: user.displayName, avatarUrl: user.avatarUrl, avatarIconUrl: user.avatarIconUrl } : null}
            selectedGroup={activeTab}
            onGroupSelect={handleGroupSelect}
          />
        </View>

        {/* Group Tab Bar - Below the graph */}
        <View style={styles.tabBarContainer}>
          <GroupTabBar
            groups={statsData?.groups || []}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            showMyPositions={true}
          />
        </View>

        {/* Selected Group Label and Demographics Row */}
        {activeTab !== 'my_positions' && (statsData?.groups?.length > 0) && (
          <View style={styles.demographicsRow}>
            {/* Show top 3 labels for selected group */}
            {(() => {
              const selectedGroup = activeTab === 'majority'
                ? null
                : statsData.groups.find(g => g.id === activeTab)

              if (selectedGroup?.labelRankings?.length > 0) {
                const topLabels = selectedGroup.labelRankings.slice(0, 3)
                return (
                  <View style={styles.selectedGroupLabel}>
                    <View style={styles.selectedGroupLabelHeader}>
                      <ThemedText variant="badgeLg" color="secondary" style={styles.selectedGroupLabelTitle}>
                        {t('groupIdentity', { label: selectedGroup.label })}
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.labelHelpButton}
                        onPress={() => setShowLabelHelpModal(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('labelHelpA11y')}
                      >
                        <Ionicons name="help-circle-outline" size={18} color={colors.secondaryText} />
                      </TouchableOpacity>
                    </View>
                    {topLabels.map((item, idx) => (
                      <View key={item.label} style={styles.labelRankingRow}>
                        <ThemedText
                          variant={idx === 0 ? 'h3' : 'bodySmall'}
                          color={idx === 0 ? 'primary' : undefined}
                          style={[
                            styles.labelRankingText,
                            idx === 0 && styles.labelRankingTextTop
                          ]}
                        >
                          {idx + 1}. {item.label}
                        </ThemedText>
                        {item.isCondorcetWinner && (
                          <Ionicons name="trophy" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                        )}
                      </View>
                    ))}
                  </View>
                )
              }
              return null
            })()}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.demographicsButton}
                onPress={() => setShowDemographicsModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('demographicsA11y')}
              >
                <Ionicons name="people-outline" size={16} color={colors.primary} />
                <ThemedText variant="bodySmall" color="primary" style={styles.demographicsButtonText}>{t('demographics')}</ThemedText>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.demographicsButton}
                onPress={() => setShowSurveyResultsModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('surveyResultsA11y')}
              >
                <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
                <ThemedText variant="bodySmall" color="primary" style={styles.demographicsButtonText}>{t('surveyResults')}</ThemedText>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Positions Section */}
        <View style={styles.section} onLayout={(e) => { positionsSectionY.current = e.nativeEvent.layout.y }}>
          {/* Search bar — shown on All Sessions + majority tab, above heading */}
          {selectedSession === 'all' && activeTab === 'majority' && (
            <View style={styles.searchSection}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor={colors.placeholderText}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={handleSearchFocus}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxFontSizeMultiplier={1.5}
                  accessibilityLabel={t('searchPositionsA11y')}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton} accessibilityRole="button" accessibilityLabel={t('clearSearchA11y')}>
                    <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={styles.sectionTitleRow}>
            <ThemedText variant="h3">{isSearchActive ? t('searchResults') : sectionInfo.title}</ThemedText>
            {!isSearchActive && (
              <TouchableOpacity
                style={styles.helpButton}
                onPress={() => setShowHelpModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('positionsHelpA11y')}
              >
                <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Search results or normal carousel */}
          {isSearchActive ? (
            <View style={styles.searchResultsContainer}>
              {searchResults.length === 0 && !searchLoading && (
                <View style={styles.emptySearchContainer}>
                  <ThemedText variant="bodySmall" color="secondary">
                    {searchQuery.trim().length < 2 ? t('minChars') : t('noPositionsFound')}
                  </ThemedText>
                </View>
              )}
              <View style={styles.searchGrid}>
                {searchResults.map((position) => (
                  <View key={position.id} style={[styles.searchCardWrapper, isDesktop ? styles.searchCardWrapperDesktop : { width: cardWidth }]}>
                    <PositionCard
                      position={position}
                      groups={statsData?.groups || []}
                      activeGroup={activeTab}
                      userVote={statsData?.userVotes ? statsData.userVotes[position.id] : null}
                      onViewClosures={handleViewClosures}
                    />
                  </View>
                ))}
              </View>
              {searchLoading && (
                <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />
              )}
            </View>
          ) : (
            <PositionCarousel
              positions={statsData?.positions || []}
              groups={statsData?.groups || []}
              activeTab={activeTab}
              userVotes={statsData?.userVotes || {}}
              userPositionIds={statsData?.userPositionIds || []}
              onViewClosures={handleViewClosures}
              onSearchFocus={() => {
                scrollViewRef.current?.scrollTo({ y: positionsSectionY.current, animated: true })
              }}
            />
          )}

          {/* Full Polis Report — below positions carousel */}
          {activeTab === 'majority' && !isSearchActive && statsData?.polisReportUrl && (
            <TouchableOpacity
              style={styles.fullReportButton}
              onPress={handleOpenPolisReport}
              accessibilityRole="link"
              accessibilityLabel={t('fullReportA11y')}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <ThemedText variant="bodySmall" color="primary" style={styles.demographicsButtonText}>{t('fullPolisReport')}</ThemedText>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={isDesktop ? [] : ['top']}>
      <Header />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onLayout={onScrollViewLayout}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Page Header */}
        <View style={styles.sectionHeader}>
          <ThemedText variant="h1" color="primary" style={styles.title}>{t('title')}</ThemedText>
          <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{t('subtitle')}</ThemedText>
        </View>

        {renderContent()}
      </ScrollView>

      {renderHelpModal()}

      {/* Group Demographics Modal */}
      <GroupDemographicsModal
        visible={showDemographicsModal}
        onClose={() => setShowDemographicsModal(false)}
        locationId={selectedLocation}
        sessionId={selectedSession}
        groupId={activeTab === 'majority' ? 'all' : activeTab}
        groupLabel={
          activeTab === 'majority'
            ? t('all')
            : statsData?.groups?.find((g) => g.id === activeTab)?.label
        }
        labelRankings={
          activeTab === 'majority'
            ? null
            : statsData?.groups?.find((g) => g.id === activeTab)?.labelRankings
        }
        fetchDemographics={statsApiWrapper.getGroupDemographics}
      />

      {/* Label Help Modal */}
      <InfoModal
        visible={showLabelHelpModal}
        onClose={() => setShowLabelHelpModal(false)}
        title={t('labelHelpTitle')}
      >
        <InfoModal.Item icon="swap-horizontal-outline">
          {t('labelHelpPairwise')}
        </InfoModal.Item>
        <InfoModal.Item icon="podium-outline">
          {t('labelHelpRanked')}
        </InfoModal.Item>
        <InfoModal.Item icon="trophy-outline">
          {t('labelHelpCondorcet')}
        </InfoModal.Item>
        <InfoModal.Item icon="people-outline">
          {t('labelHelpMembers')}
        </InfoModal.Item>
      </InfoModal>

      {/* Survey Results Modal */}
      <SurveyResultsModal
        visible={showSurveyResultsModal}
        onClose={() => setShowSurveyResultsModal(false)}
        locationId={selectedLocation}
        sessionId={selectedSession}
        selectedGroup={activeTab}
        groups={statsData?.groups || []}
        polisConversationId={statsData?.conversationId}
        fetchSurveys={surveysApiWrapper.getAllSurveys.bind(surveysApiWrapper)}
        fetchRankings={surveysApiWrapper.getSurveyRankings.bind(surveysApiWrapper)}
        fetchStandardResults={surveysApiWrapper.getStandardSurveyResults.bind(surveysApiWrapper)}
        fetchCrosstabs={surveysApiWrapper.getQuestionCrosstabs.bind(surveysApiWrapper)}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
  },
  subtitle: {
    marginTop: 2,
  },
  tabBarContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  demographicsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectedGroupLabel: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedGroupLabelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedGroupLabelTitle: {
  },
  labelHelpButton: {
    padding: 2,
  },
  labelWithWins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelRankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  labelRankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  labelRankingText: {
    fontWeight: '500',
  },
  labelRankingTextTop: {
    fontWeight: '700',
  },
  demographicsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6,
  },
  demographicsButtonText: {
    fontWeight: '500',
  },
  fullReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6,
  },
  section: {
    marginTop: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  helpButton: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  errorText: {
    textAlign: 'center',
  },
  placeholderText: {
    textAlign: 'center',
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    ...Typography.body,
    color: colors.text,
    outlineStyle: 'none',
    scrollMarginTop: 80,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  searchResultsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  searchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  searchCardWrapper: {
    // Width set dynamically on mobile
  },
  searchCardWrapperDesktop: {
    flex: 1,
    minWidth: CARD_MIN_WIDTH,
  },
  emptySearchContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSpinner: {
    marginTop: 16,
  },

  // Skeleton
  skeletonTabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skeletonDemographicsRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  skeletonCarouselRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  skeletonPositionCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
})

import { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'
import { Typography } from '../../constants/Theme'
import ThemedText from '../../components/ThemedText'
import Header from '../../components/Header'
import LocationCategorySelector from '../../components/LocationCategorySelector'
import OpinionMapVisualization from '../../components/stats/OpinionMapVisualization'
import GroupTabBar from '../../components/stats/GroupTabBar'
import PositionCarousel from '../../components/stats/PositionCarousel'
import PositionCard from '../../components/stats/PositionCard'
import GroupDemographicsModal from '../../components/stats/GroupDemographicsModal'
import SurveyResultsModal from '../../components/stats/SurveyResultsModal'
import InfoModal from '../../components/InfoModal'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api, { statsApiWrapper, surveysApiWrapper, API_BASE_URL, translateError } from '../../lib/api'
import { UserContext } from '../../contexts/UserContext'

const CARD_MIN_WIDTH = 340
const SEARCH_DEBOUNCE_MS = 800
const SEARCH_PAGE_SIZE = 20
const STATS_LOCATION_KEY = '@stats:lastLocation'
const STATS_CATEGORY_KEY = '@stats:lastCategory'

export default function Stats() {
  const { user } = useContext(UserContext)
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('stats')

  const [selectedLocation, setSelectedLocationRaw] = useState(null)
  const [selectedCategory, setSelectedCategoryRaw] = useState(null)
  const [statsData, setStatsData] = useState(null)
  const [activeTab, setActiveTab] = useState('majority')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showDemographicsModal, setShowDemographicsModal] = useState(false)
  const [showLabelHelpModal, setShowLabelHelpModal] = useState(false)
  const [showSurveyResultsModal, setShowSurveyResultsModal] = useState(false)

  // Persist location/category selection
  const setSelectedLocation = useCallback((id) => {
    setSelectedLocationRaw(id)
    if (id) AsyncStorage.setItem(STATS_LOCATION_KEY, id).catch(() => {})
  }, [])
  const setSelectedCategory = useCallback((id) => {
    setSelectedCategoryRaw(id)
    if (id) AsyncStorage.setItem(STATS_CATEGORY_KEY, id).catch(() => {})
  }, [])

  // Restore last selection on mount (must complete before LocationCategorySelector renders)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const [loc, cat] = await AsyncStorage.multiGet([STATS_LOCATION_KEY, STATS_CATEGORY_KEY])
        if (loc[1]) setSelectedLocationRaw(loc[1])
        if (cat[1]) setSelectedCategoryRaw(cat[1])
      } catch {}
      setPrefsLoaded(true)
    })()
  }, [])

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

  const isSearchActive = selectedCategory === 'all' && activeTab === 'majority'
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

  // Responsive grid for search results
  const containerWidth = screenWidth - 32
  const gap = 12
  const numColumns = Math.max(1, Math.floor((containerWidth + gap) / (CARD_MIN_WIDTH + gap)))
  const cardWidth = (containerWidth - (numColumns - 1) * gap) / numColumns

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

    if (!searchQuery.trim() || searchQuery.trim().length < 2 || selectedCategory !== 'all' || activeTab !== 'majority') {
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
  }, [searchQuery, selectedLocation, selectedCategory, activeTab, executeSearch])

  // Clear search when switching away from all-categories majority tab
  useEffect(() => {
    if (selectedCategory !== 'all' || activeTab !== 'majority') {
      setSearchQuery('')
      setSearchResults([])
      setSearchHasMore(false)
      setSearchOffset(0)
      setSearchExecuted(false)
    }
  }, [selectedCategory, activeTab])

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

  // Fetch stats when location/category changes
  useEffect(() => {
    if (selectedLocation && selectedCategory) {
      fetchStats()
    }
  }, [selectedLocation, selectedCategory])

  const fetchStats = async () => {
    if (!selectedLocation || !selectedCategory) return

    try {
      setLoading(true)
      setError(null)
      const data = await statsApiWrapper.getStats(selectedLocation, selectedCategory)
      setStatsData(data)
      // Reset to majority tab when data changes
      setActiveTab('majority')
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError(translateError(err.message, t) || t('failedLoadStats'))
      setStatsData(null)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchStats()
    setRefreshing(false)
  }, [selectedLocation, selectedCategory])

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
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.loadingText}>{t('loadingStats')}</ThemedText>
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="bodySmall" color="disagree" style={styles.errorText}>{error}</ThemedText>
        </View>
      )
    }

    if (!selectedLocation || !selectedCategory) {
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
                        {item.isCondorcetWinner && (
                          <Ionicons name="trophy" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                        )}
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
          {/* Search bar — shown on All Categories + majority tab, above heading */}
          {selectedCategory === 'all' && activeTab === 'majority' && (
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
                  <View key={position.id} style={[styles.searchCardWrapper, { width: cardWidth }]}>
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
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

        {/* Location/Category Selector - scrolls with content */}
        {prefsLoaded && (
          <LocationCategorySelector
            selectedLocation={selectedLocation}
            selectedCategory={selectedCategory}
            onLocationChange={setSelectedLocation}
            onCategoryChange={setSelectedCategory}
            showAllCategories
          />
        )}

        {renderContent()}
      </ScrollView>

      {renderHelpModal()}

      {/* Group Demographics Modal */}
      <GroupDemographicsModal
        visible={showDemographicsModal}
        onClose={() => setShowDemographicsModal(false)}
        locationId={selectedLocation}
        categoryId={selectedCategory}
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
        <InfoModal.Item icon="trophy-outline">
          {t('labelHelpRanked')}
        </InfoModal.Item>
        <InfoModal.Item icon="ribbon-outline">
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
        categoryId={selectedCategory}
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
    justifyContent: 'space-between',
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
    // Width set dynamically
  },
  emptySearchContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSpinner: {
    marginTop: 16,
  },
})

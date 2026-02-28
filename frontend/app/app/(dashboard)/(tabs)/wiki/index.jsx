import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { View, FlatList, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { Spacing, Shadows, BorderRadius } from '../../../../constants/Theme'
import api from '../../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../../lib/cache'
import Header from '../../../../components/Header'
import WikiPageCard from '../../../../components/wiki/WikiPageCard'
import EmptyState from '../../../../components/EmptyState'
import ThemedText from '../../../../components/ThemedText'
import LocationFilterButton from '../../../../components/LocationFilterButton'
import LocationSessionBadge from '../../../../components/LocationSessionBadge'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from '../../../../components/Skeleton'
import { useAuth } from '../../../../contexts/UserContext'
import { useLocationSession } from '../../../../contexts/LocationSessionContext'

function WikiPageCardSkeleton({ colors }) {
  return (
    <View style={{
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 12,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <SkeletonBox width={100} height={20} borderRadius={6} />
        <SkeletonLine width={60} height={10} />
      </View>
      <SkeletonLine width="80%" height={14} style={{ marginBottom: 4 }} />
      <SkeletonLine width="60%" height={12} />
    </View>
  )
}

function WikiTermCardSkeleton({ colors }) {
  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: colors.cardBackground,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    }}>
      <SkeletonBox width={100} height={20} borderRadius={6} />
      <SkeletonLine width="50%" height={14} />
      <SkeletonLine width="70%" height={12} />
    </View>
  )
}

function WikiListSkeleton({ colors, activeTab }) {
  const ItemSkeleton = activeTab === 'terms' ? WikiTermCardSkeleton : WikiPageCardSkeleton
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }}>
      <SkeletonPulse>
        {Array.from({ length: 5 }).map((_, i) => (
          <ItemSkeleton key={i} colors={colors} />
        ))}
      </SkeletonPulse>
    </ScrollView>
  )
}

export default function WikiScreen() {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { selectedLocation: globalLocation, selectedSession: globalSession } = useLocationSession()

  // Tab state: 'terms' or 'pages'
  const [activeTab, setActiveTab] = useState('pages')

  // --- Pages state ---
  const [pages, setPages] = useState([])
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [suggestionCount, setSuggestionCount] = useState(0)
  const [showSuggestMenu, setShowSuggestMenu] = useState(false)

  // Shared location/session filter state (both tabs)
  // Initialized from global context, synced on context changes
  const [allLocations, setAllLocations] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState(globalLocation || null)
  const [selectedSessionId, setSelectedSessionId] = useState(
    globalSession && globalSession !== 'all' ? globalSession : null
  )

  // Session picker modal
  const [showSessionPicker, setShowSessionPicker] = useState(false)

  // Collapsible filter panel
  const [showFilters, setShowFilters] = useState(false)

  // --- Terms state ---
  const [terms, setTerms] = useState([])
  const [termsSearchText, setTermsSearchText] = useState('')
  const [termsLoading, setTermsLoading] = useState(false)
  const [termsError, setTermsError] = useState(false)
  const [termsRefreshing, setTermsRefreshing] = useState(false)

  const debounceRef = useRef(null)
  const searchRef = useRef('')
  const termsDebounceRef = useRef(null)
  const termsSearchRef = useRef('')

  // Load locations and sessions for filter dropdowns
  useEffect(() => {
    const load = async () => {
      try {
        const [locs, sess] = await Promise.all([
          api.users.getAllLocations(),
          api.sessions.getAll(),
        ])
        setAllLocations(Array.isArray(locs) ? locs : [])
        setAllSessions(Array.isArray(sess) ? sess : [])
      } catch {
        // Non-blocking
      }
    }
    load()
  }, [])

  // Sync local filter state from global LocationSessionContext
  useEffect(() => {
    setSelectedLocationId(globalLocation || null)
  }, [globalLocation])

  useEffect(() => {
    setSelectedSessionId(globalSession && globalSession !== 'all' ? globalSession : null)
  }, [globalSession])

  // Fetch suggestion count for badge
  useFocusEffect(
    useCallback(() => {
      if (!user) return
      const loadCount = async () => {
        try {
          const data = await api.wiki.getSuggestionCount()
          setSuggestionCount(data?.count || 0)
        } catch {
          // Non-blocking
        }
      }
      loadCount()
    }, [user])
  )

  // Fetch pages
  const fetchPages = useCallback(async (search, locationId, sessionId, isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true)
      setError(false)

      const opts = {}
      if (search) opts.search = search
      if (locationId) opts.locationId = locationId
      if (sessionId) opts.sessionId = sessionId

      const cacheKey = CacheKeys.wikiPages(null, search, locationId, sessionId)
      if (!isRefresh) {
        const cacheEntry = await CacheManager.get(cacheKey)
        if (cacheEntry && !CacheManager.isStale(cacheEntry, CacheDurations.WIKI_PAGES)) {
          setPages(Array.isArray(cacheEntry.data) ? cacheEntry.data : [])
          setLoading(false)
          return
        }
      }

      const data = await api.wiki.getPages(opts)
      const pageList = Array.isArray(data) ? data : []
      setPages(pageList)
      await CacheManager.set(cacheKey, pageList)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Fetch pages on tab focus
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'pages') {
        fetchPages(searchRef.current, selectedLocationId, selectedSessionId)
      }
    }, [fetchPages, selectedLocationId, selectedSessionId, activeTab])
  )

  // Re-fetch pages when location/session filters change
  useEffect(() => {
    if (activeTab === 'pages') {
      fetchPages(searchRef.current, selectedLocationId, selectedSessionId)
    }
  }, [fetchPages, selectedLocationId, selectedSessionId, activeTab])

  // Fetch terms
  const fetchTerms = useCallback(async (locationId, isRefresh = false) => {
    try {
      if (!isRefresh) setTermsLoading(true)
      setTermsError(false)

      const cacheKey = CacheKeys.glossaryTerms(locationId || 'all')
      if (!isRefresh) {
        const cacheEntry = await CacheManager.get(cacheKey)
        if (cacheEntry && !CacheManager.isStale(cacheEntry, CacheDurations.GLOSSARY_TERMS)) {
          setTerms(Array.isArray(cacheEntry.data) ? cacheEntry.data : [])
          setTermsLoading(false)
          return
        }
      }

      const opts = {}
      if (locationId) opts.locationId = locationId
      const data = await api.glossary.getTerms(opts)
      const termList = Array.isArray(data) ? data : []
      setTerms(termList)
      await CacheManager.set(cacheKey, termList)
    } catch {
      setTermsError(true)
    } finally {
      setTermsLoading(false)
      setTermsRefreshing(false)
    }
  }, [])

  // Fetch terms on tab focus
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'terms') {
        fetchTerms(selectedLocationId)
      }
    }, [fetchTerms, activeTab, selectedLocationId])
  )

  // Re-fetch terms when location filter changes
  useEffect(() => {
    if (activeTab === 'terms') {
      fetchTerms(selectedLocationId)
    }
  }, [fetchTerms, activeTab, selectedLocationId])

  // Build descendant set for selected location (includes self)
  const locationDescendants = useMemo(() => {
    if (!selectedLocationId || !allLocations.length) return null
    const descendants = new Set([selectedLocationId])
    // Iteratively collect children until no new ones found
    let added = true
    while (added) {
      added = false
      for (const loc of allLocations) {
        if (loc.parentLocationId && descendants.has(loc.parentLocationId) && !descendants.has(loc.id)) {
          descendants.add(loc.id)
          added = true
        }
      }
    }
    return descendants
  }, [selectedLocationId, allLocations])

  // Filtered terms (client-side location/session/search filtering)
  const filteredTerms = useMemo(() => {
    let filtered = terms
    // When a location is selected, only show terms scoped to that location
    // or its descendants (same logic as pages use on the backend).
    if (locationDescendants) {
      filtered = filtered.filter(term => {
        const lids = term.locationIds || []
        return lids.length > 0 && lids.some(id => locationDescendants.has(id))
      })
    }
    if (selectedSessionId) {
      filtered = filtered.filter(term =>
        (term.sessionIds || []).includes(selectedSessionId)
      )
    }
    if (termsSearchText.trim()) {
      const search = termsSearchText.toLowerCase()
      filtered = filtered.filter(term =>
        term.term.toLowerCase().includes(search) ||
        (term.summary || '').toLowerCase().includes(search) ||
        (term.aliases || []).some(a => a.toLowerCase().includes(search))
      )
    }
    return filtered
  }, [terms, termsSearchText, locationDescendants, selectedSessionId])

  // Debounced search (pages)
  const handleSearchChange = useCallback((text) => {
    setSearchText(text)
    searchRef.current = text
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchPages(text, selectedLocationId, selectedSessionId)
    }, 300)
  }, [fetchPages, selectedLocationId, selectedSessionId])

  // Terms search — client-side, just update state
  const handleTermsSearchChange = useCallback((text) => {
    setTermsSearchText(text)
    termsSearchRef.current = text
  }, [])

  const handleRefresh = useCallback(() => {
    if (activeTab === 'pages') {
      setRefreshing(true)
      fetchPages(searchRef.current, selectedLocationId, selectedSessionId, true)
    } else {
      setTermsRefreshing(true)
      fetchTerms(selectedLocationId, true)
    }
  }, [activeTab, fetchPages, fetchTerms, selectedLocationId, selectedSessionId])

  const handlePagePress = useCallback((page) => {
    router.push(`/wiki/${page.slug}`)
  }, [router])

  const handleTermPress = useCallback((term) => {
    // Navigate to the glossary article page using the term's slug
    router.push(`/wiki/glossary/${term.slug}`)
  }, [router])

  // Find the session name for a given ID
  const selectedSessionName = useMemo(() => {
    if (!selectedSessionId) return null
    const sess = allSessions.find(s => s.id === selectedSessionId)
    return sess?.label || null
  }, [selectedSessionId, allSessions])

  // Lookup maps for resolving scope IDs to display objects
  const locationMap = useMemo(() => {
    const map = {}
    for (const loc of allLocations) map[loc.id] = loc
    return map
  }, [allLocations])

  const sessionMap = useMemo(() => {
    const map = {}
    for (const sess of allSessions) map[sess.id] = sess
    return map
  }, [allSessions])

  // Resolve first locationId/sessionId to badge-ready objects
  const resolveScope = useCallback((locationIds, sessionIds) => {
    const locId = (locationIds || [])[0]
    const sessId = (sessionIds || [])[0]
    return {
      location: locId && locationMap[locId] ? { code: locationMap[locId].code, name: locationMap[locId].name } : null,
      session: sessId && sessionMap[sessId] ? { label: sessionMap[sessId].label } : null,
    }
  }, [locationMap, sessionMap])

  const renderPageItem = useCallback(({ item }) => (
    <WikiPageCard
      page={item}
      onPress={() => handlePagePress(item)}
      scope={resolveScope(item.locationIds, item.sessionIds)}
    />
  ), [handlePagePress, resolveScope])

  const renderTermItem = useCallback(({ item }) => {
    const scope = resolveScope(item.locationIds, item.sessionIds)
    return (
      <TouchableOpacity
        style={styles.termCard}
        onPress={() => handleTermPress(item)}
        accessibilityRole="button"
        accessibilityLabel={t('wikiArticleA11y', { title: item.term })}
      >
        <LocationSessionBadge
          location={scope.location}
          session={scope.session}
          locationFallback={t('wikiScopeAllLocations')}
          sessionFallback={t('wikiScopeAllSessions')}
          size="sm"
        />
        <ThemedText variant="bodyBold" color="dark">{item.term}</ThemedText>
        {item.summary ? (
          <ThemedText variant="bodySmall" color="secondary">
            {item.summary}
          </ThemedText>
        ) : null}
      </TouchableOpacity>
    )
  }, [styles, handleTermPress, t, resolveScope])

  const pageKeyExtractor = useCallback((item) => String(item.id || item.slug), [])
  const termKeyExtractor = useCallback((item) => item.slug, [])

  // --- Tab toggle ---
  const tabToggle = useMemo(() => (
    <View style={styles.tabRow}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
        onPress={() => setActiveTab('terms')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'terms' }}
        accessibilityLabel={t('wikiTabTermsA11y')}
      >
        <ThemedText
          variant="label"
          style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}
        >
          {t('wikiTabTerms')}
        </ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'pages' && styles.tabActive]}
        onPress={() => setActiveTab('pages')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'pages' }}
        accessibilityLabel={t('wikiTabPagesA11y')}
      >
        <ThemedText
          variant="label"
          style={[styles.tabText, activeTab === 'pages' && styles.tabTextActive]}
        >
          {t('wikiTabPages')}
        </ThemedText>
      </TouchableOpacity>
    </View>
  ), [activeTab, styles, t])

  // --- Shared action bar ---
  const actionBar = useMemo(() => (
    <View style={styles.actionBar}>
      <TouchableOpacity
        style={styles.suggestButton}
        onPress={() => setShowSuggestMenu(true)}
        accessibilityRole="button"
        accessibilityLabel={t('suggestNewA11y')}
      >
        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
        <ThemedText variant="label" color="primary">{t('suggestNew')}</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.suggestionsButton}
        onPress={() => router.push('/wiki/suggestions')}
        accessibilityRole="button"
        accessibilityLabel={suggestionCount > 0
          ? t('suggestionsBadgeA11y', { count: suggestionCount })
          : t('suggestionsA11y')}
      >
        <Ionicons name="list-outline" size={18} color={colors.primary} />
        <ThemedText variant="label" color="primary">{t('suggestions')}</ThemedText>
        {suggestionCount > 0 && (
          <View style={styles.badge}>
            <ThemedText variant="micro" style={styles.badgeText}>{suggestionCount}</ThemedText>
          </View>
        )}
      </TouchableOpacity>
    </View>
  ), [showSuggestMenu, suggestionCount, colors, styles, t, router])

  // --- Shared filter dropdowns ---
  const filterDropdowns = useMemo(() => (
    <View style={styles.filterRow}>
      <View style={styles.filterItem}>
        <LocationFilterButton
          allLocations={allLocations}
          selectedLocationId={selectedLocationId}
          onSelect={setSelectedLocationId}
          placeholder={t('wikiAllLocations')}
          accessibilityLabel={t('wikiFilterLocationA11y')}
        />
        {selectedLocationId && (
          <TouchableOpacity
            onPress={() => setSelectedLocationId(null)}
            style={styles.clearFilter}
            accessibilityRole="button"
            accessibilityLabel={t('wikiClearFilterA11y', { filter: t('wikiFilterLocation') })}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.filterItem}>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowSessionPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('wikiFilterSessionA11y')}
        >
          <Ionicons name="grid-outline" size={18} color={colors.primary} />
          <ThemedText
            variant="body"
            color={selectedSessionName ? 'badge' : 'secondary'}
            style={selectedSessionName ? styles.dropdownText : styles.dropdownPlaceholder}
            numberOfLines={1}
          >
            {selectedSessionName || t('wikiAllSessionsLabel')}
          </ThemedText>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
        {selectedSessionId && (
          <TouchableOpacity
            onPress={() => setSelectedSessionId(null)}
            style={styles.clearFilter}
            accessibilityRole="button"
            accessibilityLabel={t('wikiClearFilterA11y', { filter: t('wikiFilterSession') })}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ), [allLocations, selectedLocationId, selectedSessionId, selectedSessionName, colors, styles, t])

  // Whether any filter is actively selected
  const filtersActive = !!(selectedLocationId || selectedSessionId)

  // --- Shared header (rendered outside FlatList to avoid TextInput focus loss) ---
  const listHeader = (
    <View style={styles.filtersContainer}>
      {actionBar}
      {tabToggle}

      {/* Search bar — terms vs pages */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.placeholderText} />
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'terms' ? t('wikiTermSearchPlaceholder') : t('wikiSearchPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          value={activeTab === 'terms' ? termsSearchText : searchText}
          onChangeText={activeTab === 'terms' ? handleTermsSearchChange : handleSearchChange}
          accessibilityLabel={activeTab === 'terms' ? t('wikiTermSearchA11y') : t('wikiSearchA11y')}
          returnKeyType="search"
        />
        {(activeTab === 'terms' ? termsSearchText : searchText).length > 0 && (
          <TouchableOpacity
            onPress={() => (activeTab === 'terms' ? handleTermsSearchChange : handleSearchChange)('')}
            accessibilityRole="button"
            accessibilityLabel={t('common:clear')}
          >
            <Ionicons name="close-circle" size={18} color={colors.placeholderText} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setShowFilters(prev => !prev)}
          accessibilityRole="button"
          accessibilityLabel={t('wikiToggleFilterA11y')}
          accessibilityState={{ expanded: showFilters }}
          hitSlop={8}
        >
          <Ionicons
            name={(showFilters || filtersActive) ? 'funnel' : 'funnel-outline'}
            size={18}
            color={(showFilters || filtersActive) ? colors.primary : colors.placeholderText}
          />
        </TouchableOpacity>
      </View>

      {showFilters && filterDropdowns}
    </View>
  )

  const isLoading = activeTab === 'pages' ? (loading && !refreshing) : (termsLoading && !termsRefreshing)
  const isError = activeTab === 'pages' ? error : termsError

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      {isLoading ? (
        <WikiListSkeleton colors={colors} activeTab={activeTab} />
      ) : isError ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('wikiLoadError')}
          />
        </View>
      ) : activeTab === 'pages' ? (
        <FlatList
          data={pages}
          renderItem={renderPageItem}
          keyExtractor={pageKeyExtractor}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="book-outline"
              title={t('wikiNoResults')}
              subtitle={t('wikiNoResultsSubtitle')}
            />
          }
          refreshing={refreshing}
          onRefresh={handleRefresh}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
        />
      ) : (
        <FlatList
          data={filteredTerms}
          renderItem={renderTermItem}
          keyExtractor={termKeyExtractor}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="text-outline"
              title={t('wikiNoTerms')}
              subtitle={t('wikiNoTermsSubtitle')}
            />
          }
          refreshing={termsRefreshing}
          onRefresh={handleRefresh}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
        />
      )}

      {/* Session Picker Modal */}
      {showSessionPicker && <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSessionPicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText variant="h3" color="dark">{t('wikiFilterSession')}</ThemedText>
              <TouchableOpacity
                onPress={() => setShowSessionPicker(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common:close')}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={[styles.modalItem, !selectedSessionId && styles.modalItemActive]}
                onPress={() => { setSelectedSessionId(null); setShowSessionPicker(false) }}
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedSessionId }}
              >
                <ThemedText
                  variant="body"
                  color={!selectedSessionId ? 'primary' : 'dark'}
                >
                  {t('wikiAllSessionsLabel')}
                </ThemedText>
                {!selectedSessionId && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
              {allSessions.map((sess) => (
                <TouchableOpacity
                  key={sess.id}
                  style={[styles.modalItem, selectedSessionId === sess.id && styles.modalItemActive]}
                  onPress={() => { setSelectedSessionId(sess.id); setShowSessionPicker(false) }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedSessionId === sess.id }}
                >
                  <ThemedText
                    variant="body"
                    color={selectedSessionId === sess.id ? 'primary' : 'dark'}
                  >
                    {sess.label}
                  </ThemedText>
                  {selectedSessionId === sess.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>}
      <Modal
        visible={showSuggestMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuggestMenu(false)}
      >
        <TouchableOpacity
          style={styles.suggestOverlay}
          activeOpacity={1}
          onPress={() => setShowSuggestMenu(false)}
        >
          <View style={styles.suggestPopup}>
            <ThemedText variant="h3" style={styles.suggestPopupTitle}>
              {t('suggestNew')}
            </ThemedText>
            <TouchableOpacity
              style={styles.suggestMenuItem}
              onPress={() => {
                setShowSuggestMenu(false)
                router.push('/wiki/suggestion-form?type=new_term')
              }}
              accessibilityRole="button"
              accessibilityLabel={t('suggestNewTerm')}
            >
              <Ionicons name="text-outline" size={20} color={colors.text} />
              <ThemedText variant="body">{t('suggestNewTerm')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.suggestMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setShowSuggestMenu(false)
                router.push('/wiki/suggestion-form?type=new_page')
              }}
              accessibilityRole="button"
              accessibilityLabel={t('suggestNewPage')}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.text} />
              <ThemedText variant="body">{t('suggestNewPage')}</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.buttonSelected,
  },
  tabText: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    padding: 0,
  },
  filterRow: {
    gap: 8,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: Spacing.sm,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearFilter: {
    padding: 2,
  },
  dropdownButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dropdownText: {
    flex: 1,
  },
  dropdownPlaceholder: {
    flex: 1,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    maxHeight: '60%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalItemActive: {
    backgroundColor: colors.badgeBg,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  suggestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.cardBackground,
  },
  suggestOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestPopup: {
    backgroundColor: colors.cardBackground,
    borderRadius: 14,
    width: 280,
    overflow: 'hidden',
  },
  suggestPopupTitle: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  suggestMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  suggestionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  termCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    ...Shadows.card,
  },
})

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect, useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { useAuth } from '../../../../contexts/UserContext'
import { Typography, BorderRadius } from '../../../../constants/Theme'
import Header from '../../../../components/Header'
import ThemedText from '../../../../components/ThemedText'
import EmptyState from '../../../../components/EmptyState'
import SuggestionCard from '../../../../components/wiki/SuggestionCard'
import SuggestionDetail from '../../../../components/wiki/SuggestionDetail'
import api from '../../../../lib/api'

export default function WikiSuggestionsScreen() {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useAuth()

  const [view, setView] = useState('mine') // 'mine' | 'pending'
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(null) // null = not loaded, 0 = no review rights

  // Intercept hardware/browser back when viewing a suggestion detail
  useEffect(() => {
    if (!selectedSuggestion) return

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault()
      setSelectedSuggestion(null)
    })

    return unsubscribe
  }, [selectedSuggestion, navigation])

  // Fetch reviewable count on mount
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await api.wiki.getSuggestionCount()
        if (!cancelled) setPendingCount(result?.count ?? 0)
      } catch {
        if (!cancelled) setPendingCount(0)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Fetch suggestions
  const fetchSuggestions = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true)
      const data = await api.wiki.getSuggestions({ view })
      setSuggestions(Array.isArray(data) ? data : [])
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [view])

  // Refresh count when returning from detail or switching tabs
  const refreshCount = useCallback(async () => {
    try {
      const result = await api.wiki.getSuggestionCount()
      setPendingCount(result?.count ?? 0)
    } catch { /* ignore */ }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchSuggestions()
      refreshCount()
    }, [fetchSuggestions, refreshCount])
  )

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchSuggestions(true)
    refreshCount()
  }, [fetchSuggestions, refreshCount])

  const handleSuggestionPress = useCallback(async (suggestion) => {
    setDetailLoading(true)
    try {
      const detail = await api.wiki.getSuggestion(suggestion.id)
      setSelectedSuggestion(detail)
    } catch {
      // If detail fetch fails, show what we have
      setSelectedSuggestion(suggestion)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleDetailUpdate = useCallback((updated) => {
    setSelectedSuggestion(updated)
    // Refresh the list and count in the background
    fetchSuggestions(true)
    refreshCount()
  }, [fetchSuggestions, refreshCount])

  const handleDetailClose = useCallback(() => {
    setSelectedSuggestion(null)
  }, [])

  // User can review if they have any pending reviewable suggestions
  const canReview = view === 'pending'
  const hasReviewRights = pendingCount !== null && pendingCount > 0

  const renderItem = useCallback(({ item }) => (
    <SuggestionCard
      suggestion={item}
      onPress={() => handleSuggestionPress(item)}
    />
  ), [handleSuggestionPress])

  const keyExtractor = useCallback((item) => item.id, [])

  if (selectedSuggestion) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <SuggestionDetail
          suggestion={selectedSuggestion}
          currentUserId={user?.id}
          canReview={canReview}
          onUpdate={handleDetailUpdate}
          onClose={handleDetailClose}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={t('suggestionsTitle')} onBack={() => router.back()} />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TabButton
          label={t('suggestionsMyTab')}
          active={view === 'mine'}
          onPress={() => setView('mine')}
          colors={colors}
          styles={styles}
        />
        {hasReviewRights && (
          <TouchableOpacity
            style={[styles.tab, view === 'pending' && styles.tabActive]}
            onPress={() => setView('pending')}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'pending' }}
            accessibilityLabel={t('suggestionsBadgeA11y', { count: pendingCount })}
          >
            <View style={styles.tabWithBadge}>
              <ThemedText
                variant="label"
                style={[styles.tabText, view === 'pending' && styles.tabTextActive]}
              >
                {t('suggestionsReviewTab')}
              </ThemedText>
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <ThemedText variant="badge" style={styles.badgeText}>
                    {pendingCount}
                  </ThemedText>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={suggestions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title={view === 'mine' ? t('suggestionsEmpty') : t('suggestionsEmptyReview')}
              subtitle={view === 'mine' ? t('suggestionsEmptySubtitle') : t('suggestionsEmptyReviewSubtitle')}
            />
          }
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Detail loading overlay */}
      {detailLoading && (
        <View style={styles.detailOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
    </SafeAreaView>
  )
}

function TabButton({ label, active, onPress, colors, styles }) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <ThemedText
        variant="label"
        style={[styles.tabText, active && styles.tabTextActive]}
      >
        {label}
      </ThemedText>
    </TouchableOpacity>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  tabText: {
    color: colors.secondaryText,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 24,
  },
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})

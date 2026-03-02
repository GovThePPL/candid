import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Linking, StyleSheet, RefreshControl } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../../hooks/useThemeColors'
import { Shadows, BorderRadius, Spacing } from '../../../../../constants/Theme'
import api from '../../../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../../../lib/cache'
import Header from '../../../../../components/Header'
import ThemedText from '../../../../../components/ThemedText'
import MarkdownRenderer from '../../../../../components/discuss/MarkdownRenderer'
import EmptyState from '../../../../../components/EmptyState'
import { formatRelativeTime } from '../../../../../lib/timeUtils'

export default function GlossaryTermScreen() {
  const { slug } = useLocalSearchParams()
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const scrollViewRef = useRef(null)
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!slug) return

    let cancelled = false
    setLoading(true)
    setError(false)

    const load = async () => {
      try {
        const cacheKey = CacheKeys.glossaryTerm(slug)
        const cacheEntry = await CacheManager.get(cacheKey)
        if (cacheEntry && !CacheManager.isStale(cacheEntry, CacheDurations.GLOSSARY_TERM) && !cancelled) {
          setTerm(cacheEntry.data)
          setLoading(false)
          return
        }

        const data = await api.glossary.getTerm(slug)
        if (!cancelled) {
          setTerm(data)
          setLoading(false)
          await CacheManager.set(cacheKey, data)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [slug])

  // Silently refetch when returning to this screen (e.g., after editing)
  useFocusEffect(
    useCallback(() => {
      if (!slug || loading) return
      let cancelled = false
      const refresh = async () => {
        try {
          const cacheKey = CacheKeys.glossaryTerm(slug)
          const entry = await CacheManager.get(cacheKey)
          if (!entry || CacheManager.isStale(entry, CacheDurations.GLOSSARY_TERM)) {
            const data = await api.glossary.getTerm(slug)
            if (!cancelled) {
              setTerm(data)
              await CacheManager.set(cacheKey, data)
            }
          }
        } catch { /* keep existing data */ }
      }
      refresh()
      return () => { cancelled = true }
    }, [slug, loading])
  )

  const handleRefresh = useCallback(async () => {
    if (!slug) return
    setRefreshing(true)
    try {
      const data = await api.glossary.getTerm(slug)
      setTerm(data)
      await CacheManager.set(CacheKeys.glossaryTerm(slug), data)
    } catch { /* keep existing data */ }
    setRefreshing(false)
  }, [slug])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleWikiLinkPress = useCallback((url) => {
    if (url && url.startsWith('#fn-')) {
      scrollViewRef.current?.scrollToEnd({ animated: true })
      return false
    }
    if (url && url.startsWith('/')) {
      const path = url.replace(/^\/en\//, '/').replace(/^\//, '')
      if (path) {
        router.push(`/wiki/${path}`)
        return false
      }
    }
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      Linking.openURL(url)
      return false
    }
    return true
  }, [router])

  const handleEdit = useCallback(() => {
    if (!term) return
    if (term.canEdit) {
      router.push(`/wiki/suggestion-form?type=edit_term&termSlug=${encodeURIComponent(slug)}&directEdit=true`)
    } else {
      router.push(`/wiki/suggestion-form?type=edit_term&termSlug=${encodeURIComponent(slug)}`)
    }
  }, [term, slug, router])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('loadError')}
          />
        </View>
      ) : term ? (
        <>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.actionBar}>
            <TouchableOpacity
              onPress={() => router.push(`/wiki/history?slug=${encodeURIComponent(slug)}&type=term`)}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={t('historyButtonA11y')}
            >
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <ThemedText variant="caption" color="primary">
                {t('historyButton')}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Title card */}
          <View style={styles.titleCard}>
            <View style={styles.metaRow}>
              {term.wikiCategory ? (
                <View style={styles.categoryBadge}>
                  <ThemedText variant="label" style={styles.categoryText}>
                    {term.wikiCategory}
                  </ThemedText>
                </View>
              ) : null}

              {term.updatedAt ? (
                <ThemedText variant="caption" color="secondary">
                  {t('wikiUpdatedAt', { date: formatRelativeTime(term.updatedAt, t) })}
                </ThemedText>
              ) : null}
            </View>

            <ThemedText variant="h2" style={styles.title}>
              {term.term}
            </ThemedText>

            {term.aliases && term.aliases.length > 0 ? (
              <ThemedText variant="caption" color="secondary" style={styles.aliases}>
                {term.aliases.join(', ')}
              </ThemedText>
            ) : null}

            {term.summary ? (
              <ThemedText variant="body" color="secondary" style={styles.description}>
                {term.summary}
              </ThemedText>
            ) : null}
          </View>

          {term.content ? (
            <MarkdownRenderer
              content={term.content}
              variant="wiki"
              onLinkPress={handleWikiLinkPress}
            />
          ) : null}
        </ScrollView>
        <TouchableOpacity
          style={styles.fab}
          onPress={handleEdit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={term.canEdit ? t('directEditA11y') : t('suggestEditA11y')}
        >
          <Ionicons name="create-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        </>
      ) : null}
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  titleCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    backgroundColor: colors.badgeBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryText: {
    color: colors.badgeText,
    fontSize: 11,
    fontWeight: '600',
  },
  aliases: {
    marginBottom: Spacing.xs,
  },
  description: {
    fontStyle: 'italic',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.fabBg,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.card,
  },
})

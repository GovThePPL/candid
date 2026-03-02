import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, ScrollView, TouchableOpacity, Linking, StyleSheet, RefreshControl } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { Shadows, BorderRadius, Spacing } from '../../../../constants/Theme'
import api from '../../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../../lib/cache'
import Header from '../../../../components/Header'
import ThemedText from '../../../../components/ThemedText'
import MarkdownRenderer from '../../../../components/discuss/MarkdownRenderer'
import { formatRelativeTime } from '../../../../lib/timeUtils'
import EmptyState from '../../../../components/EmptyState'
import TableOfContents from '../../../../components/wiki/TableOfContents'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from '../../../../components/Skeleton'

function WikiArticleSkeleton({ colors }) {
  const skeletonCard = {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...Shadows.card,
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <SkeletonPulse>
        {/* Action bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
          <SkeletonBox width={90} height={26} borderRadius={14} />
          <SkeletonBox width={80} height={26} borderRadius={14} />
        </View>
        {/* Title card */}
        <View style={skeletonCard}>
          {/* Meta row (category badge + date) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <SkeletonBox width={70} height={20} borderRadius={6} />
            <SkeletonLine width={90} height={10} />
          </View>
          {/* Title */}
          <SkeletonLine width="70%" height={22} style={{ marginBottom: 8 }} />
          {/* Description */}
          <SkeletonLine width="90%" height={12} style={{ marginBottom: 6 }} />
          <SkeletonLine width="75%" height={12} />
        </View>
        {/* Content lines */}
        <SkeletonLine width="100%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="95%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="85%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="100%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="60%" height={12} style={{ marginBottom: 16 }} />
        <SkeletonLine width="100%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="90%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="80%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="95%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonLine width="50%" height={12} />
      </SkeletonPulse>
    </ScrollView>
  )
}

export default function WikiArticleScreen() {
  const params = useLocalSearchParams()
  const slug = Array.isArray(params.slug) ? params.slug.join('/') : params.slug
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const scrollViewRef = useRef(null)
  const markdownOffsetRef = useRef(0)
  const headingPositionsRef = useRef({})

  const [page, setPage] = useState(null)
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
        const cacheKey = CacheKeys.wikiPage(slug)
        const cacheEntry = await CacheManager.get(cacheKey)
        if (cacheEntry && !CacheManager.isStale(cacheEntry, CacheDurations.WIKI_PAGE) && !cancelled) {
          setPage(cacheEntry.data)
          setLoading(false)
          return
        }

        const data = await api.wiki.getPage(slug)
        if (!cancelled) {
          setPage(data)
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
          const cacheKey = CacheKeys.wikiPage(slug)
          const entry = await CacheManager.get(cacheKey)
          if (!entry || CacheManager.isStale(entry, CacheDurations.WIKI_PAGE)) {
            const data = await api.wiki.getPage(slug)
            if (!cancelled) {
              setPage(data)
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
      const data = await api.wiki.getPage(slug)
      setPage(data)
      await CacheManager.set(CacheKeys.wikiPage(slug), data)
    } catch { /* keep existing data */ }
    setRefreshing(false)
  }, [slug])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleEdit = useCallback(() => {
    if (!page) return
    if (page.canEdit) {
      router.push(`/wiki/suggestion-form?type=edit_page&pagePath=${encodeURIComponent(slug)}&directEdit=true`)
    } else {
      router.push(`/wiki/suggestion-form?type=edit_page&pagePath=${encodeURIComponent(slug)}`)
    }
  }, [page, slug, router])

  const handleWikiLinkPress = useCallback((url) => {
    // Footnote ref → scroll to footnotes at end of article
    if (url && url.startsWith('#fn-')) {
      scrollViewRef.current?.scrollToEnd({ animated: true })
      return false
    }
    // Internal wiki link (relative path from Wiki.js)
    if (url && url.startsWith('/')) {
      const path = url.replace(/^\/en\//, '/').replace(/^\//, '')
      if (path) {
        router.push(`/wiki/${path}`)
        return false
      }
    }
    // External link
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      Linking.openURL(url)
      return false
    }
    return true
  }, [router])

  const handleMarkdownLayout = useCallback((e) => {
    markdownOffsetRef.current = e.nativeEvent.layout.y
  }, [])

  const handleHeadingLayout = useCallback((text, y) => {
    headingPositionsRef.current[text] = y
  }, [])

  const handleHeadingPress = useCallback((text) => {
    const headingY = headingPositionsRef.current[text]
    if (headingY != null && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: markdownOffsetRef.current + headingY,
        animated: true,
      })
    }
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />

      {loading ? (
        <WikiArticleSkeleton colors={colors} />
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('wikiLoadError')}
          />
        </View>
      ) : page ? (
        <>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Title card */}
          <View style={styles.titleCard}>
            <View style={styles.metaRow}>
              {page.wikiCategory ? (
                <View style={styles.categoryBadge}>
                  <ThemedText variant="label" style={styles.categoryText}>
                    {page.wikiCategory}
                  </ThemedText>
                </View>
              ) : null}

              {page.updatedAt ? (
                <ThemedText variant="caption" color="secondary">
                  {t('wikiUpdatedAt', { date: formatRelativeTime(page.updatedAt, t) })}
                </ThemedText>
              ) : null}
            </View>

            <ThemedText variant="h2" style={styles.title}>
              {page.title}
            </ThemedText>

            {page.description ? (
              <ThemedText variant="body" color="secondary" style={styles.description}>
                {page.description}
              </ThemedText>
            ) : null}
          </View>

          {page.content ? (
            <>
              <TableOfContents content={page.content} onHeadingPress={handleHeadingPress} />
              <View onLayout={handleMarkdownLayout}>
                <MarkdownRenderer
                  content={page.content}
                  variant="wiki"
                  onLinkPress={handleWikiLinkPress}
                  onHeadingLayout={handleHeadingLayout}
                />
              </View>
            </>
          ) : null}

          <View style={styles.bottomActions}>
            <TouchableOpacity
              onPress={() => router.push(`/wiki/history?slug=${encodeURIComponent(slug)}&type=page`)}
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
        </ScrollView>
        <TouchableOpacity
          style={styles.fab}
          onPress={handleEdit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={page.canEdit ? t('directEditA11y') : t('suggestEditA11y')}
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
  description: {
    fontStyle: 'italic',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: Spacing.lg,
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

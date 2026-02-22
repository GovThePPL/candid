import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Linking, StyleSheet, RefreshControl } from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import api from '../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'
import Header from '../../../components/Header'
import ThemedText from '../../../components/ThemedText'
import MarkdownRenderer from '../../../components/discuss/MarkdownRenderer'
import { formatRelativeTime } from '../../../lib/timeUtils'
import EmptyState from '../../../components/EmptyState'
import TableOfContents from '../../../components/wiki/TableOfContents'

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

      {!loading && !error && page ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={page.canEdit ? t('directEditA11y') : t('suggestEditA11y')}
          >
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <ThemedText variant="caption" color="primary">
              {page.canEdit ? t('directEdit') : t('suggestEdit')}
            </ThemedText>
          </TouchableOpacity>
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
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('wikiLoadError')}
          />
        </View>
      ) : page ? (
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
          <ThemedText variant="h2" style={styles.title}>
            {page.title}
          </ThemedText>

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

          {page.description ? (
            <ThemedText variant="body" color="secondary" style={styles.description}>
              {page.description}
            </ThemedText>
          ) : null}

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
        </ScrollView>
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
  title: {
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
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
    marginBottom: 16,
    fontStyle: 'italic',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
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
})

import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useState, useEffect, useCallback, useContext, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { Spacing, Shadows } from '../constants/Theme'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'
import api from '../lib/api'
import { UserContext } from '../contexts/UserContext'

import ThemedText from './ThemedText'
import LocationCategoryBadge from './LocationCategoryBadge'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from './Skeleton'
import { formatRelativeTime } from '../lib/timeUtils'
import StickyHeaderFlatList from './StickyHeaderFlatList'

function PostCommentItemSkeleton({ styles }) {
  return (
    <View style={styles.itemCard}>
      <View style={{ gap: 6, marginBottom: 10 }}>
        <SkeletonLine width="75%" height={14} />
        <SkeletonLine width="50%" height={14} />
      </View>
      <View style={styles.skeletonFooterRow}>
        <SkeletonBox width={35} height={14} borderRadius={4} />
        <SkeletonBox width={35} height={14} borderRadius={4} />
        <SkeletonBox width={45} height={14} borderRadius={4} />
      </View>
    </View>
  )
}

function ActivityListSkeleton({ styles }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <SkeletonPulse>
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCommentItemSkeleton key={i} styles={styles} />
        ))}
      </SkeletonPulse>
    </ScrollView>
  )
}

function EmptyView({ icon, title, subtitle, styles, colors }) {
  return (
    <View style={styles.centerContainer}>
      <Ionicons name={icon} size={48} color={colors.placeholderText} />
      <ThemedText variant="body" color="placeholder" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText variant="bodySmall" color="placeholder">{subtitle}</ThemedText>
    </View>
  )
}

function ErrorView({ error, onRetry, styles, t }) {
  return (
    <View style={styles.centerContainer}>
      <ThemedText variant="body" color="secondary">{error}</ThemedText>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('discuss:retry')}
      >
        <ThemedText variant="button" color="primary">{t('discuss:retry')}</ThemedText>
      </TouchableOpacity>
    </View>
  )
}

export default function PostsContent({ onScroll, listHeader, stickyHeader }) {
  const { t } = useTranslation(['settings', 'discuss'])
  const colors = useThemeColors()
  const router = useRouter()
  const { user } = useContext(UserContext)
  const styles = useMemo(() => createStyles(colors), [colors])
  const userId = user?.id

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchData = useCallback(async (cursor = null) => {
    try {
      if (cursor) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(null)

      if (!cursor) {
        const { data: result } = await CacheManager.fetchOrCache(
          CacheKeys.activityPosts(userId),
          () => api.users.getActivity({ type: 'posts' }),
          { maxAge: CacheDurations.ACTIVITY }
        )
        setItems(result.items || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } else {
        const result = await api.users.getActivity({ type: 'posts', cursor })
        setItems(prev => [...prev, ...(result.items || [])])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      }
    } catch {
      setError(t('failedLoadActivity'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [t, userId])

  useEffect(() => { fetchData() }, [])

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return
    fetchData(nextCursor)
  }, [hasMore, loadingMore, nextCursor, fetchData])

  const handleItemPress = useCallback((item) => {
    if (item.id) router.push(`/discuss/${item.id}`)
  }, [router])

  const renderItem = useCallback(({ item }) => {
    const isDeleted = item.status === 'deleted'
    const timeStr = item.createdTime
      ? formatRelativeTime(item.createdTime, (key, opts) => t(key, { ...opts, ns: 'discuss' }))
      : ''

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('activityItemA11y', {
          type: t('activityPost'),
          time: timeStr,
          title: item.title || '',
        })}
      >
        <View style={styles.itemHeaderRow}>
          {(item.postLocationCode || item.postCategoryLabel) ? (
            <LocationCategoryBadge
              location={item.postLocationCode ? { code: item.postLocationCode } : null}
              category={item.postCategoryLabel ? { label: item.postCategoryLabel } : null}
              size="sm"
            />
          ) : <View />}
          <ThemedText variant="caption" color="secondary">{timeStr}</ThemedText>
        </View>

        {item.title && (
          <ThemedText variant="bodySmall" color="dark" numberOfLines={1} style={styles.itemTitle}>
            {item.title}
          </ThemedText>
        )}

        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.itemBody}>
            {t('activityDeleted')}
          </ThemedText>
        ) : (
          <ThemedText variant="bodySmall" color="secondary" numberOfLines={3} style={styles.itemBody}>
            {item.body}
          </ThemedText>
        )}

        <View style={styles.itemFooter}>
          <View style={styles.statRow}>
            <Ionicons name="arrow-up" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{item.upvoteCount || 0}</ThemedText>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="arrow-down" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{item.downvoteCount || 0}</ThemedText>
          </View>
          {item.commentCount != null && (
            <View style={styles.statRow}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary">{item.commentCount}</ThemedText>
            </View>
          )}
          <View style={styles.footerSpacer} />
          <View style={styles.itemTypeBadge}>
            <Ionicons name="document-text-outline" size={12} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('activityPost')}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    )
  }, [styles, colors, t, handleItemPress])

  if (loading) return <>{listHeader}{stickyHeader}<ActivityListSkeleton styles={styles} /></>
  if (error) return <>{listHeader}{stickyHeader}<ErrorView error={error} onRetry={() => fetchData()} styles={styles} t={t} /></>
  if (items.length === 0) {
    return (
      <>{listHeader}{stickyHeader}<EmptyView
        icon="document-text-outline"
        title={t('activityEmptyPosts')}
        subtitle={t('activityEmptyPostsSubtitle')}
        styles={styles}
        colors={colors}
      /></>
    )
  }

  return (
    <StickyHeaderFlatList
      listHeader={listHeader}
      stickyHeader={stickyHeader}
      data={items}
      keyExtractor={(item) => `post-${item.id}`}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.loadingMore} color={colors.primary} /> : null
      }
    />
  )
}

const createStyles = (colors) => StyleSheet.create({
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  itemCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...Shadows.card,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemTitle: {
    fontWeight: '600',
  },
  itemBody: {
    lineHeight: 20,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: 2,
  },
  footerSpacer: {
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    marginTop: Spacing.sm,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  loadingMore: {
    paddingVertical: Spacing.lg,
  },
  skeletonFooterRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
})

import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useState, useEffect, useCallback, useContext, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import { Spacing } from '../constants/Theme'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'
import api from '../lib/api'
import { UserContext } from '../contexts/UserContext'

import ThemedText from './ThemedText'
import LocationCategoryBadge from './LocationCategoryBadge'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from './Skeleton'
import { formatRelativeTime } from '../lib/timeUtils'
import StickyHeaderFlatList from './StickyHeaderFlatList'

function CommentItemSkeleton({ styles }) {
  return (
    <View style={styles.itemRow}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SkeletonBox width={60} height={12} borderRadius={4} />
        <SkeletonLine width={40} height={12} />
      </View>
      <SkeletonLine width="60%" height={13} />
      <SkeletonLine width="90%" height={11} />
    </View>
  )
}

function ActivityListSkeleton({ styles }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <SkeletonPulse>
        {Array.from({ length: 5 }).map((_, i) => (
          <CommentItemSkeleton key={i} styles={styles} />
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

export default function CommentsContent({ onScroll, listHeader, stickyHeader }) {
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
          CacheKeys.activityComments(userId),
          () => api.users.getActivity({ type: 'comments' }),
          { maxAge: CacheDurations.ACTIVITY }
        )
        setItems(result.items || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } else {
        const result = await api.users.getActivity({ type: 'comments', cursor })
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
    const postId = item.postId
    if (postId) {
      router.push({ pathname: '/discuss/[id]', params: { id: postId, threadRoot: item.id, focus: item.id } })
    }
  }, [router])

  const renderItem = useCallback(({ item }) => {
    const isDeleted = item.status === 'deleted'
    const timeStr = item.createdTime
      ? formatRelativeTime(item.createdTime, (key, opts) => t(key, { ...opts, ns: 'discuss' }))
      : ''
    const upvotes = item.upvoteCount || 0
    const downvotes = item.downvoteCount || 0

    return (
      <TouchableOpacity
        style={styles.itemRow}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('activityItemA11y', {
          type: t('activityComment'),
          time: timeStr,
          title: item.postTitle || '',
        })}
      >
        <View style={styles.topRow}>
          {(item.postLocationCode || item.postCategoryLabel) ? (
            <LocationCategoryBadge
              location={item.postLocationCode ? { code: item.postLocationCode } : null}
              category={item.postCategoryLabel ? { label: item.postCategoryLabel } : null}
              size="sm"
            />
          ) : <View />}
          <View style={styles.topRight}>
            {upvotes > 0 && (
              <View style={styles.voteStat}>
                <Ionicons name="arrow-up" size={12} color={SemanticColors.agree} />
                <ThemedText variant="caption" style={styles.upvoteText}>{upvotes}</ThemedText>
              </View>
            )}
            {downvotes > 0 && (
              <View style={styles.voteStat}>
                <Ionicons name="arrow-down" size={12} color={SemanticColors.disagree} />
                <ThemedText variant="caption" style={styles.downvoteText}>{downvotes}</ThemedText>
              </View>
            )}
            <ThemedText variant="caption" color="placeholder">{timeStr}</ThemedText>
          </View>
        </View>

        {item.postTitle ? (
          <ThemedText variant="bodySmall" color="dark" numberOfLines={1} style={styles.postTitle}>
            {item.postTitle}
          </ThemedText>
        ) : null}

        {isDeleted ? (
          <ThemedText variant="caption" color="placeholder" numberOfLines={1}>
            {t('activityDeleted')}
          </ThemedText>
        ) : (
          <ThemedText variant="bodySmall" color="secondary">
            {item.body}
          </ThemedText>
        )}
      </TouchableOpacity>
    )
  }, [styles, t, handleItemPress])

  if (loading) return <>{listHeader}{stickyHeader}<ActivityListSkeleton styles={styles} /></>
  if (error) return <>{listHeader}{stickyHeader}<ErrorView error={error} onRetry={() => fetchData()} styles={styles} t={t} /></>
  if (items.length === 0) {
    return (
      <>{listHeader}{stickyHeader}<EmptyView
        icon="chatbubble-outline"
        title={t('activityEmptyComments')}
        subtitle={t('activityEmptyCommentsSubtitle')}
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
      keyExtractor={(item) => `comment-${item.id}`}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  itemRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  voteStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  upvoteText: {
    color: SemanticColors.agree,
    fontWeight: '700',
  },
  downvoteText: {
    color: SemanticColors.disagree,
    fontWeight: '700',
  },
  postTitle: {
    fontWeight: '600',
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
})

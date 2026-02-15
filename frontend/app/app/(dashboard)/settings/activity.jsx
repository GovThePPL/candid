import { StyleSheet, View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { Spacing } from '../../../constants/Theme'
import api from '../../../lib/api'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'
import { formatRelativeTime } from '../../../lib/timeUtils'

const FILTERS = ['all', 'posts', 'comments']

export default function ActivityScreen() {
  const { t } = useTranslation(['settings', 'discuss'])
  const colors = useThemeColors()
  const router = useRouter()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchActivity = useCallback(async (cursor = null, type = filter) => {
    try {
      if (cursor) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const opts = { type }
      if (cursor) opts.cursor = cursor

      const result = await api.users.getActivity(opts)
      const newItems = result.items || []

      if (cursor) {
        setItems(prev => [...prev, ...newItems])
      } else {
        setItems(newItems)
      }
      setNextCursor(result.nextCursor || null)
      setHasMore(result.hasMore || false)
    } catch (err) {
      setError(t('failedLoadActivity'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter, t])

  useEffect(() => {
    fetchActivity(null, filter)
  }, [filter])

  const handleFilterChange = useCallback((newFilter) => {
    if (newFilter === filter) return
    setFilter(newFilter)
  }, [filter])

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return
    fetchActivity(nextCursor)
  }, [hasMore, loadingMore, nextCursor, fetchActivity])

  const handleItemPress = useCallback((item) => {
    const postId = item.type === 'post' ? item.id : item.postId
    if (postId) {
      if (item.type === 'comment') {
        // Object form ensures threadRoot param survives cross-tab navigation
        router.push({ pathname: '/discuss/[id]', params: { id: postId, threadRoot: item.id } })
      } else {
        router.push(`/discuss/${postId}`)
      }
    }
  }, [router])

  const renderItem = useCallback(({ item }) => {
    const isPost = item.type === 'post'
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
          type: isPost ? t('activityPost') : t('activityComment'),
          time: timeStr,
          title: isPost ? item.title : (item.postTitle || ''),
        })}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTypeBadge}>
            <Ionicons
              name={isPost ? 'document-text-outline' : 'chatbubble-outline'}
              size={14}
              color={colors.primary}
            />
            <ThemedText variant="caption" color="primary">
              {isPost ? t('activityPost') : t('activityComment')}
            </ThemedText>
          </View>
          <ThemedText variant="caption" color="secondary">{timeStr}</ThemedText>
        </View>

        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.itemBody}>
            {t('activityDeleted')}
          </ThemedText>
        ) : (
          <>
            {isPost && item.title && (
              <ThemedText variant="body" color="dark" numberOfLines={2} style={styles.itemTitle}>
                {item.title}
              </ThemedText>
            )}
            <ThemedText variant="bodySmall" color="secondary" numberOfLines={3} style={styles.itemBody}>
              {item.body}
            </ThemedText>
          </>
        )}

        {!isPost && item.postTitle && (
          <ThemedText variant="caption" color="secondary" numberOfLines={1} style={styles.itemContext}>
            {t('activityInPost', { title: item.postTitle })}
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
          {isPost && item.commentCount != null && (
            <View style={styles.statRow}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary">{item.commentCount}</ThemedText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }, [styles, colors, t, handleItemPress])

  const filterLabels = {
    all: t('activityFilterAll'),
    posts: t('activityFilterPosts'),
    comments: t('activityFilterComments'),
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={t('activity')} />

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => handleFilterChange(f)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f }}
            accessibilityLabel={filterLabels[f]}
          >
            <ThemedText
              variant="label"
              color={filter === f ? 'white' : 'secondary'}
              style={filter === f ? styles.filterLabelActive : undefined}
            >
              {filterLabels[f]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <LoadingView message={t('loadingActivity')} />
      ) : error ? (
        <View style={styles.centerContainer}>
          <ThemedText variant="body" color="secondary">{error}</ThemedText>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchActivity(null, filter)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('discuss:retry')}
          >
            <ThemedText variant="button" color="primary">{t('discuss:retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="time-outline" size={48} color={colors.secondaryText} />
          <ThemedText variant="h2" color="secondary" style={styles.emptyTitle}>
            {t('activityEmpty')}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary">
            {t('activityEmptySubtitle')}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.loadingMore}
                color={colors.primary}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterTabActive: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primarySurface,
  },
  filterLabelActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  itemCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  itemContext: {
    fontStyle: 'italic',
  },
  itemFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
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
})

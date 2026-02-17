import { StyleSheet, View, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useState, useEffect, useCallback, useMemo, useContext } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { Spacing } from '../../../constants/Theme'
import api from '../../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'
import { UserContext } from '../../../contexts/UserContext'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import { SkeletonPulse, SkeletonBox, SkeletonCircle, SkeletonLine } from '../../../components/Skeleton'
import PositionInfoCard from '../../../components/PositionInfoCard'
import { formatRelativeTime } from '../../../lib/timeUtils'

const TABS = ['positions', 'chattingList', 'posts', 'comments']

export default function ActivityScreen() {
  const { t } = useTranslation(['settings', 'discuss'])
  const colors = useThemeColors()
  const router = useRouter()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useContext(UserContext)

  const [activeTab, setActiveTab] = useState('positions')

  const tabConfig = useMemo(() => ({
    positions: {
      label: t('activityTabPositions'),
      a11y: t('activityTabPositionsA11y'),
    },
    chattingList: {
      label: t('activityTabChattingList'),
      a11y: t('activityTabChattingListA11y'),
    },
    posts: {
      label: t('activityTabPosts'),
      a11y: t('activityTabPostsA11y'),
    },
    comments: {
      label: t('activityTabComments'),
      a11y: t('activityTabCommentsA11y'),
    },
  }), [t])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={t('activity')} />

      {/* Tab row */}
      <View style={styles.tabRow} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tabConfig[tab].a11y}
            >
              <ThemedText
                variant="label"
                style={[styles.tabText, isActive && styles.tabTextActive]}
              >
                {tabConfig[tab].label}
              </ThemedText>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Tab content — only active tab mounts */}
      {activeTab === 'positions' && <PositionsContent styles={styles} colors={colors} t={t} userId={user?.id} />}
      {activeTab === 'chattingList' && <ChattingListContent styles={styles} colors={colors} t={t} router={router} userId={user?.id} />}
      {activeTab === 'posts' && <PostsContent styles={styles} colors={colors} t={t} router={router} userId={user?.id} />}
      {activeTab === 'comments' && <CommentsContent styles={styles} colors={colors} t={t} router={router} userId={user?.id} />}
    </SafeAreaView>
  )
}

function PositionItemSkeleton({ styles }) {
  return (
    <View style={styles.itemCard}>
      {/* Badge row */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <SkeletonBox width={36} height={20} borderRadius={10} />
        <SkeletonLine width={70} height={12} />
      </View>
      {/* Statement */}
      <View style={{ gap: 6, marginBottom: 12 }}>
        <SkeletonLine width="85%" height={13} />
        <SkeletonLine width="60%" height={13} />
      </View>
      {/* Stats footer */}
      <View style={styles.skeletonFooterRow}>
        <SkeletonBox width={40} height={14} borderRadius={4} />
        <SkeletonBox width={50} height={14} borderRadius={4} />
      </View>
    </View>
  )
}

function PostCommentItemSkeleton({ styles, isComment }) {
  return (
    <View style={styles.itemCard}>
      {/* Title or comment text */}
      <View style={{ gap: 6, marginBottom: isComment ? 8 : 10 }}>
        <SkeletonLine width={isComment ? '100%' : '75%'} height={isComment ? 12 : 14} />
        <SkeletonLine width={isComment ? '70%' : '50%'} height={isComment ? 12 : 14} />
      </View>
      {/* Context line (for comments: "on: position statement") */}
      {isComment && <SkeletonLine width="55%" height={10} style={{ marginBottom: 8 }} />}
      {/* Vote stats */}
      <View style={styles.skeletonFooterRow}>
        <SkeletonBox width={35} height={14} borderRadius={4} />
        <SkeletonBox width={35} height={14} borderRadius={4} />
        <SkeletonBox width={45} height={14} borderRadius={4} />
      </View>
    </View>
  )
}

function ActivityListSkeleton({ styles, tabType }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <SkeletonPulse>
        {Array.from({ length: 5 }).map((_, i) => (
          tabType === 'posts'
            ? <PostCommentItemSkeleton key={i} styles={styles} isComment={false} />
            : tabType === 'comments'
              ? <PostCommentItemSkeleton key={i} styles={styles} isComment={true} />
              : <PositionItemSkeleton key={i} styles={styles} />
        ))}
      </SkeletonPulse>
    </ScrollView>
  )
}

// ─── Positions Tab ──────────────────────────────────────────────────────────

function PositionsContent({ styles, colors, t, userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data } = await CacheManager.fetchOrCache(
        CacheKeys.userPositions(userId),
        () => api.users.getMyPositions('all'),
        { maxAge: CacheDurations.POSITIONS }
      )
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setError(t('failedLoadPositions'))
    } finally {
      setLoading(false)
    }
  }, [t, userId])

  useEffect(() => { fetchData() }, [])

  const renderItem = useCallback(({ item }) => {
    const isActive = item.status === 'active'
    return (
      <View
        style={styles.itemCard}
        accessibilityLabel={t('positionItemA11y', {
          statement: item.statement,
          location: item.locationName || '',
          category: item.categoryName || '',
          status: isActive ? t('positionStatusActive') : t('positionStatusInactive'),
        })}
      >
        {/* Location / category badges */}
        <View style={styles.positionBadgeRow}>
          {item.locationName && (
            <View style={styles.badge}>
              <ThemedText variant="caption" style={styles.badgeText}>{item.locationName}</ThemedText>
            </View>
          )}
          {item.categoryName && (
            <View style={styles.badge}>
              <ThemedText variant="caption" style={styles.badgeText}>{item.categoryName}</ThemedText>
            </View>
          )}
        </View>

        {/* Statement */}
        <ThemedText variant="body" color="dark" numberOfLines={3} style={styles.positionStatement}>
          {item.statement}
        </ThemedText>

        {/* Stats footer */}
        <View style={styles.positionFooter}>
          <View style={styles.statRow}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{item.agreeCount || 0}</ThemedText>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="thumbs-down-outline" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{item.disagreeCount || 0}</ThemedText>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{item.chatCount || 0}</ThemedText>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: isActive ? SemanticColors.success : colors.secondaryText }]} />
            <ThemedText variant="caption" color="secondary">
              {isActive ? t('positionStatusActive') : t('positionStatusInactive')}
            </ThemedText>
          </View>
        </View>
      </View>
    )
  }, [styles, colors, t])

  if (loading) return <ActivityListSkeleton styles={styles} tabType="positions" />
  if (error) return <ErrorView error={error} onRetry={fetchData} styles={styles} colors={colors} t={t} />
  if (items.length === 0) {
    return (
      <EmptyView
        icon="briefcase-outline"
        title={t('activityEmptyPositions')}
        subtitle={t('activityEmptyPositionsSubtitle')}
        styles={styles}
        colors={colors}
      />
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
    />
  )
}

// ─── Chatting List Tab ──────────────────────────────────────────────────────

function ChattingListContent({ styles, colors, t, router, userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data } = await CacheManager.fetchOrCache(
        CacheKeys.chattingList(userId),
        () => api.chattingList.getList(),
        { maxAge: CacheDurations.CHATTING_LIST }
      )
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setError(t('failedLoadChattingList'))
    } finally {
      setLoading(false)
    }
  }, [t, userId])

  useEffect(() => { fetchData() }, [])

  const renderItem = useCallback(({ item }) => {
    const isActive = item.isActive
    return (
      <View
        style={styles.itemCard}
        accessibilityLabel={t('chattingListItemA11y', {
          statement: item.position?.statement || '',
          status: isActive ? t('chattingListActive') : t('chattingListPaused'),
          chats: item.chatCount || 0,
        })}
      >
        {/* Reuse PositionInfoCard for the position display */}
        <PositionInfoCard
          position={item.position}
          size="compact"
          numberOfLines={3}
          style={styles.embeddedCard}
        />

        {/* Chatting list footer */}
        <View style={styles.chattingFooter}>
          <View style={styles.statRow}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">
              {t('chattingListChats', { count: item.chatCount || 0 })}
            </ThemedText>
          </View>
          {(item.pendingRequestCount || 0) > 0 && (
            <View style={styles.pendingBadge}>
              <ThemedText variant="caption" style={styles.pendingBadgeText}>
                {t('chattingListPending', { count: item.pendingRequestCount })}
              </ThemedText>
            </View>
          )}
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: isActive ? SemanticColors.success : colors.secondaryText }]} />
            <ThemedText variant="caption" color="secondary">
              {isActive ? t('chattingListActive') : t('chattingListPaused')}
            </ThemedText>
          </View>
        </View>
      </View>
    )
  }, [styles, colors, t])

  if (loading) return <ActivityListSkeleton styles={styles} tabType="chattingList" />
  if (error) return <ErrorView error={error} onRetry={fetchData} styles={styles} colors={colors} t={t} />
  if (items.length === 0) {
    return (
      <EmptyView
        icon="list-outline"
        title={t('activityEmptyChattingList')}
        subtitle={t('activityEmptyChattingListSubtitle')}
        styles={styles}
        colors={colors}
      />
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
    />
  )
}

// ─── Posts Tab ──────────────────────────────────────────────────────────────

function PostsContent({ styles, colors, t, router, userId }) {
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
        // First page: use cache
        const { data: result } = await CacheManager.fetchOrCache(
          CacheKeys.activityPosts(userId),
          () => api.users.getActivity({ type: 'posts' }),
          { maxAge: CacheDurations.ACTIVITY }
        )
        setItems(result.items || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } else {
        // Subsequent pages: always fetch
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
        <View style={styles.itemHeader}>
          <View style={styles.itemTypeBadge}>
            <Ionicons name="document-text-outline" size={14} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('activityPost')}</ThemedText>
          </View>
          <ThemedText variant="caption" color="secondary">{timeStr}</ThemedText>
        </View>

        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.itemBody}>
            {t('activityDeleted')}
          </ThemedText>
        ) : (
          <>
            {item.title && (
              <ThemedText variant="body" color="dark" numberOfLines={2} style={styles.itemTitle}>
                {item.title}
              </ThemedText>
            )}
            <ThemedText variant="bodySmall" color="secondary" numberOfLines={3} style={styles.itemBody}>
              {item.body}
            </ThemedText>
          </>
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
        </View>
      </TouchableOpacity>
    )
  }, [styles, colors, t, handleItemPress])

  if (loading) return <ActivityListSkeleton styles={styles} tabType="posts" />
  if (error) return <ErrorView error={error} onRetry={() => fetchData()} styles={styles} colors={colors} t={t} />
  if (items.length === 0) {
    return (
      <EmptyView
        icon="document-text-outline"
        title={t('activityEmptyPosts')}
        subtitle={t('activityEmptyPostsSubtitle')}
        styles={styles}
        colors={colors}
      />
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `post-${item.id}`}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.loadingMore} color={colors.primary} /> : null
      }
    />
  )
}

// ─── Comments Tab ───────────────────────────────────────────────────────────

function CommentsContent({ styles, colors, t, router, userId }) {
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
        // First page: use cache
        const { data: result } = await CacheManager.fetchOrCache(
          CacheKeys.activityComments(userId),
          () => api.users.getActivity({ type: 'comments' }),
          { maxAge: CacheDurations.ACTIVITY }
        )
        setItems(result.items || [])
        setNextCursor(result.nextCursor || null)
        setHasMore(result.hasMore || false)
      } else {
        // Subsequent pages: always fetch
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

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('activityItemA11y', {
          type: t('activityComment'),
          time: timeStr,
          title: item.postTitle || '',
        })}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTypeBadge}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('activityComment')}</ThemedText>
          </View>
          <ThemedText variant="caption" color="secondary">{timeStr}</ThemedText>
        </View>

        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.itemBody}>
            {t('activityDeleted')}
          </ThemedText>
        ) : (
          <ThemedText variant="bodySmall" color="secondary" numberOfLines={3} style={styles.itemBody}>
            {item.body}
          </ThemedText>
        )}

        {item.postTitle && (
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
        </View>
      </TouchableOpacity>
    )
  }, [styles, colors, t, handleItemPress])

  if (loading) return <ActivityListSkeleton styles={styles} tabType="comments" />
  if (error) return <ErrorView error={error} onRetry={() => fetchData()} styles={styles} colors={colors} t={t} />
  if (items.length === 0) {
    return (
      <EmptyView
        icon="chatbubble-outline"
        title={t('activityEmptyComments')}
        subtitle={t('activityEmptyCommentsSubtitle')}
        styles={styles}
        colors={colors}
      />
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `comment-${item.id}`}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.loadingMore} color={colors.primary} /> : null
      }
    />
  )
}

// ─── Shared components ──────────────────────────────────────────────────────

function EmptyView({ icon, title, subtitle, styles, colors }) {
  return (
    <View style={styles.centerContainer}>
      <Ionicons name={icon} size={48} color={colors.secondaryText} />
      <ThemedText variant="h2" color="secondary" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText variant="bodySmall" color="secondary">{subtitle}</ThemedText>
    </View>
  )
}

function ErrorView({ error, onRetry, styles, colors, t }) {
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

// ─── Styles ─────────────────────────────────────────────────────────────────

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Tab row
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.buttonSelected,
  },
  tabText: {
    color: colors.buttonDefaultText,
  },
  tabTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '700',
  },

  // List
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },

  // Shared item card
  itemCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: Spacing.md,
    gap: Spacing.xs,
  },

  // Post/Comment items (reused from old activity)
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

  // Position tab
  positionBadgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginBottom: Spacing.xs,
  },
  badge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.badgeText,
  },
  positionStatement: {
    marginBottom: Spacing.xs,
  },
  positionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Chatting list tab
  embeddedCard: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  chattingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  pendingBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: colors.badgeText,
    fontWeight: '600',
  },

  // Empty / error states
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

  // Skeleton
  skeletonFooterRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
})

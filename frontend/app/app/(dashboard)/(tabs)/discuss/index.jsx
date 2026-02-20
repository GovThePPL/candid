import { useState, useMemo, useContext, useCallback, useRef } from 'react'
import { View, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { Spacing } from '../../../../constants/Theme'
import { UserContext } from '../../../../contexts/UserContext'
import { useLocationCategory } from '../../../../contexts/LocationCategoryContext'
import { hasQAAuthority } from '../../../../lib/roles'
import useModerateChecker from '../../../../hooks/useModerateChecker'
import usePostsFeed from '../../../../hooks/usePostsFeed'
import api from '../../../../lib/api'
import Header from '../../../../components/Header'
import LocationCategorySelector from '../../../../components/LocationCategorySelector'
import FeedTabBar from '../../../../components/discuss/FeedTabBar'
import SortDropdown from '../../../../components/discuss/SortDropdown'
import PostCard from '../../../../components/discuss/PostCard'
import DownvoteReasonPicker from '../../../../components/discuss/DownvoteReasonPicker'
import ReportModal from '../../../../components/ReportModal'
import ModerationActionModal from '../../../../components/ModerationActionModal'
import EmptyState from '../../../../components/EmptyState'
import ThemedText from '../../../../components/ThemedText'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from '../../../../components/Skeleton'

function PostCardSkeleton({ styles }) {
  return (
    <View style={styles.skeletonCard}>
      {/* Top row: badge pill + time */}
      <View style={styles.skeletonTopRow}>
        <SkeletonBox width={120} height={20} borderRadius={10} />
        <SkeletonBox width={28} height={12} borderRadius={6} />
      </View>
      {/* Title: 2 lines */}
      <View style={{ gap: 6, marginTop: 10 }}>
        <SkeletonLine width="90%" height={16} />
        <SkeletonLine width="65%" height={16} />
      </View>
      {/* Body preview: 2 lines */}
      <View style={{ gap: 5, marginTop: 10 }}>
        <SkeletonLine width="100%" height={12} />
        <SkeletonLine width="80%" height={12} />
      </View>
      {/* Bottom row: author + actions */}
      <View style={styles.skeletonBottomRow}>
        <SkeletonBox width={80} height={12} borderRadius={6} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBox width={40} height={22} borderRadius={11} />
          <SkeletonBox width={50} height={22} borderRadius={11} />
        </View>
      </View>
    </View>
  )
}

function FeedSkeleton({ styles }) {
  return (
    <SkeletonPulse>
      {Array.from({ length: 4 }).map((_, i) => (
        <PostCardSkeleton key={i} styles={styles} />
      ))}
    </SkeletonPulse>
  )
}

export default function DiscussFeed() {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useContext(UserContext)
  const { selectedLocation, selectedCategory, setSelectedLocation, setSelectedCategory } = useLocationCategory()

  const [postType, setPostType] = useState('discussion')

  const isQAAuthority = hasQAAuthority(user)

  const {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    sort,
    setSort,
    answeredFilter,
    setAnsweredFilter,
    fetchPosts,
    loadMore,
    handleRefresh,
    handleUpvote,
    handleDownvote,
    handleToggleRole,
    handleLockPost,
  } = usePostsFeed(selectedLocation, selectedCategory, postType)

  // Refresh feed on focus (e.g. returning from creating a post)
  const hasMountedRef = useRef(false)
  useFocusEffect(useCallback(() => {
    if (hasMountedRef.current) {
      handleRefresh()
    } else {
      hasMountedRef.current = true
    }
  }, [handleRefresh]))

  // Downvote reason picker state
  const [downvotePostId, setDownvotePostId] = useState(null)

  // Reset answered filter when switching tabs
  const handleTabChange = useCallback((tab) => {
    setPostType(tab)
    setAnsweredFilter(null)
  }, [setAnsweredFilter])

  const handlePostPress = useCallback((post) => {
    router.push({ pathname: '/discuss/[id]', params: { id: post.id } })
  }, [router])

  const handlePostDownvote = useCallback((postId) => {
    const post = posts.find(p => p.id === postId)
    if (post?.userVote?.voteType === 'downvote') {
      // Already downvoted — toggle off
      handleDownvote(postId, post.userVote.downvoteReason || 'disagree')
    } else {
      // Show reason picker
      setDownvotePostId(postId)
    }
  }, [posts, handleDownvote])

  const handleDownvoteReasonSelect = useCallback((reason) => {
    if (downvotePostId) {
      handleDownvote(downvotePostId, reason)
      setDownvotePostId(null)
    }
  }, [downvotePostId, handleDownvote])

  // Report / moderate state
  const checkModerateScope = useModerateChecker()
  const [reportPostId, setReportPostId] = useState(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  const handleReportPost = useCallback((postId) => {
    setReportPostId(postId)
    setReportModalVisible(true)
  }, [])

  const handleReportSubmit = useCallback(async (ruleId, comment) => {
    await api.moderation.reportPost(reportPostId, ruleId, comment)
  }, [reportPostId])

  const handleModeratePost = useCallback((postId) => {
    setModerateTarget({ type: 'post', id: postId })
    setReportModalVisible(true)
  }, [])

  const handleModerateRuleSelected = useCallback(async (ruleId, comment, rule) => {
    setModerateRule(rule)
    setModerateComment(comment)
    setReportModalVisible(false)
    setTimeout(() => setActionModalVisible(true), 300)
  }, [])

  const handleModerateActionSubmit = useCallback(async (actionData) => {
    if (!moderateTarget || !moderateRule) return
    try {
      await api.moderation.inlineAction({
        targetType: moderateTarget.type,
        targetId: moderateTarget.id,
        ruleId: moderateRule.id,
        comment: moderateComment,
        ...actionData,
      })
      setActionModalVisible(false)
      Alert.alert(t('moderationSuccess'))
      handleRefresh()
    } catch (err) {
      if (err?.status === 403) {
        Alert.alert(t('moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t, handleRefresh])

  const renderPostCard = useCallback(({ item }) => {
    const canMod = checkModerateScope(item.location?.id, item.category?.id)
    return (
      <PostCard
        post={item}
        onPress={() => handlePostPress(item)}
        onUpvote={handleUpvote}
        onDownvote={handlePostDownvote}
        onToggleRole={handleToggleRole}
        onLock={handleLockPost}
        currentUserId={user?.id}
        canModerate={canMod}
        onReport={handleReportPost}
        onModerate={handleModeratePost}
      />
    )
  }, [handlePostPress, handleUpvote, handlePostDownvote, handleToggleRole, handleLockPost, user?.id, checkModerateScope, handleReportPost, handleModeratePost])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = useCallback(() => {
    if (loading) return null
    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('errorLoadPosts')}
          subtitle={error.message}
        />
      )
    }
    const isQA = postType === 'question'
    return (
      <EmptyState
        icon={isQA ? 'help-circle-outline' : 'chatbubbles-outline'}
        title={isQA ? t('emptyQATitle') : t('emptyFeedTitle')}
        subtitle={isQA ? t('emptyQASubtitle') : t('emptyFeedSubtitle')}
      />
    )
  }, [loading, error, postType, t])

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }, [loadingMore, colors.primary, styles.footer])

  // Q&A answered filter options
  const answerFilterOptions = postType === 'question' ? [
    { id: null, label: t('filterAll') },
    { id: 'true', label: t('filterAnswered') },
    { id: 'false', label: t('filterUnanswered') },
  ] : null

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header />

      <FlatList
        data={posts}
        renderItem={renderPostCard}
        keyExtractor={keyExtractor}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        ListHeaderComponent={
          <>
            <LocationCategorySelector
              selectedLocation={selectedLocation}
              selectedCategory={selectedCategory}
              onLocationChange={setSelectedLocation}
              onCategoryChange={setSelectedCategory}
              showAllCategories
            />

            {/* Tab bar + sort dropdown row */}
            <View style={styles.controlsRow}>
              <FeedTabBar activeTab={postType} onTabChange={handleTabChange} />
              <SortDropdown sort={sort} onSortChange={setSort} />
            </View>

            {/* Q&A filter row */}
            {answerFilterOptions && (
              <View style={styles.filterRow}>
                {answerFilterOptions.map((option) => {
                  const isActive = answeredFilter === option.id
                  return (
                    <TouchableOpacity
                      key={String(option.id)}
                      style={[styles.filterButton, isActive && styles.filterButtonActive]}
                      onPress={() => setAnsweredFilter(option.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={t('filterA11y', { filter: option.label })}
                    >
                      <ThemedText
                        variant="caption"
                        style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Skeleton loading for initial load */}
            {loading && !refreshing && (
              <FeedSkeleton styles={styles} />
            )}
          </>
        }
        contentContainerStyle={posts.length === 0 && !loading ? styles.emptyContainer : styles.listContent}
      />

      {/* Floating action button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: '/discuss/create', params: { type: postType } })}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('fabA11y')}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Downvote reason picker */}
      <DownvoteReasonPicker
        visible={downvotePostId != null}
        onClose={() => setDownvotePostId(null)}
        onSelect={handleDownvoteReasonSelect}
      />

      {/* Report modal (non-moderator report flow, or first step of moderation flow) */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false); setReportPostId(null) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : handleReportSubmit}
        contentType="post"
        isModerating={!!moderateTarget}
      />

      {/* Moderation action modal (second step of moderation flow) */}
      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => { setActionModalVisible(false); setModerateTarget(null); setModerateRule(null); setModerateComment(null) }}
        onSubmit={handleModerateActionSubmit}
        reportType={moderateTarget?.type}
        rule={moderateRule}
      />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterButtonActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  filterButtonText: {
    color: colors.secondaryText,
  },
  filterButtonTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  skeletonCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  skeletonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
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
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
})

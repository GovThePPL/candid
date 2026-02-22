import { useState, useRef, useMemo, useCallback, memo } from 'react'
import { View, TouchableOpacity, Pressable, Animated, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import LocationCategoryBadge from '../LocationCategoryBadge'
import BottomDrawerModal from '../BottomDrawerModal'

const COLLAPSED_HEIGHT = 80

/**
 * Post card for the feed list. Supports expanding the body inline.
 *
 * @param {Object} props
 * @param {Object} props.post - Post object from API
 * @param {Function} props.onPress - Called when card is tapped
 * @param {Function} props.onUpvote - Called with postId when upvote is tapped
 * @param {Function} props.onDownvote - Called with postId when downvote is tapped
 * @param {Function} props.onToggleRole - Called with (postId, showCreatorRole)
 * @param {string} [props.currentUserId] - Current user's ID (disables voting on own posts)
 */
export default memo(function PostCard({ post, onPress, onUpvote, onDownvote, onToggleRole, onLock, onEdit, onDelete, currentUserId, canModerate, onReport, onModerate, onTermPress, glossaryRules }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const router = useRouter()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [expanded, setExpanded] = useState(false)
  const [optionsVisible, setOptionsVisible] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const expandAnim = useRef(new Animated.Value(0)).current

  const isLocked = post.status === 'locked'
  const isOwnPost = currentUserId && post.creator?.id === currentUserId
  const displayName = post.creator?.displayName || post.creator?.username || '?'
  const relativeTime = require('../../lib/timeUtils').formatRelativeTime(post.createdTime, t)
  const hasBody = !!post.body
  const canEdit = isOwnPost && post.createdTime &&
    (Date.now() - new Date(post.createdTime).getTime() < 15 * 60 * 1000)
  const isEdited = post.updatedTime && post.createdTime &&
    new Date(post.updatedTime).getTime() - new Date(post.createdTime).getTime() > 1000
  const needsCollapse = contentHeight > COLLAPSED_HEIGHT

  const handleContentLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height
    // Use Math.max to prevent a Yoga feedback loop: when needsCollapse
    // constrains the parent to COLLAPSED_HEIGHT, Yoga reports the child's
    // *clipped* height, which would reset contentHeight and toggle
    // needsCollapse off, causing an infinite expand/contract cycle.
    if (h > 0) setContentHeight(prev => Math.max(prev, h))
  }, [])

  const handleExpand = useCallback((e) => {
    e?.stopPropagation?.()
    const toExpanded = !expanded
    setExpanded(toExpanded)
    Animated.timing(expandAnim, {
      toValue: toExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start()
  }, [expanded, expandAnim])

  const handleOptionsPress = (e) => {
    e?.stopPropagation?.()
    setOptionsVisible(true)
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityLabel={t('postCardA11y', { author: displayName, title: post.title })}
    >
      {/* Top row: badges left, age right */}
      <View style={styles.topRow}>
        <View style={styles.topRowLeft}>
          <LocationCategoryBadge location={post.location} category={post.category} size="md" />
          {isLocked && (
            <View style={styles.statusBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary" style={styles.statusText}>{t('locked')}</ThemedText>
            </View>
          )}
        </View>
        <View style={styles.topRowRight}>
          <BridgingBadge item={post} />
          {post.isAnswered && (
            <Ionicons name="checkmark-circle" size={16} color={SemanticColors.success} accessibilityLabel={t('answered')} />
          )}
          <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
          {isEdited && (
            <ThemedText variant="caption" color="secondary">{t('edited')}</ThemedText>
          )}
        </View>
      </View>

      {/* Title */}
      <ThemedText variant="h3" numberOfLines={2} style={styles.title}>{post.title}</ThemedText>

      {/* Body: markdown with animated height + fade gradient */}
      {hasBody && (
        <View style={styles.body}>
          <Animated.View style={[
            styles.bodyClip,
            needsCollapse && {
              height: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [COLLAPSED_HEIGHT, contentHeight],
              }),
              opacity: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.5, 1],
              }),
            },
          ]}>
            <View onLayout={handleContentLayout}>
              <MarkdownRenderer content={post.body} variant="post" glossaryRules={glossaryRules} />
            </View>
          </Animated.View>
          {needsCollapse && (
            <Animated.View
              style={[styles.fadeOverlay, { opacity: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[colors.cardBackground + '00', colors.cardBackground]}
                style={styles.fadeGradient}
              />
            </Animated.View>
          )}
        </View>
      )}

      {/* Expand/collapse toggle */}
      {hasBody && needsCollapse && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={handleExpand}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('collapsePostA11y') : t('expandPostA11y')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <ThemedText variant="caption" color="primary" style={styles.expandText}>
            {expanded ? t('collapsePost') : t('expandPost')}
          </ThemedText>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}

      {/* Bottom row: author left, actions right */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.()
            if (post.creator?.id) router.push(`/profile?userId=${post.creator.id}`)
          }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={t('viewProfileA11y', { author: displayName })}
          disabled={!post.creator?.id}
        >
          <ThemedText variant="caption" color="secondary" numberOfLines={1} style={styles.authorText}>
            {post.creator?.username ? `@${post.creator.username}` : displayName}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.bottomActions}>
          {/* Options (three-dot) button */}
          <TouchableOpacity
            onPress={handleOptionsPress}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('postOptionsA11y', { author: displayName })}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
          </TouchableOpacity>

          <View style={styles.commentCount}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{post.commentCount || 0}</ThemedText>
          </View>

          <VoteControl
            size="sm"
            upvoteCount={post.upvoteCount || 0}
            downvoteCount={post.downvoteCount || 0}
            userVote={post.userVote}
            onUpvote={() => onUpvote?.(post.id)}
            onDownvote={() => onDownvote?.(post.id)}
            authorName={displayName}
            targetType="post"
            disabled={isOwnPost}
          />
        </View>
      </View>

      {/* Options modal */}
      <BottomDrawerModal
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        title={t('postOptions')}
        shrink
      >
        <View style={styles.optionsList}>
          {isOwnPost && post.creatorRole != null && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                const newShow = post.showCreatorRole === false
                onToggleRole?.(post.id, newShow)
                setOptionsVisible(false)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('toggleRoleA11y')}
            >
              <Ionicons
                name={post.showCreatorRole !== false ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.secondaryText}
              />
              <ThemedText variant="body">
                {post.showCreatorRole !== false ? t('hideRoleBadge') : t('showRoleBadge')}
              </ThemedText>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={(e) => {
                e?.stopPropagation?.()
                setOptionsVisible(false)
                onEdit?.(post)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('editPostA11y')}
            >
              <Ionicons name="create-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="body">{t('editPost')}</ThemedText>
            </TouchableOpacity>
          )}
          {isOwnPost && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={(e) => {
                e?.stopPropagation?.()
                setOptionsVisible(false)
                onDelete?.(post.id)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('deletePostA11y')}
            >
              <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
              <ThemedText variant="body" style={{ color: SemanticColors.warning }}>{t('deletePost')}</ThemedText>
            </TouchableOpacity>
          )}
          {(isOwnPost || canModerate) && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                onLock?.(post.id, !isLocked)
                setOptionsVisible(false)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={isLocked ? t('unlockPostA11y') : t('lockPostA11y')}
            >
              <Ionicons
                name={isLocked ? 'lock-open-outline' : 'lock-closed-outline'}
                size={20}
                color={colors.secondaryText}
              />
              <ThemedText variant="body">
                {isLocked ? t('unlockPost') : t('lockPost')}
              </ThemedText>
            </TouchableOpacity>
          )}
          {canModerate ? (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { setOptionsVisible(false); onModerate?.(post.id) }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('moderatePostA11y', { author: displayName })}
            >
              <Ionicons name="shield-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="body">{t('moderate')}</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => { setOptionsVisible(false); onReport?.(post.id) }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('reportPostA11y', { author: displayName })}
            >
              <Ionicons name="flag-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="body">{t('report')}</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </BottomDrawerModal>
    </Pressable>
  )
}, (prev, next) => {
  // Custom comparison: skip re-render if post data hasn't changed
  const p = prev.post
  const n = next.post
  return (
    p.id === n.id &&
    p.userVote?.voteType === n.userVote?.voteType &&
    p.upvoteCount === n.upvoteCount &&
    p.downvoteCount === n.downvoteCount &&
    p.commentCount === n.commentCount &&
    p.status === n.status &&
    p.showCreatorRole === n.showCreatorRole &&
    p.bridgingScore === n.bridgingScore &&
    p.isAnswered === n.isAnswered &&
    p.title === n.title &&
    p.body === n.body &&
    p.updatedTime === n.updatedTime &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete
  )
})

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    ...Shadows.card,
  },
  cardPressed: {
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  topRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusText: {
    marginLeft: 2,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  body: {
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  bodyClip: {
    overflow: 'hidden',
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  fadeGradient: {
    flex: 1,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  expandText: {
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorText: {
    flexShrink: 1,
    minWidth: 0,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  optionsList: {
    padding: Spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
})

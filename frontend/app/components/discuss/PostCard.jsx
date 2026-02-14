import { useState, useMemo } from 'react'
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import UserCard from '../UserCard'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import LocationCategoryBadge from '../LocationCategoryBadge'

/**
 * Post card for the feed list. Supports expanding the body inline.
 *
 * @param {Object} props
 * @param {Object} props.post - Post object from API
 * @param {Function} props.onPress - Called when card is tapped
 * @param {Function} props.onUpvote - Called with postId when upvote is tapped
 * @param {Function} props.onDownvote - Called with postId when downvote is tapped
 * @param {string} [props.currentUserId] - Current user's ID (disables voting on own posts)
 */
export default function PostCard({ post, onPress, onUpvote, onDownvote, currentUserId }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [expanded, setExpanded] = useState(false)

  const isLocked = post.status === 'locked'
  const isOwnPost = currentUserId && post.creator?.id === currentUserId
  const displayName = post.creator?.displayName || post.creator?.username || '?'
  const relativeTime = require('../../lib/timeUtils').formatRelativeTime(post.createdTime, t)
  const hasBody = !!post.body

  const handleExpand = (e) => {
    e?.stopPropagation?.()
    setExpanded(prev => !prev)
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
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
            <View style={styles.answeredBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#FFFFFF" />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          )}
          <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
        </View>
      </View>

      {/* Title */}
      <ThemedText variant="h3" numberOfLines={2} style={styles.title}>{post.title}</ThemedText>

      {/* Body: collapsed preview or expanded markdown */}
      {hasBody && (
        expanded ? (
          <View style={styles.body}>
            <MarkdownRenderer content={post.body} variant="post" />
          </View>
        ) : (
          <ThemedText variant="body" color="secondary" numberOfLines={3} style={styles.body}>
            {post.body}
          </ThemedText>
        )
      )}

      {/* Expand/collapse toggle */}
      {hasBody && (
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
        <UserCard
          user={post.creator}
          compact
          discussRole={post.showCreatorRole !== false ? post.creatorRole : null}
        />

        <View style={styles.bottomActions}>
          <View style={styles.commentCount}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.secondaryText} />
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
    </Pressable>
  )
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
  answeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: SemanticColors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  answeredText: {
    ...Typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  title: {
    marginBottom: Spacing.xs,
  },
  body: {
    marginBottom: Spacing.sm,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: Spacing.md,
  },
  expandText: {
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
})

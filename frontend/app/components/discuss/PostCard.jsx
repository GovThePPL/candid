import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import { formatRelativeTime } from '../../lib/timeUtils'
import ThemedText from '../ThemedText'
import RoleBadge from './RoleBadge'

/**
 * Post card for the feed list.
 *
 * @param {Object} props
 * @param {Object} props.post - Post object from API
 * @param {Function} props.onPress - Called when card is tapped
 * @param {Function} props.onUpvote - Called with postId when upvote is tapped
 */
export default function PostCard({ post, onPress, onUpvote }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isUpvoted = post.userVote?.voteType === 'upvote'
  const isLocked = post.status === 'locked'
  const authorName = post.creator?.displayName || post.creator?.username || '?'
  const relativeTime = formatRelativeTime(post.createdTime, t)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('postCardA11y', { author: authorName, title: post.title })}
    >
      {/* Top row: category, locked, answered */}
      {(post.category || isLocked || post.isAnswered) && (
        <View style={styles.topRow}>
          {post.category && (
            <ThemedText variant="caption" color="secondary">{post.category.label}</ThemedText>
          )}
          {isLocked && (
            <View style={styles.statusBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary" style={styles.statusText}>{t('locked')}</ThemedText>
            </View>
          )}
          {post.isAnswered && (
            <View style={styles.answeredBadge}>
              <Ionicons name="checkmark-circle" size={13} color={SemanticColors.success} />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Title */}
      <ThemedText variant="h3" numberOfLines={2} style={styles.title}>{post.title}</ThemedText>

      {/* Body preview */}
      <ThemedText variant="bodySmall" color="secondary" numberOfLines={3} style={styles.body}>
        {post.body}
      </ThemedText>

      {/* Bottom row: upvote, comments, role badge, author, time */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.upvoteButton}
          onPress={() => onUpvote?.(post.id)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t('upvoteA11y')}
          accessibilityState={{ selected: isUpvoted }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isUpvoted ? 'chevron-up' : 'chevron-up-outline'}
            size={18}
            color={isUpvoted ? SemanticColors.agree : colors.secondaryText}
          />
          <ThemedText
            variant="caption"
            style={[styles.upvoteCount, isUpvoted && styles.upvoteCountActive]}
          >
            {post.upvoteCount || 0}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.commentCount}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.secondaryText} />
          <ThemedText variant="caption" color="secondary">{post.commentCount || 0}</ThemedText>
        </View>

        <View style={styles.authorSection}>
          {post.creatorRole && <RoleBadge role={post.creatorRole} />}
          <ThemedText variant="caption" color="secondary" numberOfLines={1} style={styles.authorName}>
            {authorName}
          </ThemedText>
        </View>

        <ThemedText variant="caption" color="secondary" style={styles.time}>{relativeTime}</ThemedText>
      </View>
    </TouchableOpacity>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
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
  },
  answeredText: {
    ...Typography.caption,
    color: SemanticColors.success,
    fontWeight: '600',
  },
  title: {
    marginBottom: Spacing.xs,
  },
  body: {
    marginBottom: Spacing.md,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  upvoteCount: {
    color: colors.secondaryText,
  },
  upvoteCountActive: {
    color: SemanticColors.agree,
    fontWeight: '600',
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'flex-end',
  },
  authorName: {
    maxWidth: 120,
  },
  time: {
    marginLeft: Spacing.xs,
  },
})

import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import { formatRelativeTime } from '../../lib/timeUtils'
import ThemedText from '../ThemedText'
import Avatar from '../Avatar'
import RoleBadge from './RoleBadge'
import MarkdownRenderer from './MarkdownRenderer'

/**
 * Full post display used as FlatList ListHeaderComponent on the post detail screen.
 *
 * @param {Object} props
 * @param {Object} props.post - Post object from API
 * @param {Function} props.onUpvote - Called when upvote is tapped
 * @param {Function} props.onDownvote - Called when downvote is tapped
 */
export default function PostHeader({ post, onUpvote, onDownvote }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const authorName = post.creator?.displayName || post.creator?.username || '?'
  const username = post.creator?.username || '?'
  const relativeTime = formatRelativeTime(post.createdTime, t)
  const isUpvoted = post.userVote?.voteType === 'upvote'
  const isDownvoted = post.userVote?.voteType === 'downvote'
  const isLocked = post.status === 'locked'

  return (
    <View style={styles.container}>
      {/* Author block */}
      <View style={styles.authorBlock}>
        <Avatar user={post.creator} size="md" />
        <View style={styles.authorText}>
          <View style={styles.authorTopRow}>
            <ThemedText variant="h3">{authorName}</ThemedText>
            <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
          </View>
          <View style={styles.authorBottomRow}>
            <ThemedText variant="caption" color="secondary">@{username}</ThemedText>
            {post.creatorRole && <RoleBadge role={post.creatorRole} />}
          </View>
        </View>
      </View>

      {/* Category and location */}
      {(post.category || post.location) && (
        <View style={styles.metaRow}>
          {post.location && (
            <View style={styles.badge}>
              <ThemedText variant="caption" color="badge">{post.location.name}</ThemedText>
            </View>
          )}
          {post.location && post.category && (
            <ThemedText variant="caption" color="secondary"> · </ThemedText>
          )}
          {post.category && (
            <View style={styles.badge}>
              <ThemedText variant="caption" color="badge">{post.category.label}</ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Title */}
      <ThemedText variant="h2" style={styles.title}>{post.title}</ThemedText>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Body */}
      {post.body && (
        <>
          <MarkdownRenderer content={post.body} variant="post" />
          <View style={styles.divider} />
        </>
      )}

      {/* Vote row */}
      <View style={styles.voteRow}>
        {/* Upvote */}
        <TouchableOpacity
          style={styles.voteButton}
          onPress={onUpvote}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t('upvoteA11y')}
          accessibilityState={{ selected: isUpvoted }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isUpvoted ? 'chevron-up' : 'chevron-up-outline'}
            size={22}
            color={isUpvoted ? SemanticColors.agree : colors.secondaryText}
          />
        </TouchableOpacity>

        <ThemedText
          variant="body"
          style={[styles.voteCount, isUpvoted && styles.voteCountUpvoted]}
        >
          {post.upvoteCount || 0}
        </ThemedText>

        {/* Downvote */}
        <TouchableOpacity
          style={styles.voteButton}
          onPress={onDownvote}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t('downvotePostA11y')}
          accessibilityState={{ selected: isDownvoted }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isDownvoted ? 'chevron-down' : 'chevron-down-outline'}
            size={22}
            color={isDownvoted ? SemanticColors.disagree : colors.secondaryText}
          />
        </TouchableOpacity>

        <ThemedText variant="body" color="secondary" style={styles.downvoteCount}>
          {post.downvoteCount || 0}
        </ThemedText>

        <View style={styles.voteSpacerDot} />

        {/* Comment count */}
        <Ionicons name="chatbubble-outline" size={16} color={colors.secondaryText} />
        <ThemedText variant="bodySmall" color="secondary">
          {post.commentCount || 0}
        </ThemedText>
      </View>

      {/* Status badges */}
      {(isLocked || post.isAnswered) && (
        <View style={styles.statusRow}>
          {isLocked && (
            <View style={styles.statusBadge}>
              <Ionicons name="lock-closed" size={14} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary">{t('locked')}</ThemedText>
            </View>
          )}
          {post.isAnswered && (
            <View style={styles.answeredBadge}>
              <Ionicons name="checkmark-circle" size={15} color={SemanticColors.success} />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    padding: Spacing.lg,
  },
  authorBlock: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  authorText: {
    flex: 1,
    justifyContent: 'center',
  },
  authorTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  badge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: Spacing.md,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  voteButton: {
    padding: 2,
  },
  voteCount: {
    ...Typography.body,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  voteCountUpvoted: {
    color: SemanticColors.agree,
  },
  downvoteCount: {
    marginRight: Spacing.sm,
  },
  voteSpacerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.secondaryText,
    marginHorizontal: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  answeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  answeredText: {
    ...Typography.caption,
    color: SemanticColors.success,
    fontWeight: '600',
  },
})

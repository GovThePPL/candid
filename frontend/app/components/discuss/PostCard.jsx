import { useState, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import { formatRelativeTime } from '../../lib/timeUtils'
import ThemedText from '../ThemedText'
import RoleBadge from './RoleBadge'
import MarkdownRenderer from './MarkdownRenderer'

/**
 * Post card for the feed list. Supports expanding the body inline.
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
  const [expanded, setExpanded] = useState(false)

  const isUpvoted = post.userVote?.voteType === 'upvote'
  const isLocked = post.status === 'locked'
  const displayName = post.creator?.displayName || post.creator?.username || '?'
  const username = post.creator?.username
  const relativeTime = formatRelativeTime(post.createdTime, t)
  const hasBody = !!post.body

  const handleExpand = () => {
    setExpanded(prev => !prev)
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('postCardA11y', { author: displayName, title: post.title })}
    >
      {/* Top row: badges left, age right */}
      <View style={styles.topRow}>
        <View style={styles.topRowLeft}>
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
        <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
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
            {displayName}
          </ThemedText>
          {username && (
            <ThemedText variant="caption" color="secondary" numberOfLines={1}>
              @{username}
            </ThemedText>
          )}
        </View>
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
    marginBottom: Spacing.sm,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.md,
  },
  expandText: {
    fontWeight: '600',
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
})

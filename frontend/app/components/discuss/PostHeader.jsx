import { useMemo, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import { formatRelativeTime } from '../../lib/timeUtils'
import ThemedText from '../ThemedText'
import UserCard from '../UserCard'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import BottomDrawerModal from '../BottomDrawerModal'
import LocationCategoryBadge from '../LocationCategoryBadge'

/**
 * Full post display used as FlatList ListHeaderComponent on the post detail screen.
 *
 * @param {Object} props
 * @param {Object} props.post - Post object from API
 * @param {string} props.currentUserId - Current user's ID
 * @param {Function} props.onUpvote - Called when upvote is tapped
 * @param {Function} props.onDownvote - Called when downvote is tapped
 * @param {Function} props.onToggleRole - Called with (postId, showCreatorRole)
 */
export default function PostHeader({ post, currentUserId, onUpvote, onDownvote, onToggleRole }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [optionsVisible, setOptionsVisible] = useState(false)

  const authorName = post.creator?.displayName || post.creator?.username || '?'
  const isOwnPost = currentUserId && post.creator?.id === currentUserId
  const isLocked = post.status === 'locked'
  const relativeTime = formatRelativeTime(post.createdTime, t)

  return (
    <View style={styles.container}>
      {/* Top row: badges left, time right */}
      <View style={styles.topRow}>
        <View style={styles.topRowLeft}>
          <LocationCategoryBadge location={post.location} category={post.category} size="lg" />
        </View>
        <View style={styles.topRowRight}>
          <BridgingBadge item={post} />
          <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
        </View>
      </View>

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

      {/* Bottom bar: author left, actions right */}
      <View style={styles.bottomBar}>
        <UserCard
          user={post.creator}
          compact
          discussRole={post.creatorRole}
          showRoleBadge={post.showCreatorRole !== false}
          style={styles.authorCard}
        />

        <View style={styles.bottomActions}>
          {/* Options (three-dot) button */}
          <TouchableOpacity
            onPress={() => setOptionsVisible(true)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('postOptionsA11y', { author: authorName })}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* Comment count */}
          <Ionicons name="chatbubble-outline" size={16} color={colors.secondaryText} />
          <ThemedText variant="bodySmall" color="secondary">
            {post.commentCount || 0}
          </ThemedText>

          <VoteControl
            size="sm"
            upvoteCount={post.upvoteCount || 0}
            downvoteCount={post.downvoteCount || 0}
            userVote={post.userVote}
            onUpvote={onUpvote}
            onDownvote={onDownvote}
            authorName={authorName}
            targetType="post"
            disabled={isOwnPost}
          />
        </View>
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
              <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          )}
        </View>
      )}

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
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setOptionsVisible(false)}
            activeOpacity={0.7}
            accessibilityRole="menuitem"
            accessibilityLabel={t('reportPostA11y', { author: authorName })}
          >
            <Ionicons name="flag-outline" size={20} color={colors.secondaryText} />
            <ThemedText variant="body">{t('report')}</ThemedText>
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    padding: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  topRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: Spacing.md,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorCard: {
    flexShrink: 1,
    minWidth: 0,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
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

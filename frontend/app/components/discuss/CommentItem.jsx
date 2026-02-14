import { memo, useState, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import UserCard from '../UserCard'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import BottomDrawerModal from '../BottomDrawerModal'
import { formatRelativeTime } from '../../lib/timeUtils'

const INDENT_PX = 8

/**
 * Single comment in a thread with indentation, voting, reply, and collapse.
 *
 * @param {Object} props
 * @param {Object} props.comment - Flattened comment node with depth/visualDepth
 * @param {string} props.currentUserId - Current user's ID
 * @param {boolean} props.isQAPost - Whether the parent post is a Q&A question
 * @param {boolean} props.isPostLocked - Whether the parent post is locked
 * @param {boolean} props.currentUserHasQAAuthority - Whether current user has QA authority
 * @param {Function} props.onUpvote - Called with comment id
 * @param {Function} props.onDownvote - Called with comment id
 * @param {Function} props.onReply - Called with comment object
 * @param {Function} props.onToggleCollapse - Called with comment id
 * @param {Function} props.onToggleRole - Called with (commentId, showCreatorRole)
 */
export default memo(function CommentItem({
  comment,
  currentUserId,
  isQAPost,
  isPostLocked,
  currentUserHasQAAuthority,
  onUpvote,
  onDownvote,
  onReply,
  onToggleCollapse,
  onToggleRole,
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [optionsVisible, setOptionsVisible] = useState(false)

  const isDeleted = comment.isDeleted || comment.deletedByModerator
  const isOwnComment = currentUserId && comment.creator?.id === currentUserId
  const authorName = comment.creator?.displayName || comment.creator?.username || '?'
  const hasChildren = (comment.children?.length || 0) > 0
  const isEdited = comment.updatedTime && comment.createdTime &&
    new Date(comment.updatedTime).getTime() - new Date(comment.createdTime).getTime() > 1000

  // Q&A reply visibility: non-authority can only reply to authority comments
  const canReply = !isPostLocked && !isDeleted && (() => {
    if (!isQAPost) return true
    if (currentUserHasQAAuthority) return true
    // Non-authority can reply to authority comments only
    return comment.creatorRole != null
  })()

  const lineStates = comment.lineStates || []

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('commentByA11y', { author: authorName })}
    >
      {/* Depth thread lines with start/end/full/stub rendering */}
      {lineStates.length > 0 && (
        <View style={styles.linesContainer}>
          {lineStates.map((state, i) => {
            if (state === null) {
              return <View key={i} style={styles.lineSpacer} />
            }
            return (
              <View key={i} style={styles.lineWrapper}>
                <View style={[
                  styles.lineSegment,
                  (state === 'start' || state === 'stub') && styles.lineInsetTop,
                  (state === 'end' || state === 'stub') && styles.lineInsetBottom,
                ]} />
              </View>
            )
          })}
          <View style={styles.depthSpacer} />
        </View>
      )}

      <View style={styles.content}>
        {/* Header row: avatar, author, role, time, depth badge */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {!isDeleted ? (
              <UserCard
                variant="inline"
                user={comment.creator}
                discussRole={comment.showCreatorRole !== false ? comment.creatorRole : null}
              />
            ) : (
              <ThemedText variant="caption" color="secondary">
                {comment.deletedByModerator ? t('removedComment') : t('deletedComment')}
              </ThemedText>
            )}
            {comment.depth > 5 && (
              <ThemedText
                variant="caption"
                color="secondary"
                accessibilityLabel={t('depthIndicatorA11y', { depth: comment.depth })}
              >
                {'↳ ' + comment.depth}
              </ThemedText>
            )}
          </View>
          <View style={styles.headerRight}>
            <BridgingBadge item={comment} />
            {comment.createdTime && (
              <ThemedText variant="caption" color="secondary">
                {formatRelativeTime(comment.createdTime, t)}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Body — tappable to collapse children */}
        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.body}>
            {comment.deletedByModerator ? t('removedComment') : t('deletedComment')}
          </ThemedText>
        ) : hasChildren ? (
          <TouchableOpacity
            style={styles.body}
            onPress={() => onToggleCollapse(comment.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              comment.isCollapsed
                ? t('expandButtonA11y', { count: comment.collapsedCount || 0 })
                : t('collapseButtonA11y', { count: comment.children?.length || 0 })
            }
          >
            <MarkdownRenderer content={comment.body} variant="comment" />
          </TouchableOpacity>
        ) : (
          <View style={styles.body}>
            <MarkdownRenderer content={comment.body} variant="comment" />
          </View>
        )}

        {/* Action row: collapsed indicator, spacer, options, reply pill, vote pill */}
        {!isDeleted && (
          <View style={styles.actionRow}>
            {/* Left side: collapsed summary + edited indicator */}
            {comment.isCollapsed && comment.collapsedCount > 0 && (
              <TouchableOpacity
                onPress={() => onToggleCollapse(comment.id)}
                activeOpacity={0.6}
                style={styles.collapsedSummary}
                accessibilityRole="button"
                accessibilityLabel={t('expandButtonA11y', { count: comment.collapsedCount })}
              >
                <Ionicons name="chevron-forward" size={14} color={colors.secondaryText} />
                <ThemedText variant="caption" color="secondary">
                  {t('nReplies', { count: comment.collapsedCount })}
                </ThemedText>
              </TouchableOpacity>
            )}
            {isEdited && (
              <ThemedText variant="caption" color="secondary">{t('edited')}</ThemedText>
            )}

            <View style={styles.actionSpacer} />

            {/* Options (three-dot) button */}
            <TouchableOpacity
              onPress={() => setOptionsVisible(true)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('commentOptionsA11y', { author: authorName })}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.secondaryText} />
            </TouchableOpacity>

            {/* Reply pill */}
            {canReply && (
              <TouchableOpacity
                style={styles.replyPill}
                onPress={() => onReply(comment)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={t('replyButtonA11y', { author: authorName })}
              >
                <Ionicons name="arrow-undo-outline" size={14} color={colors.secondaryText} />
                <ThemedText variant="caption" color="secondary">{t('reply')}</ThemedText>
              </TouchableOpacity>
            )}

            {/* Vote pill */}
            <VoteControl
              size="sm"
              upvoteCount={comment.upvoteCount || 0}
              downvoteCount={comment.downvoteCount || 0}
              userVote={comment.userVote}
              onUpvote={() => onUpvote(comment.id)}
              onDownvote={() => onDownvote(comment.id)}
              authorName={authorName}
              targetType="comment"
              disabled={isOwnComment}
            />
          </View>
        )}

        {/* Options modal */}
        <BottomDrawerModal
          visible={optionsVisible}
          onClose={() => setOptionsVisible(false)}
          title={t('commentOptions')}
          shrink
        >
          <View style={styles.optionsList}>
            {isOwnComment && comment.creatorRole != null && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  const newShow = comment.showCreatorRole === false
                  onToggleRole?.(comment.id, newShow)
                  setOptionsVisible(false)
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('toggleRoleA11y')}
              >
                <Ionicons
                  name={comment.showCreatorRole !== false ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.secondaryText}
                />
                <ThemedText variant="body">
                  {comment.showCreatorRole !== false ? t('hideRoleBadge') : t('showRoleBadge')}
                </ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setOptionsVisible(false)}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('reportA11y', { author: authorName })}
            >
              <Ionicons name="flag-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="body">{t('report')}</ThemedText>
            </TouchableOpacity>
          </View>
        </BottomDrawerModal>
      </View>
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
  },
  linesContainer: {
    flexDirection: 'row',
  },
  lineWrapper: {
    width: INDENT_PX,
  },
  lineSpacer: {
    width: INDENT_PX,
  },
  lineSegment: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.cardBorder,
  },
  lineInsetTop: {
    marginTop: Spacing.sm,
  },
  lineInsetBottom: {
    marginBottom: Spacing.sm,
  },
  depthSpacer: {
    width: 4,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.sm,
    marginLeft: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  body: {
    marginBottom: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionSpacer: {
    flex: 1,
  },
  replyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  collapsedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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

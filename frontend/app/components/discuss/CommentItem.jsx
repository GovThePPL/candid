import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import UserCard from '../UserCard'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import BottomDrawerModal from '../BottomDrawerModal'
import { ROLE_COLORS } from './RoleBadge'
import { THREAD_DEPTH_LIMIT } from '../../lib/commentTree'
import { formatRelativeTime } from '../../lib/timeUtils'

const INDENT_PX = 16

export default memo(function CommentItem({
  comment,
  currentUserId,
  isPostAuthor,
  isQAPost,
  isPostLocked,
  currentUserHasQAAuthority,
  onUpvote,
  onDownvote,
  onReply,
  onEdit,
  onDelete,
  onToggleCollapse,
  onToggleRole,
  onToggleMuteComment,
  onPinComment,
  onContinueThread,
  isTruncatedRoot,
  onLoadMoreReplies,
  isFocused,
  isScrollTarget,
  onFocusReady,
  canModerate,
  onReport,
  onModerate,
  depthLimit = THREAD_DEPTH_LIMIT,
  glossaryRules,
  readOnly,
}) {
  const { t } = useTranslation('discuss')
  const { isDark } = useTheme()
  const colors = useThemeColors()
  const router = useRouter()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [optionsVisible, setOptionsVisible] = useState(false)
  const containerRef = useRef(null)

  const isDeleted = comment.isDeleted || comment.deletedByModerator
  const isOwnComment = currentUserId && comment.creator?.id === currentUserId
  const authorName = comment.creator?.displayName || comment.creator?.username || '?'
  const hasChildren = !!comment.hasChildren
  const atDepthLimit = comment.depth >= depthLimit
  const isEdited = comment.updatedTime && comment.createdTime &&
    new Date(comment.updatedTime).getTime() - new Date(comment.createdTime).getTime() > 1000
  const canEdit = isOwnComment && !isDeleted && comment.createdTime &&
    (Date.now() - new Date(comment.createdTime).getTime() < 15 * 60 * 1000)

  // Q&A reply visibility: non-authority can only reply to authority comments
  const canReply = !isPostLocked && !isDeleted && !readOnly && (() => {
    if (!isQAPost) return true
    if (currentUserHasQAAuthority) return true
    // Non-authority can reply to authority comments only
    return comment.creatorRole != null
  })()

  // Role-based content tint
  const roleHighlightBg = useMemo(() => {
    if (isDeleted || !comment.creatorRole || comment.showCreatorRole === false) return null
    const color = ROLE_COLORS[comment.creatorRole]
    if (!color) return null
    return color + (isDark ? '30' : '1A')
  }, [isDeleted, comment.creatorRole, comment.showCreatorRole, isDark])

  // measureInWindow for scroll positioning (fires on scroll target, not focused comment)
  useEffect(() => {
    if (!isScrollTarget || !containerRef.current) return
    const timer = setTimeout(() => {
      containerRef.current.measureInWindow((x, y, w, h) => {
        if (y === 0 && h === 0) return
        onFocusReady?.(y)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [isScrollTarget])

  // Stable callbacks for child components (avoid inline arrows that defeat memo)
  const handleUpvote = useCallback(() => onUpvote(comment.id), [onUpvote, comment.id])
  const handleDownvote = useCallback(() => onDownvote(comment.id), [onDownvote, comment.id])
  const handleCollapse = useCallback(() => onToggleCollapse(comment.id), [onToggleCollapse, comment.id])

  const lineStates = comment.lineStates || []

  return (
    <View
      ref={containerRef}
      style={styles.container}
      accessibilityLabel={t('commentByA11y', { author: authorName })}
    >
      {/* Role highlight overlay — from thread lines to right screen edge */}
      {roleHighlightBg && (
        <View
          style={[styles.roleHighlight, { backgroundColor: roleHighlightBg }]}
          pointerEvents="none"
        />
      )}
      {/* Focus highlight overlay */}
      {isFocused && (
        <View
          style={[StyleSheet.absoluteFill, {
            backgroundColor: isDark ? 'rgba(255, 184, 255, 0.12)' : 'rgba(92, 0, 92, 0.10)',
            borderRadius: 4,
          }]}
          pointerEvents="none"
        />
      )}
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
              <TouchableOpacity
                onPress={() => comment.creator?.username && router.push(`/user/${comment.creator.username}`)}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={t('viewProfileA11y', { author: authorName })}
                disabled={!comment.creator?.username}
              >
                <UserCard
                  compact
                  avatarSize={22}
                  user={comment.creator}
                  discussRole={comment.creatorRole}
                  showRoleBadge={comment.showCreatorRole !== false}
                />
              </TouchableOpacity>
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
            {comment.isPinned && (
              <View
                style={styles.pinnedBadge}
                accessibilityLabel={t('pinnedA11y')}
              >
                <Ionicons name="pin" size={12} color={colors.primary} />
                <ThemedText variant="caption" color="primary">{t('pinned')}</ThemedText>
              </View>
            )}
            <BridgingBadge item={comment} />
            {comment.createdTime && (
              <ThemedText variant="caption" color="secondary">
                {formatRelativeTime(comment.createdTime, t)}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Auto-collapsed below-threshold indicator */}
        {!isDeleted && comment.isAutoCollapsed && (
          <TouchableOpacity
            style={styles.autoCollapsedRow}
            onPress={handleCollapse}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('belowThresholdA11y', { author: authorName })}
          >
            <Ionicons name="chevron-forward" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">
              {t('belowThreshold')}
            </ThemedText>
          </TouchableOpacity>
        )}

        {/* Body — tappable to collapse children (not at depth limit where children aren't inline) */}
        {isDeleted ? (
          <ThemedText variant="bodySmall" color="placeholder" style={styles.body}>
            {comment.deletedByModerator ? t('removedComment') : t('deletedComment')}
          </ThemedText>
        ) : comment.isAutoCollapsed ? null : (hasChildren && !atDepthLimit) ? (
          <TouchableOpacity
            style={styles.body}
            onPress={handleCollapse}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              comment.isCollapsed
                ? t('expandButtonA11y', { count: comment.collapsedCount || 0 })
                : t('collapseButtonA11y', { count: comment.children?.length || 0 })
            }
          >
            <MarkdownRenderer content={comment.body} variant="comment" glossaryRules={glossaryRules} />
          </TouchableOpacity>
        ) : (
          <View style={styles.body}>
            <MarkdownRenderer content={comment.body} variant="comment" glossaryRules={glossaryRules} />
          </View>
        )}

        {/* Action row: collapsed indicator, spacer, options, reply pill, vote pill */}
        {!isDeleted && !comment.isAutoCollapsed && (
          <View style={styles.actionRow}>
            {/* Left side: collapsed summary + edited indicator (not at depth limit) */}
            {comment.isCollapsed && comment.collapsedCount > 0 && !atDepthLimit && (
              <TouchableOpacity
                onPress={handleCollapse}
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
              <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
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
                <Ionicons name="arrow-undo-outline" size={18} color={colors.secondaryText} />
                <ThemedText variant="caption" color="secondary">{t('reply')}</ThemedText>
              </TouchableOpacity>
            )}

            {/* Vote pill */}
            <VoteControl
              size="sm"
              upvoteCount={comment.upvoteCount || 0}
              downvoteCount={comment.downvoteCount || 0}
              userVote={comment.userVote}
              onUpvote={handleUpvote}
              onDownvote={handleDownvote}
              authorName={authorName}
              targetType="comment"
              disabled={isOwnComment || readOnly}
            />
          </View>
        )}

        {/* Continue this thread link (at depth limit where children aren't rendered inline) */}
        {!isDeleted && atDepthLimit && hasChildren && onContinueThread && (
          <TouchableOpacity
            style={styles.continueThread}
            onPress={() => onContinueThread(comment.id)}
            activeOpacity={0.6}
            accessibilityRole="link"
            accessibilityLabel={t('continueThreadA11y')}
          >
            <ThemedText variant="caption" color="primary">
              {t('continueThread')}
            </ThemedText>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Load more replies (for truncated root threads) */}
        {!isDeleted && isTruncatedRoot && onLoadMoreReplies && (
          <TouchableOpacity
            style={styles.continueThread}
            onPress={() => onLoadMoreReplies(comment.id)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('loadMoreRepliesA11y')}
          >
            <Ionicons name="chatbubbles-outline" size={14} color={colors.primary} />
            <ThemedText variant="caption" color="primary">
              {t('loadMoreReplies')}
            </ThemedText>
          </TouchableOpacity>
        )}

        {/* Options modal */}
        <BottomDrawerModal
          visible={optionsVisible}
          onClose={() => setOptionsVisible(false)}
          title={t('commentOptions')}
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
            {isOwnComment && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  onToggleMuteComment?.(comment.id, !comment.isMuted)
                  setOptionsVisible(false)
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('muteCommentNotificationsA11y')}
              >
                <Ionicons
                  name={comment.isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                  size={20}
                  color={colors.secondaryText}
                />
                <ThemedText variant="body">
                  {comment.isMuted ? t('unmuteCommentNotifications') : t('muteCommentNotifications')}
                </ThemedText>
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsVisible(false)
                  onEdit?.(comment)
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('editCommentA11y')}
              >
                <Ionicons name="create-outline" size={20} color={colors.secondaryText} />
                <ThemedText variant="body">{t('editComment')}</ThemedText>
              </TouchableOpacity>
            )}
            {isOwnComment && !isDeleted && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsVisible(false)
                  onDelete?.(comment.id)
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('deleteCommentA11y')}
              >
                <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
                <ThemedText variant="body" style={{ color: SemanticColors.warning }}>{t('deleteComment')}</ThemedText>
              </TouchableOpacity>
            )}
            {(isPostAuthor || canModerate) && comment.depth === 0 && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  onPinComment?.(comment.isPinned ? null : comment.id)
                  setOptionsVisible(false)
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={comment.isPinned ? t('unpinCommentA11y') : t('pinCommentA11y')}
              >
                <Ionicons
                  name={comment.isPinned ? 'pin-outline' : 'pin'}
                  size={20}
                  color={colors.secondaryText}
                />
                <ThemedText variant="body">
                  {comment.isPinned ? t('unpinComment') : t('pinComment')}
                </ThemedText>
              </TouchableOpacity>
            )}
            {canModerate ? (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => { setOptionsVisible(false); onModerate?.(comment.id) }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('moderateCommentA11y', { author: authorName })}
              >
                <Ionicons name="shield-outline" size={20} color={colors.secondaryText} />
                <ThemedText variant="body">{t('moderate')}</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => { setOptionsVisible(false); onReport?.(comment.id) }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={t('reportA11y', { author: authorName })}
              >
                <Ionicons name="flag-outline" size={20} color={colors.secondaryText} />
                <ThemedText variant="body">{t('report')}</ThemedText>
              </TouchableOpacity>
            )}
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
  roleHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: Spacing.lg,
    right: 0,
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
    borderLeftColor: colors.threadLine,
    marginLeft: 7,
  },
  lineInsetTop: {
    marginTop: Spacing.sm,
  },
  lineInsetBottom: {
    marginBottom: Spacing.sm,
  },
  depthSpacer: {
    width: 7,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.sm,
    marginLeft: 0,
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
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  collapsedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  autoCollapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    opacity: 0.7,
  },
  continueThread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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

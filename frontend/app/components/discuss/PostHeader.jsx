import { useMemo, useState, useRef, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, Typography } from '../../constants/Theme'
import { SemanticColors, OnBrandColors } from '../../constants/Colors'
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
export default function PostHeader({ post, currentUserId, onUpvote, onDownvote, onToggleRole, onToggleMute, onLock, onEdit, onDelete, isMuted, canModerate, onReport, onModerate, glossaryRules }) {
  const { t } = useTranslation('discuss')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [optionsVisible, setOptionsVisible] = useState(false)
  const [availableRight, setAvailableRight] = useState(Infinity)
  const rowWidthRef = useRef(0)
  const leftWidthRef = useRef(0)
  const compactBadges = availableRight < 200

  const updateAvailableRight = useCallback(() => {
    if (rowWidthRef.current > 0 && leftWidthRef.current > 0) {
      setAvailableRight(rowWidthRef.current - leftWidthRef.current)
    }
  }, [])

  const authorName = post.creator?.displayName || post.creator?.username || '?'
  const isOwnPost = currentUserId && post.creator?.id === currentUserId
  const isLocked = post.status === 'locked'
  const relativeTime = formatRelativeTime(post.createdTime, t)
  const canEdit = isOwnPost && post.createdTime &&
    (Date.now() - new Date(post.createdTime).getTime() < 15 * 60 * 1000)
  const isEdited = post.updatedTime && post.createdTime &&
    new Date(post.updatedTime).getTime() - new Date(post.createdTime).getTime() > 1000

  return (
    <View style={styles.container}>
      {/* Top row: badges left, time right */}
      <View style={styles.topRow} onLayout={e => { rowWidthRef.current = e.nativeEvent.layout.width; updateAvailableRight() }}>
        <View style={styles.topRowLeft} onLayout={e => { leftWidthRef.current = e.nativeEvent.layout.width; updateAvailableRight() }}>
          <LocationCategoryBadge location={post.location} category={post.category} size="lg" />
        </View>
        <View style={styles.topRowRight}>
          <BridgingBadge item={post} compact={compactBadges} />
          {post.isAnswered && (compactBadges ? (
            <Ionicons name="checkmark-circle" size={16} color={SemanticColors.success} accessibilityLabel={t('answered')} />
          ) : (
            <View style={styles.answeredBadge} accessibilityLabel={t('answered')}>
              <Ionicons name="checkmark-circle" size={15} color={OnBrandColors.text} />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          ))}
          <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
          {isEdited && (
            <ThemedText variant="caption" color="secondary">{t('edited')}</ThemedText>
          )}
        </View>
      </View>

      {/* Title */}
      <ThemedText variant="h2" style={styles.title}>{post.title}</ThemedText>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Body */}
      {post.body && (
        <>
          <MarkdownRenderer content={post.body} variant="post" glossaryRules={glossaryRules} />
          <View style={styles.divider} />
        </>
      )}

      {/* Bottom bar: author left, actions right */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => post.creator?.username && router.push(`/user/${post.creator.username}`)}
          disabled={!post.creator?.username}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={t('viewProfileA11y', { author: authorName })}
          style={styles.authorCard}
        >
          <UserCard
            user={post.creator}
            compact
            discussRole={post.creatorRole}
            showRoleBadge={post.showCreatorRole !== false}
          />
        </TouchableOpacity>

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
      {isLocked && (
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Ionicons name="lock-closed" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">{t('locked')}</ThemedText>
          </View>
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
          {isOwnPost && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                onToggleMute?.(!isMuted)
                setOptionsVisible(false)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={t('mutePostNotificationsA11y')}
            >
              <Ionicons
                name={isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                size={20}
                color={colors.secondaryText}
              />
              <ThemedText variant="body">
                {isMuted ? t('unmutePostNotifications') : t('mutePostNotifications')}
              </ThemedText>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
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
              onPress={() => {
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
                onLock?.(!isLocked)
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
              accessibilityLabel={t('moderatePostA11y', { author: authorName })}
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
              accessibilityLabel={t('reportPostA11y', { author: authorName })}
            >
              <Ionicons name="flag-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="body">{t('report')}</ThemedText>
            </TouchableOpacity>
          )}
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
    color: OnBrandColors.text,
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

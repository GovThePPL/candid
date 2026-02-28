import { useState, useRef, useMemo, useCallback, memo } from 'react'
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import VoteControl from './VoteControl'
import BridgingBadge from './BridgingBadge'
import MarkdownRenderer from './MarkdownRenderer'
import LocationSessionBadge from '../LocationSessionBadge'
import ProposalBadge from './ProposalBadge'
import BottomDrawerModal from '../BottomDrawerModal'
import useExpandCollapse from '../../hooks/useExpandCollapse'
import { useLocationSession } from '../../contexts/LocationSessionContext'

const COLLAPSED_HEIGHT = 100
const POST_PROPOSAL_STAGES = new Set([
  'opinion_discussion', 'reflection_curation', 'reflection_proposals',
  'consensus',
])
// Available space right of left badges below which BridgingBadge/Answered go compact
const COMPACT_BADGES_THRESHOLD = 200

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
export default memo(function PostCard({ post, onPress, onUpvote, onDownvote, onToggleRole, onLock, onEdit, onDelete, currentUserId, canModerate, onReport, onModerate, onPin, onTermPress, glossaryRules, readOnly, onFinalize, votingRoundStatus, onEndorse, isEndorsed, endorseLimitReached, onEndorseLimitReached, stage }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const router = useRouter()
  const { openSessionOverview } = useLocationSession()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [optionsVisible, setOptionsVisible] = useState(false)
  const [availableRight, setAvailableRight] = useState(Infinity)
  const rowWidthRef = useRef(0)
  const leftWidthRef = useRef(0)

  const isLocked = post.status === 'locked'
  const isOwnPost = currentUserId && post.creator?.id === currentUserId
  const displayName = post.creator?.displayName || post.creator?.username || '?'
  const relativeTime = require('../../lib/timeUtils').formatRelativeTime(post.createdTime, t)
  const hasBody = !!post.body
  const canEdit = isOwnPost && post.createdTime &&
    (Date.now() - new Date(post.createdTime).getTime() < 15 * 60 * 1000)
  const isEdited = post.updatedTime && post.createdTime &&
    new Date(post.updatedTime).getTime() - new Date(post.createdTime).getTime() > 1000
  const collapsedHeight = post.isPinned ? 0 : COLLAPSED_HEIGHT
  const collapsedOpacity = post.isPinned ? 0 : 0.5
  const {
    expanded, contentHeight, measured,
    handleContentLayout, toggle: handleExpand,
    clipStyle, fadeOverlayStyle,
  } = useExpandCollapse({ collapsedHeight, collapsedOpacity })
  const needsCollapse = post.isPinned ? hasBody : contentHeight > COLLAPSED_HEIGHT
  const compactBadges = availableRight < COMPACT_BADGES_THRESHOLD
  const isSessionTopic = !!(post.isPinned && post.proposalStatus === 'finalized' && stage && POST_PROPOSAL_STAGES.has(stage))

  const updateAvailableRight = useCallback(() => {
    if (rowWidthRef.current > 0 && leftWidthRef.current > 0) {
      setAvailableRight(rowWidthRef.current - leftWidthRef.current)
    }
  }, [])

  const handleOptionsPress = (e) => {
    e?.stopPropagation?.()
    setOptionsVisible(true)
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isSessionTopic ? t('sessionTopicA11y') : t('postCardA11y', { author: displayName, title: post.title })}
    >
      {/* Top row: badges left, age right */}
      <View style={styles.topRow} onLayout={e => { rowWidthRef.current = e.nativeEvent.layout.width; updateAvailableRight() }}>
        <View style={styles.topRowLeft} onLayout={e => { leftWidthRef.current = e.nativeEvent.layout.width; updateAvailableRight() }}>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); openSessionOverview() }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common:sessionInfoA11y')}
          >
            <LocationSessionBadge location={post.location} session={post.session} size="md" />
          </TouchableOpacity>
          {post.isPinned && !isSessionTopic && (
            <View style={styles.pinnedBadge} accessibilityLabel={t('pinnedPost')}>
              <Ionicons name="pin" size={12} color={colors.primary} />
              <ThemedText variant="caption" style={styles.pinnedText}>{t('pinnedPost')}</ThemedText>
            </View>
          )}
          {isLocked && (
            <View style={styles.statusBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.secondaryText} />
              <ThemedText variant="caption" color="secondary" style={styles.statusText}>{t('locked')}</ThemedText>
            </View>
          )}
        </View>
        <View style={styles.topRowRight}>
          {post.proposalStatus && (
            <ProposalBadge status={post.proposalStatus} isSessionTopic={isSessionTopic} />
          )}
          {!isSessionTopic && <BridgingBadge item={post} compact={compactBadges} />}
          {post.isAnswered && (compactBadges ? (
            <Ionicons name="checkmark-circle" size={16} color={SemanticColors.success} accessibilityLabel={t('answered')} />
          ) : (
            <View style={styles.answeredBadge} accessibilityLabel={t('answered')}>
              <Ionicons name="checkmark-circle" size={14} color={OnBrandColors.text} />
              <ThemedText style={styles.answeredText}>{t('answered')}</ThemedText>
            </View>
          ))}
          {!isSessionTopic && (
            <ThemedText variant="caption" color="secondary">{relativeTime}</ThemedText>
          )}
          {!isSessionTopic && isEdited && (
            <ThemedText variant="caption" color="secondary">{t('edited')}</ThemedText>
          )}
        </View>
      </View>

      {/* Title */}
      <ThemedText variant="h3" numberOfLines={2} style={styles.title}>{post.title}</ThemedText>

      {/* Body: markdown with animated height + fade gradient.
           Before measurement, the outer clip is fixed at COLLAPSED_HEIGHT and
           the inner content is position-absolute so onLayout reports its true
           intrinsic height (not the clipped value). This avoids any flash of
           full-height content — the card always reserves COLLAPSED_HEIGHT. */}
      {hasBody && (
        <View style={styles.body}>
          <Animated.View style={[
            styles.bodyClip,
            !measured && { height: collapsedHeight || COLLAPSED_HEIGHT },
            measured && needsCollapse && clipStyle,
          ]}>
            <View
              style={!measured ? styles.measuringInner : undefined}
              onLayout={handleContentLayout}
            >
              <MarkdownRenderer content={post.body} variant="post" glossaryRules={glossaryRules} />
            </View>
          </Animated.View>
          {collapsedHeight > 0 && (!measured || (needsCollapse && !expanded)) && (
            <Animated.View
              style={[styles.fadeOverlay, measured ? fadeOverlayStyle : { opacity: 1 }]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  colors.cardBackground + '00',
                  colors.cardBackground,
                ]}
                style={styles.fadeGradient}
              />
            </Animated.View>
          )}
        </View>
      )}

      {/* Expand/collapse toggle — shown optimistically before measurement */}
      {hasBody && (!measured || needsCollapse) && (
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

      {/* Finalize button: author's own draft proposal during finalization_open */}
      {isOwnPost && post.proposalStatus === 'draft' && votingRoundStatus === 'finalization_open' && (
        <TouchableOpacity
          style={styles.finalizeButton}
          onPress={(e) => { e?.stopPropagation?.(); onFinalize?.(post.id) }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('proposalFinalizeA11y')}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <ThemedText variant="buttonSmall" style={styles.finalizeLabel}>
            {t('proposalFinalize')}
          </ThemedText>
        </TouchableOpacity>
      )}

      {/* Bottom row: author left, actions right */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.()
            if (post.creator?.username) router.push(`/user/${post.creator.username}`)
          }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={t('viewProfileA11y', { author: displayName })}
          disabled={!post.creator?.username}
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

          {/* Endorsement button for finalized proposals during endorsement phase */}
          {post.proposalStatus === 'finalized' && onEndorse && (
            <TouchableOpacity
              onPress={(e) => {
                e?.stopPropagation?.()
                if (isEndorsed) {
                  onEndorse(post.id, true)
                } else if (endorseLimitReached) {
                  onEndorseLimitReached?.(post.id)
                } else {
                  onEndorse(post.id, false)
                }
              }}
              activeOpacity={0.7}
              disabled={readOnly}
              accessibilityRole="button"
              accessibilityLabel={isEndorsed ? t('unendorseA11y') : t('endorseA11y')}
              accessibilityState={{ selected: !!isEndorsed }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View style={[styles.endorseButton, isEndorsed && styles.endorseButtonActive]}>
                <Ionicons
                  name={isEndorsed ? 'heart' : 'heart-outline'}
                  size={16}
                  color={isEndorsed ? colors.primary : colors.secondaryText}
                />
                <ThemedText
                  variant="caption"
                  style={{ color: isEndorsed ? colors.primary : colors.secondaryText, fontWeight: isEndorsed ? '600' : '400' }}
                >
                  {isEndorsed ? t('endorsedButton') : t('endorseButton')}
                </ThemedText>
              </View>
            </TouchableOpacity>
          )}

          {/* Hide VoteControl for finalized proposals (use endorsements instead) */}
          {!(post.postType === 'proposal' && post.proposalStatus === 'finalized') && (
            <VoteControl
              size="sm"
              upvoteCount={post.upvoteCount || 0}
              downvoteCount={post.downvoteCount || 0}
              userVote={post.userVote}
              onUpvote={() => onUpvote?.(post.id)}
              onDownvote={() => onDownvote?.(post.id)}
              authorName={displayName}
              targetType="post"
              disabled={isOwnPost || readOnly}
            />
          )}
        </View>
      </View>

      {/* Options modal */}
      <BottomDrawerModal
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        title={t('postOptions')}
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
          {canModerate && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                onPin?.(post.id, !post.isPinned)
                setOptionsVisible(false)
              }}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={post.isPinned ? t('unpinPostA11y') : t('pinPostA11y')}
            >
              <Ionicons
                name={post.isPinned ? 'pin-outline' : 'pin'}
                size={20}
                color={colors.secondaryText}
              />
              <ThemedText variant="body">
                {post.isPinned ? t('unpinPost') : t('pinPost')}
              </ThemedText>
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
    p.isPinned === n.isPinned &&
    p.title === n.title &&
    p.body === n.body &&
    p.updatedTime === n.updatedTime &&
    p.proposalStatus === n.proposalStatus &&
    prev.currentUserId === next.currentUserId &&
    prev.canModerate === next.canModerate &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.votingRoundStatus === next.votingRoundStatus &&
    prev.stage === next.stage
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
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pinnedText: {
    ...Typography.caption,
    color: colors.primary,
    fontWeight: '600',
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
  measuringInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0.5,
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
  endorseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  endorseButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
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
  finalizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primarySurface,
    marginBottom: Spacing.sm,
  },
  finalizeLabel: {
    color: '#FFFFFF',
  },
})

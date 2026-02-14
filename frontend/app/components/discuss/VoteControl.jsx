import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, Typography } from '../../constants/Theme'
import { SemanticColors, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'

/**
 * Reusable vote control with sm (pill) and lg (expanded) variants.
 *
 * @param {Object} props
 * @param {number} props.upvoteCount
 * @param {number} props.downvoteCount
 * @param {{ voteType: 'upvote'|'downvote' }|null} props.userVote
 * @param {Function} props.onUpvote
 * @param {Function} props.onDownvote
 * @param {'sm'|'lg'} [props.size='sm']
 * @param {string} props.authorName - For a11y labels
 * @param {'post'|'comment'} [props.targetType='comment']
 * @param {boolean} [props.disabled=false] - Disables voting (e.g. own content)
 */
export default function VoteControl({
  upvoteCount = 0,
  downvoteCount = 0,
  userVote,
  onUpvote,
  onDownvote,
  size = 'sm',
  authorName = '?',
  targetType = 'comment',
  disabled = false,
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isUpvoted = userVote?.voteType === 'upvote'
  const isDownvoted = userVote?.voteType === 'downvote'

  const upvoteA11yKey = targetType === 'post' ? 'upvotePostA11y' : 'upvoteCommentA11y'
  const downvoteA11yKey = targetType === 'post' ? 'downvotePostA11y' : 'downvoteCommentA11y'

  if (size === 'lg') {
    return (
      <View style={[styles.lgContainer, disabled && styles.disabled]}>
        <TouchableOpacity
          style={styles.lgButton}
          onPress={onUpvote}
          disabled={disabled}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t(upvoteA11yKey, { author: authorName })}
          accessibilityState={{ selected: isUpvoted, disabled }}
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
          style={[styles.lgCount, isUpvoted && styles.lgCountUpvoted]}
        >
          {upvoteCount}
        </ThemedText>

        <TouchableOpacity
          style={styles.lgButton}
          onPress={onDownvote}
          disabled={disabled}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t(downvoteA11yKey, { author: authorName })}
          accessibilityState={{ selected: isDownvoted, disabled }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isDownvoted ? 'chevron-down' : 'chevron-down-outline'}
            size={22}
            color={isDownvoted ? SemanticColors.disagree : colors.secondaryText}
          />
        </TouchableOpacity>

        <ThemedText variant="body" color="secondary" style={styles.lgDownvoteCount}>
          {downvoteCount}
        </ThemedText>
      </View>
    )
  }

  // sm pill
  const netScore = upvoteCount - downvoteCount
  const isActive = isUpvoted || isDownvoted

  return (
    <View style={[
      styles.smPill,
      isUpvoted && styles.smPillUpvoted,
      isDownvoted && styles.smPillDownvoted,
      disabled && styles.disabled,
    ]}>
      <TouchableOpacity
        onPress={onUpvote}
        disabled={disabled}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={t(upvoteA11yKey, { author: authorName })}
        accessibilityState={{ selected: isUpvoted, disabled }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons
          name="chevron-up"
          size={16}
          color={isActive ? OnBrandColors.text : colors.secondaryText}
        />
      </TouchableOpacity>

      <ThemedText
        variant="caption"
        style={[
          styles.smScore,
          isActive && styles.smScoreActive,
        ]}
      >
        {netScore}
      </ThemedText>

      <TouchableOpacity
        onPress={onDownvote}
        disabled={disabled}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={t(downvoteA11yKey, { author: authorName })}
        accessibilityState={{ selected: isDownvoted, disabled }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons
          name="chevron-down"
          size={16}
          color={isActive ? OnBrandColors.text : colors.secondaryText}
        />
      </TouchableOpacity>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  // sm pill
  smPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  smPillUpvoted: {
    backgroundColor: SemanticColors.agree,
    borderColor: SemanticColors.agree,
  },
  smPillDownvoted: {
    backgroundColor: SemanticColors.disagree,
    borderColor: SemanticColors.disagree,
  },
  smScore: {
    ...Typography.caption,
    color: colors.secondaryText,
    minWidth: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  smScoreActive: {
    color: OnBrandColors.text,
  },
  disabled: {
    opacity: 0.4,
  },
  // lg expanded
  lgContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lgButton: {
    padding: 2,
  },
  lgCount: {
    ...Typography.body,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  lgCountUpvoted: {
    color: SemanticColors.agree,
  },
  lgDownvoteCount: {
    marginRight: Spacing.sm,
  },
})

import { useMemo, memo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

/**
 * Badge showing Draft, Final, or Session Topic status for proposal posts.
 *
 * @param {Object} props
 * @param {'draft'|'finalized'} props.status - Proposal status
 * @param {boolean} [props.isSessionTopic] - Show as session topic badge (white on purple card)
 */
export default memo(function ProposalBadge({ status, isSessionTopic }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  if (!status) return null

  const isDraft = status === 'draft'

  if (isSessionTopic) {
    return (
      <View
        style={styles.badgeSessionTopic}
        accessibilityLabel={t('sessionTopicA11y')}
      >
        <Ionicons name="star" size={12} color={colors.primary} />
        <ThemedText variant="caption" style={styles.labelSessionTopic}>
          {t('sessionTopic')}
        </ThemedText>
      </View>
    )
  }

  const label = isDraft ? t('proposalDraft') : t('proposalFinal')
  const icon = isDraft ? 'document-outline' : 'checkmark-circle'
  const iconColor = isDraft ? colors.secondaryText : colors.primary

  return (
    <View
      style={[styles.badge, isDraft ? styles.badgeDraft : styles.badgeFinal]}
      accessibilityLabel={t('proposalBadgeA11y', { status: label })}
    >
      <Ionicons name={icon} size={12} color={iconColor} />
      <ThemedText
        variant="caption"
        style={[styles.label, isDraft ? styles.labelDraft : styles.labelFinal]}
      >
        {label}
      </ThemedText>
    </View>
  )
}, (prev, next) =>
  prev.status === next.status &&
  prev.isSessionTopic === next.isSessionTopic
)

const createStyles = (colors) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeDraft: {
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  badgeFinal: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface + '18',
  },
  badgeSessionTopic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface + '18',
  },
  label: {
    fontWeight: '600',
  },
  labelDraft: {
    color: colors.secondaryText,
  },
  labelFinal: {
    color: colors.primary,
  },
  labelSessionTopic: {
    fontWeight: '600',
    color: colors.primary,
  },
})

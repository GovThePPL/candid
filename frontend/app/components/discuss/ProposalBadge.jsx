import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

/**
 * Badge showing Draft or Final status for proposal posts.
 *
 * @param {Object} props
 * @param {'draft'|'finalized'} props.status - Proposal status
 */
export default function ProposalBadge({ status }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  if (!status) return null

  const isDraft = status === 'draft'
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
}

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
  label: {
    fontWeight: '600',
  },
  labelDraft: {
    color: colors.secondaryText,
  },
  labelFinal: {
    color: colors.primary,
  },
})

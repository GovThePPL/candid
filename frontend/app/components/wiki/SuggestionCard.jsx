import { memo, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import { formatRelativeTime } from '../../lib/timeUtils'

const STATUS_CONFIG = {
  pending: { icon: 'time-outline', colorKey: 'pending' },
  approved: { icon: 'checkmark-circle-outline', colorKey: 'success' },
  denied: { icon: 'close-circle-outline', colorKey: 'warning' },
  withdrawn: { icon: 'arrow-undo-outline', colorKey: 'neutral' },
  superseded: { icon: 'swap-horizontal-outline', colorKey: 'neutral' },
}

const TYPE_KEYS = {
  new_term: 'suggestionNewTerm',
  edit_term: 'suggestionEditTerm',
  new_page: 'suggestionNewPage',
  edit_page: 'suggestionEditPage',
}

/**
 * Card component for suggestion list items.
 *
 * @param {Object} props
 * @param {Object} props.suggestion - Suggestion object from API
 * @param {Function} props.onPress - Called when the card is pressed
 */
export default memo(function SuggestionCard({ suggestion, onPress }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const statusCfg = STATUS_CONFIG[suggestion.status] || STATUS_CONFIG.pending
  const statusColor = SemanticColors[statusCfg.colorKey] || SemanticColors.neutral
  const typeLabel = TYPE_KEYS[suggestion.suggestionType]
    ? t(TYPE_KEYS[suggestion.suggestionType])
    : suggestion.suggestionType

  const statusLabel = t(`suggestionStatus${suggestion.status.charAt(0).toUpperCase() + suggestion.status.slice(1)}`)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel}: ${suggestion.proposedTitle}. ${statusLabel}`}
    >
      <View style={styles.topRow}>
        <View style={styles.typeBadge}>
          <ThemedText variant="caption" color="primary" style={styles.typeText}>
            {typeLabel}
          </ThemedText>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Ionicons name={statusCfg.icon} size={14} color={statusColor} />
          <ThemedText variant="caption" style={{ color: statusColor, fontWeight: '600' }}>
            {statusLabel}
          </ThemedText>
        </View>
      </View>

      <ThemedText variant="h4" numberOfLines={1} style={styles.title}>
        {suggestion.proposedTitle}
      </ThemedText>

      {suggestion.proposedSummary ? (
        <ThemedText variant="bodySmall" color="secondary" numberOfLines={2}>
          {suggestion.proposedSummary}
        </ThemedText>
      ) : null}

      <View style={styles.footer}>
        {suggestion.suggestedBy && (
          <ThemedText variant="caption" color="secondary">
            {t('suggestionBy', {
              author: suggestion.suggestedBy.displayName || suggestion.suggestedBy.username,
            })}
          </ThemedText>
        )}
        {suggestion.createdAt && (
          <ThemedText variant="caption" color="secondary">
            {formatRelativeTime(suggestion.createdAt, t)}
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
  )
})

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    backgroundColor: colors.badgeBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: {
    fontWeight: '600',
    fontSize: 11,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  title: {
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
})

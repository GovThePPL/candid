import { memo, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import { formatRelativeTime } from '../../lib/timeUtils'

/**
 * Card for a single version entry in the history list.
 *
 * @param {Object} props
 * @param {Object} props.version - Version summary from API (id, title, editedBy, editedAt)
 * @param {Function} props.onPress - Called when the card is pressed
 */
export default memo(function VersionCard({ version, onPress }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const authorName = version.editedBy?.displayName || version.editedBy?.username || '?'
  const dateStr = version.editedAt ? formatRelativeTime(version.editedAt, t) : ''

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('historyVersionA11y', { author: authorName, date: dateStr })}
    >
      <View style={styles.row}>
        <Ionicons name="time-outline" size={18} color={colors.secondaryText} />
        <View style={styles.info}>
          <ThemedText variant="body" numberOfLines={1}>
            {version.title}
          </ThemedText>
          <View style={styles.meta}>
            <ThemedText variant="caption" color="secondary">
              {t('historyEditedBy', { author: authorName })}
            </ThemedText>
            <ThemedText variant="caption" color="secondary">
              {dateStr}
            </ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
})

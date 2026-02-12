import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'

export default function PositionRemovedCard({ data, onDismiss }) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { statement, category, location } = data || {}

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer} accessible={false} importantForAccessibility="no-hide-descendants">
        <Ionicons name="remove-circle" size={40} color={SemanticColors.warning} />
      </View>

      <ThemedText variant="h4" color="error" style={styles.title}>{t('positionRemovedTitle')}</ThemedText>
      <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>
        {t('positionRemovedSubtitle')}
      </ThemedText>

      <View style={styles.positionContainer}>
        {(category || location) && (
          <View style={styles.metaRow}>
            {location && <ThemedText variant="caption" color="primary" style={styles.locationCode}>{location}</ThemedText>}
            {category && <ThemedText variant="badgeLg" color="secondary">{category}</ThemedText>}
          </View>
        )}
        <ThemedText variant="button" style={styles.statement}>{statement}</ThemedText>
      </View>

      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('positionRemovedDismiss')}>
        <ThemedText variant="button" color="inverse">{t('positionRemovedDismiss')}</ThemedText>
      </TouchableOpacity>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
  },
  positionContainer: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  locationCode: {
    fontWeight: '700',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statement: {
    fontWeight: '500',
    lineHeight: 22,
  },
  dismissButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
})

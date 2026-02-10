import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'

export default function PositionRemovedCard({ data, onDismiss }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { statement, category, location } = data || {}

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="remove-circle" size={40} color={SemanticColors.warning} />
      </View>

      <Text style={styles.title}>Position Removed</Text>
      <Text style={styles.subtitle}>
        This position was removed for violating community guidelines.
      </Text>

      <View style={styles.positionContainer}>
        {(category || location) && (
          <View style={styles.metaRow}>
            {location && <Text style={styles.locationCode}>{location}</Text>}
            {category && <Text style={styles.categoryName}>{category}</Text>}
          </View>
        )}
        <Text style={styles.statement}>{statement}</Text>
      </View>

      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Text style={styles.dismissButtonText}>Dismiss</Text>
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
    fontSize: 20,
    fontWeight: '700',
    color: SemanticColors.warning,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  statement: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 22,
  },
  dismissButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})

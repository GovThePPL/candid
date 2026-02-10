import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

/**
 * Empty state placeholder with icon, title, and optional subtitle.
 *
 * @param {Object} props
 * @param {string} props.icon - Ionicons icon name
 * @param {string} props.title - Primary message
 * @param {string} [props.subtitle] - Secondary message
 * @param {Object} [props.style] - Additional container style
 */
export default function EmptyState({ icon, title, subtitle, style }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={48} color={colors.placeholderText} accessible={false} importantForAccessibility="no-hide-descendants" />
      <ThemedText variant="body" color="placeholder" style={styles.title} accessibilityRole="header">{title}</ThemedText>
      {subtitle && <ThemedText variant="bodySmall" color="placeholder" style={styles.subtitle}>{subtitle}</ThemedText>}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  title: {
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 8,
  },
})

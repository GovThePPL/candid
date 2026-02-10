import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'

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
      <Ionicons name={icon} size={48} color={colors.placeholderText} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
    fontSize: 15,
    color: colors.placeholderText,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: colors.placeholderText,
    textAlign: 'center',
    marginTop: 8,
  },
})

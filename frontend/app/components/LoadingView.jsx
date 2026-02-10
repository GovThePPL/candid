import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'

/**
 * Loading spinner with optional message text.
 *
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Text shown below spinner
 * @param {Object} [props.style] - Additional container style
 */
export default function LoadingView({ message = 'Loading...', style }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
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
  text: {
    fontSize: 15,
    color: colors.secondaryText,
    marginTop: 12,
  },
})

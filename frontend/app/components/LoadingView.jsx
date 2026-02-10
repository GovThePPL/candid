import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

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
    <View style={[styles.container, style]} accessibilityLiveRegion="polite" accessibilityLabel={message}>
      <ActivityIndicator size="large" color={colors.primary} />
      <ThemedText variant="body" color="secondary" style={styles.text}>{message}</ThemedText>
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
    marginTop: 12,
  },
})

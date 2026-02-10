import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

/**
 * Loading spinner with optional message text.
 *
 * @param {Object} props
 * @param {string} [props.message] - Text shown below spinner (defaults to translated 'Loading...')
 * @param {Object} [props.style] - Additional container style
 */
export default function LoadingView({ message, style }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const displayMessage = message ?? t('loading')
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.container, style]} accessibilityLiveRegion="polite" accessibilityLabel={displayMessage}>
      <ActivityIndicator size="large" color={colors.primary} />
      <ThemedText variant="body" color="secondary" style={styles.text}>{displayMessage}</ThemedText>
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

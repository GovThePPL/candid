import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useThemeColors'

const ThemedView = ({ style, safe = false, ...props }) => {
  const colors = useThemeColors()

  if (!safe) return (
    <View
      style={[{ backgroundColor: colors.background }, style]}
      {...props}
    />
  )

  const insets = useSafeAreaInsets()

  return (
    <View
      style={[{
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }, style]}
      {...props}
    />
  )
}

export default ThemedView

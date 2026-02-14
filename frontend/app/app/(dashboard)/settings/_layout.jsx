import { Stack } from 'expo-router'
import { Platform } from 'react-native'
import { useThemeColors } from '../../../hooks/useThemeColors'

export default function SettingsLayout() {
  const colors = useThemeColors()

  return (
    <Stack
      screenListeners={{
        focus: () => {
          if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        },
      }}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  )
}

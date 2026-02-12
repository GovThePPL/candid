import { Stack } from 'expo-router'
import { Platform } from 'react-native'

export default function SettingsLayout() {
  return (
    <Stack
      screenListeners={{
        focus: () => {
          if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        },
      }}
      screenOptions={{ headerShown: false }}
    />
  )
}

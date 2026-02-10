import { ActivityIndicator } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

import ThemedView from './ThemedView'

const ThemedLoader = () => {
  const colors = useThemeColors()

  return (
    <ThemedView style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center"
    }}>
      <ActivityIndicator size="large" color={colors.text} />
    </ThemedView>
  )
}

export default ThemedLoader

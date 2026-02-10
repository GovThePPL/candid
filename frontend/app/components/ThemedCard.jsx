import { StyleSheet, View } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

const ThemedCard = ({ style, ...props }) => {
  const colors = useThemeColors()

  return (
    <View
      style={[{ backgroundColor: colors.uiBackground}, styles.card, style]}
      {...props}
    />
  )
}

export default ThemedCard

const styles = StyleSheet.create({
  card: {
    borderRadius: 5,
    padding: 20
  }
})

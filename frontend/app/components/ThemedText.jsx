import { Text } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

const ThemedText = ({ style, title = false, ...props }) => {
  const colors = useThemeColors()
  const textColor = title ? colors.title : colors.text

  return (
    <Text
      style={[{ color: textColor }, style]}
      {...props}
    />
  )
}

export default ThemedText

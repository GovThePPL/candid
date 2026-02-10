import { forwardRef } from 'react'
import { TextInput } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

const ThemedTextInput = forwardRef(function ThemedTextInput({ style, ...props }, ref) {
  const colors = useThemeColors()

  return (
    <TextInput
      ref={ref}
      style={[
        {
          backgroundColor: colors.uiBackground,
          color: colors.text,
          padding: 20,
          borderRadius: 6,
        },
        style
      ]}
      placeholderTextColor={colors.placeholderText}
      {...props}
    />
  )
})

export default ThemedTextInput

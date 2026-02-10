import { forwardRef } from 'react'
import { TextInput } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

const ThemedTextInput = forwardRef(function ThemedTextInput({ style, maxFontSizeMultiplier = 1.5, ...props }, ref) {
  const colors = useThemeColors()

  return (
    <TextInput
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
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

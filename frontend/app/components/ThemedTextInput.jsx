import { forwardRef } from 'react'
import { TextInput, useColorScheme } from 'react-native'
import { Colors } from '../constants/Colors'

const ThemedTextInput = forwardRef(function ThemedTextInput({ style, ...props }, ref) {
  const colorScheme = useColorScheme()
  const theme = Colors[colorScheme] ?? Colors.light

  return (
    <TextInput
      ref={ref}
      style={[
        {
          backgroundColor: theme.uiBackground,
          color: theme.text,
          padding: 20,
          borderRadius: 6,
        },
        style
      ]}
      placeholderTextColor={Colors.pass}
      {...props}
    />
  )
})

export default ThemedTextInput

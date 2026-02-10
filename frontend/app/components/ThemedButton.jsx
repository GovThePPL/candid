import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

function ThemedButton({ style, disabled, children, onPress, ...props }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      {...props}
    >
      <View style={styles.content}>
        {typeof children === 'string' ? (
          <Text style={[styles.text, disabled && styles.textDisabled]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  )
}

const createStyles = (colors) => StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 6,
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7
  },
  disabled: {
    backgroundColor: colors.pass,
    opacity: 0.6,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  textDisabled: {
    color: colors.placeholderText,
  },
})

export default ThemedButton

import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

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
          <ThemedText variant="button" color={disabled ? 'placeholder' : 'inverse'}>{children}</ThemedText>
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
})

export default ThemedButton

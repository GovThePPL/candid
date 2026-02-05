import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '../constants/Colors'

function ThemedButton({ style, disabled, children, onPress, ...props }) {
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

const styles = StyleSheet.create({
  btn: {
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.pass,
    opacity: 0.6,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  textDisabled: {
    color: '#ccc',
  },
})

export default ThemedButton
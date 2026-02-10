import { useEffect, useRef, useState, useMemo, createContext, useContext, useCallback } from 'react'
import { StyleSheet, Text, Animated, View } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [message, setMessage] = useState(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timeoutRef = useRef(null)

  const showToast = useCallback((text, duration = 3000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setMessage(text)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()

    timeoutRef.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setMessage(null))
    }, duration)
  }, [opacity])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message && (
        <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.text}>{message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: colors.navBackground,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
})

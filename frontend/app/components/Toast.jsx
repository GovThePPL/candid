import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react'
import { StyleSheet, Text, Animated, View } from 'react-native'
import { Colors } from '../constants/Colors'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
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

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: Colors.darkText,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    maxWidth: '85%',
  },
  text: {
    color: Colors.white,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
})

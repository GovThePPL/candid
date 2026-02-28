import { useRef, useState, useMemo, createContext, useContext, useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [message, setMessage] = useState(null)
  const [position, setPosition] = useState('bottom')
  const opacity = useSharedValue(0)
  const timeoutRef = useRef(null)

  const opacityStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const showToast = useCallback((text, optionsOrDuration) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    let duration = 3000
    let pos = 'bottom'
    if (typeof optionsOrDuration === 'number') {
      duration = optionsOrDuration
    } else if (optionsOrDuration && typeof optionsOrDuration === 'object') {
      duration = optionsOrDuration.duration || 3000
      pos = optionsOrDuration.position || 'bottom'
    }
    setMessage(text)
    setPosition(pos)
    opacity.value = withTiming(1, { duration: 200 })

    timeoutRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(setMessage)(null)
      })
    }, duration)
  }, [opacity])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message && (
        <Animated.View
          style={[
            styles.container,
            position === 'top' ? styles.containerTop : styles.containerBottom,
            opacityStyle,
            { pointerEvents: 'none' },
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.toast}>
            <ThemedText variant="bodySmall" style={styles.text}>{message}</ThemedText>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  containerBottom: {
    bottom: 100,
  },
  containerTop: {
    top: 120,
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
    textAlign: 'center',
  },
})

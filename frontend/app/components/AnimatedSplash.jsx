import { useState, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { SplashScreen } from 'expo-router'
import { BrandColor } from '../constants/Colors'
import { Typography } from '../constants/Theme'

const HOLD_MS = 400
const REVEAL_MS = 600
const PAUSE_MS = 300
const FADEOUT_MS = 500

const fontFamily = Platform.OS === 'web' ? 'Pacifico, cursive' : 'Pacifico_400Regular'

export default function AnimatedSplash({ fontsLoaded, children }) {
  const [visible, setVisible] = useState(true)
  const [cWidth, setCWidth] = useState(0)
  const [fullWidth, setFullWidth] = useState(0)
  const [andidWidth, setAndidWidth] = useState(0)
  const [ready, setReady] = useState(false)

  const rowTranslateX = useSharedValue(0)
  const wipeWidth = useSharedValue(0)
  const textOpacity = useSharedValue(0)
  const overlayOpacity = useSharedValue(1)

  const onMeasureC = useCallback((e) => {
    setCWidth(e.nativeEvent.layout.width)
  }, [])

  const onMeasureFull = useCallback((e) => {
    setFullWidth(e.nativeEvent.layout.width)
  }, [])

  const onMeasureAndid = useCallback((e) => {
    setAndidWidth(e.nativeEvent.layout.width)
  }, [])

  // Start animation once fonts loaded and measurements ready
  useEffect(() => {
    if (!fontsLoaded || !cWidth || !fullWidth || !andidWidth) return
    setReady(true)
  }, [fontsLoaded, cWidth, fullWidth, andidWidth])

  useEffect(() => {
    if (!ready) return

    // Hide native splash now that our overlay is showing
    SplashScreen.hideAsync()

    // When wipeWidth is 0 the row is just "C", auto-centered by the overlay.
    // As the wipe grows the overlay re-centers the wider row, sliding "C" left.
    // At full width the row is "andid " (with space) — shift right by half the
    // space so "Candid" (no space) appears visually centered.
    const spaceExtra = andidWidth - (fullWidth - cWidth)
    rowTranslateX.value = withDelay(
      HOLD_MS,
      withTiming(spaceExtra / 2, { duration: REVEAL_MS })
    )

    // Wipe-reveal "andid" left-to-right by animating clip container width
    // with a simultaneous opacity fade for a soft leading edge
    wipeWidth.value = withDelay(
      HOLD_MS,
      withTiming(andidWidth, { duration: REVEAL_MS })
    )
    textOpacity.value = withDelay(
      HOLD_MS,
      withTiming(1, { duration: REVEAL_MS })
    )

    // Fade out entire overlay after reveal + pause
    const fadeStart = HOLD_MS + REVEAL_MS + PAUSE_MS
    overlayOpacity.value = withDelay(
      fadeStart,
      withTiming(0, { duration: FADEOUT_MS }, (finished) => {
        if (finished) {
          runOnJS(setVisible)(false)
        }
      })
    )
  }, [ready])

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rowTranslateX.value }],
  }))

  const wipeStyle = useAnimatedStyle(() => ({
    width: wipeWidth.value,
    opacity: textOpacity.value,
  }))

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const brandText = {
    ...Typography.brand,
    fontFamily,
    color: '#FFFFFF',
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BrandColor, justifyContent: 'center', alignItems: 'center' },
            overlayStyle,
          ]}
          pointerEvents="none"
        >
          {/* Hidden measurement texts */}
          <Text
            style={[brandText, styles.hidden]}
            onLayout={onMeasureFull}
          >
            Candid
          </Text>
          <Text
            style={[brandText, styles.hidden]}
            onLayout={onMeasureC}
          >
            C
          </Text>
          <Text
            style={[brandText, styles.hidden]}
            onLayout={onMeasureAndid}
          >
            {'andid '}
          </Text>

          {/* Visible animated text — only render after fonts loaded + measured */}
          {ready && (
            <Animated.View style={[styles.textRow, rowStyle]}>
              <Text style={brandText}>C</Text>
              <Animated.View style={[styles.wipeContainer, wipeStyle]}>
                <Text style={[brandText, { width: andidWidth }]}>{'andid '}</Text>
              </Animated.View>
            </Animated.View>
          )}
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    opacity: 0,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 16,
  },
  wipeContainer: {
    overflow: 'hidden',
    paddingBottom: 16,
  },
})

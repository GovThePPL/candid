import { View, AccessibilityInfo, StyleSheet } from 'react-native'
import { useState, useEffect } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'

/**
 * Animated pulse wrapper. Oscillates child opacity between 0.3 and 0.7.
 * Falls back to static 0.5 opacity when reduce-motion is enabled.
 */
export function SkeletonPulse({ children, style }) {
  const { t } = useTranslation()
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const check = async () => {
      const enabled = await AccessibilityInfo.isReduceMotionEnabled()
      setReduceMotion(enabled)
    }
    check()
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub?.remove()
  }, [])

  const opacity = useSharedValue(0.3)

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5
    } else {
      opacity.value = withRepeat(
        withTiming(0.7, { duration: 1200 }),
        -1,
        true,
      )
    }
  }, [reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[style, animatedStyle]}
      accessibilityLabel={t('common:loadingSkeleton')}
      accessibilityRole="none"
    >
      {children}
    </Animated.View>
  )
}

/**
 * Rounded rectangle placeholder.
 */
export function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const colors = useThemeColors()
  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: colors.border },
        style,
      ]}
    />
  )
}

/**
 * Circle placeholder.
 */
export function SkeletonCircle({ size = 40, style }) {
  const colors = useThemeColors()
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.border,
        },
        style,
      ]}
    />
  )
}

/**
 * Text-line placeholder (height=12, borderRadius=6, full width by default).
 */
export function SkeletonLine({ width = '100%', height = 12, style }) {
  const colors = useThemeColors()
  return (
    <View
      style={[
        { width, height, borderRadius: 6, backgroundColor: colors.border },
        style,
      ]}
    />
  )
}

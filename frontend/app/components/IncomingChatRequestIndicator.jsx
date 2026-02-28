import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSequence, interpolateColor } from 'react-native-reanimated'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, G } from 'react-native-svg'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'
import Avatar from './Avatar'
import { playIncomingRequestSound, initNativeSounds } from '../lib/sounds'
import { hapticTap } from '../lib/haptics'

const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000
const REMINDER_INTERVAL_MS = 15 * 1000

const INDICATOR_SIZE = 40
const AVATAR_SIZE = INDICATOR_SIZE
const STROKE_WIDTH = 3
const RADIUS = (INDICATOR_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * Incoming chat request indicator shown in the header bar.
 * Displays the requester's avatar, name, and a countdown ring.
 * Tapping navigates to the cards page to handle the request.
 *
 * Plays sound + haptic on mount and every 15 seconds as a reminder.
 *
 * @param {Object} incomingRequest - The incoming chat request card data ({ type, data: { id, requester, createdTime, ... } })
 * @param {Function} onExpire - Called when the countdown reaches zero
 */
export default function IncomingChatRequestIndicator({ incomingRequest, onExpire }) {
  const { t } = useTranslation()
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const progress = useSharedValue(0)
  const flash = useSharedValue(0)
  const scale = useSharedValue(1)
  const reminderRef = useRef(null)

  const createdTime = incomingRequest?.data?.createdTime
  const requester = incomingRequest?.data?.requester
  const expiresAt = createdTime ? new Date(createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS : 0

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value * CIRCUMFERENCE,
  }))

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(flash.value, [0, 1], [colors.primary, '#FFFFFF']),
  }), [colors.primary])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const triggerAlert = useCallback(() => {
    playIncomingRequestSound()
    hapticTap()
    scale.value = withSequence(
      withTiming(1.05, { duration: 200 }),
      withTiming(1, { duration: 200 }),
    )
    flash.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 200 }),
    )
  }, [scale, flash])

  // Initialize remaining seconds and progress
  useEffect(() => {
    if (!createdTime) return
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
    setRemainingSeconds(remaining)

    const totalDuration = CHAT_REQUEST_TIMEOUT_MS / 1000
    const elapsed = (now - new Date(createdTime).getTime()) / 1000
    progress.value = Math.min(1, Math.max(0, elapsed / totalDuration))
  }, [createdTime])

  // Initial alert + native sound init
  useEffect(() => {
    if (!incomingRequest) return
    if (Platform.OS !== 'web') initNativeSounds()
    triggerAlert()
  }, [incomingRequest?.data?.id])

  // 15-second reminder interval
  useEffect(() => {
    if (!incomingRequest) return

    reminderRef.current = setInterval(() => {
      triggerAlert()
    }, REMINDER_INTERVAL_MS)

    return () => {
      if (reminderRef.current) clearInterval(reminderRef.current)
    }
  }, [incomingRequest?.data?.id])

  // Countdown timer
  useEffect(() => {
    if (remainingSeconds <= 0) return

    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          onExpire?.()
          return 0
        }
        return next
      })

      // Update progress ring
      if (createdTime) {
        const totalDuration = CHAT_REQUEST_TIMEOUT_MS / 1000
        const now = Date.now()
        const elapsed = (now - new Date(createdTime).getTime()) / 1000
        const newProgress = Math.min(1, Math.max(0, elapsed / totalDuration))

        progress.value = withTiming(newProgress, { duration: 1000 })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [remainingSeconds, createdTime, onExpire])

  if (!incomingRequest || !requester) return null

  const handlePress = () => {
    router.push('/cards')
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={styles.touchable}
      accessibilityRole="button"
      accessibilityLabel={t('incomingChatRequestLabel', { name: requester.displayName || 'user', seconds: remainingSeconds })}
      accessibilityHint={t('viewChatRequestHint')}
    >
      <Animated.View style={[styles.wrapper, borderStyle, scaleStyle]}>
        {/* Requester avatar */}
        <Avatar user={requester} size={AVATAR_SIZE} showKudosBadge showKudosCount />

        {/* Requester name */}
        <View style={styles.nameContainer}>
          <ThemedText variant="caption" style={styles.displayName} numberOfLines={1}>{requester.displayName}</ThemedText>
          <ThemedText variant="badge" color="secondary" style={styles.username} numberOfLines={1}>@{requester.username}</ThemedText>
        </View>

        {/* Countdown bubble */}
        <View style={styles.bubble}>
          <Svg width={INDICATOR_SIZE} height={INDICATOR_SIZE} style={styles.svgContainer}>
            <G transform={`translate(${INDICATOR_SIZE}, 0) scale(-1, 1)`}>
              {/* Track circle */}
              <Circle
                cx={INDICATOR_SIZE / 2}
                cy={INDICATOR_SIZE / 2}
                r={RADIUS}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
              />
              {/* Progress circle */}
              <AnimatedCircle
                cx={INDICATOR_SIZE / 2}
                cy={INDICATOR_SIZE / 2}
                r={RADIUS}
                stroke="#FFFFFF"
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={CIRCUMFERENCE}
                animatedProps={circleProps}
                strokeLinecap="round"
                rotation="-90"
                origin={`${INDICATOR_SIZE / 2}, ${INDICATOR_SIZE / 2}`}
              />
            </G>
          </Svg>

          <View style={styles.bubbleCenter}>
            <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  )
}

const createStyles = (colors) => StyleSheet.create({
  touchable: {
    maxWidth: '100%',
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 5,
    overflow: 'hidden',
  },
  nameContainer: {
    flexShrink: 1,
  },
  displayName: {
    fontWeight: '600',
  },
  username: {
    fontWeight: '400',
  },
  bubble: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  svgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  bubbleCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
})

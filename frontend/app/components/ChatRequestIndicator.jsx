import { StyleSheet, View, TouchableOpacity, Pressable, Modal } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSequence, interpolateColor } from 'react-native-reanimated'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, G } from 'react-native-svg'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import { createSharedStyles } from '../constants/SharedStyles'
import ThemedText from './ThemedText'
import CardShell from './CardShell'
import PositionInfoCard from './PositionInfoCard'

const INDICATOR_SIZE = 32
const AVATAR_SIZE = INDICATOR_SIZE
const STROKE_WIDTH = 3
const RADIUS = (INDICATOR_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

import Avatar from './Avatar'

/**
 * Chat request indicator shown centered in the header bar.
 * Displays the other user's avatar, name, and a countdown ring bubble
 * inside a dark purple oval. Tapping anywhere opens a cancel confirmation.
 *
 * @param {Object} pendingRequest - The pending chat request data
 * @param {Function} onTimeout - Called when countdown reaches zero
 * @param {Function} onCancel - Called when user confirms cancellation
 */
export default function ChatRequestIndicator({ pendingRequest, onTimeout, onCancel }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const progress = useSharedValue(0)
  const colorAnim = useSharedValue(0)
  const scale = useSharedValue(1)

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value * CIRCUMFERENCE,
  }))

  const bubbleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(colorAnim.value, [0, 1], [colors.primarySurface, SemanticColors.disagree]),
  }), [colors.primarySurface])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  // Calculate total duration and remaining time
  useEffect(() => {
    if (!pendingRequest?.expiresAt) return

    const expiresAt = new Date(pendingRequest.expiresAt).getTime()
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
    setRemainingSeconds(remaining)

    const createdTime = new Date(pendingRequest.createdTime).getTime()
    const totalDuration = (expiresAt - createdTime) / 1000
    const elapsed = (now - createdTime) / 1000
    progress.value = Math.min(1, Math.max(0, elapsed / totalDuration))
  }, [pendingRequest])

  // Countdown timer
  useEffect(() => {
    if (remainingSeconds <= 0 || pendingRequest?.status !== 'pending') return

    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          onTimeout?.()
          return 0
        }
        return next
      })

      if (pendingRequest?.expiresAt && pendingRequest?.createdTime) {
        const expiresAt = new Date(pendingRequest.expiresAt).getTime()
        const createdTime = new Date(pendingRequest.createdTime).getTime()
        const totalDuration = (expiresAt - createdTime) / 1000
        const now = Date.now()
        const elapsed = (now - createdTime) / 1000
        const newProgress = Math.min(1, Math.max(0, elapsed / totalDuration))

        progress.value = withTiming(newProgress, { duration: 1000 })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [remainingSeconds, pendingRequest, onTimeout])

  // Handle status changes (accepted/declined)
  useEffect(() => {
    if (pendingRequest?.status === 'declined') {
      colorAnim.value = withTiming(1, { duration: 300 })
      scale.value = withSequence(
        withTiming(1.2, { duration: 150 }),
        withTiming(1, { duration: 150 }),
      )
    } else if (pendingRequest?.status === 'accepted') {
      scale.value = withSequence(
        withTiming(1.2, { duration: 150 }),
        withTiming(0, { duration: 200 }),
      )
    }
  }, [pendingRequest?.status])

  const handlePress = () => {
    if (pendingRequest?.status === 'pending') {
      setShowCancelModal(true)
    }
  }

  const handleConfirmCancel = () => {
    setShowCancelModal(false)
    onCancel?.()
  }

  if (!pendingRequest) return null

  const isDeclined = pendingRequest.status === 'declined'
  const author = pendingRequest.author

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel={isDeclined
          ? t('chatRequestDeclinedLabel', { name: author?.displayName || 'user' })
          : t('chatRequestPendingLabel', { name: author?.displayName || 'user', seconds: remainingSeconds })}
        accessibilityHint={isDeclined ? undefined : t('cancelChatHint')}
      >
        <Animated.View style={[styles.wrapper, scaleStyle]}>
          {/* Author avatar */}
          <Avatar user={author} size={AVATAR_SIZE} showKudosBadge showKudosCount />

          {/* Author name */}
          {author && (
            <View style={styles.nameContainer}>
              <ThemedText variant="caption" style={styles.displayName} numberOfLines={1}>{author.displayName}</ThemedText>
              <ThemedText variant="badge" color="secondary" style={styles.username} numberOfLines={1}>@{author.username}</ThemedText>
            </View>
          )}

          {/* Countdown bubble */}
          <Animated.View
            style={[
              styles.bubble,
              bubbleStyle,
            ]}
          >
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
                {/* Progress circle - purple showing time remaining */}
                {!isDeclined && (
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
                )}
              </G>
            </Svg>

            <View style={styles.bubbleCenter}>
              {isDeclined ? (
                <Ionicons name="close" size={16} color="#fff" />
              ) : (
                <Ionicons name="chatbubble" size={13} color="#fff" />
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>

      {/* Cancel confirmation modal */}
      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <Pressable style={shared.modalOverlay} onPress={() => setShowCancelModal(false)} accessibilityLabel={t('dismissModal')}>
          <Pressable style={shared.modalContent} onPress={e => e.stopPropagation()} accessible={false}>
            {/* Card in stats page style: white on purple */}
            <CardShell
              style={styles.cardOuter}
              bottomSection={
                <View style={styles.pendingRow}>
                  <Ionicons name="chatbubble" size={14} color="#FFFFFF" />
                  <ThemedText variant="label" color="inverse">{t('chatRequestPending')}</ThemedText>
                </View>
              }
              bottomStyle={styles.cardPurpleBottom}
            >
              <PositionInfoCard
                position={{
                  statement: pendingRequest.positionStatement,
                  session: pendingRequest.session,
                  location: pendingRequest.location,
                  creator: author,
                }}
                authorSubtitle="username"
              />
            </CardShell>

            <ThemedText variant="h3" style={styles.modalQuestion}>{t('cancelChatRequestPrompt')}</ThemedText>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.keepButton}
                onPress={() => setShowCancelModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('keepWaiting')}
              >
                <ThemedText variant="buttonSmall" color="inverse">{t('keepWaiting')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleConfirmCancel}
                accessibilityRole="button"
                accessibilityLabel={t('cancelRequest')}
              >
                <ThemedText variant="buttonSmall" color="disagree">{t('cancelRequest')}</ThemedText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
    paddingVertical: 2,
    paddingLeft: 2,
    paddingRight: 4,
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
  // White-on-purple card (stats page pattern)
  cardOuter: {
    marginBottom: 16,
  },
  cardPurpleBottom: {
    padding: 12,
    paddingHorizontal: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalQuestion: {
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  keepButton: {
    flex: 1,
    backgroundColor: colors.primarySurface,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: SemanticColors.disagree + '15',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SemanticColors.disagree + '40',
  },
})

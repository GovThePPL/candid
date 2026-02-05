import { StyleSheet, View, Text, TouchableOpacity, Animated, Platform, Modal, Image } from 'react-native'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'
import { Colors } from '../constants/Colors'
import CardShell from './CardShell'
import PositionInfoCard from './PositionInfoCard'

const INDICATOR_SIZE = 40
const AVATAR_SIZE = INDICATOR_SIZE
const STROKE_WIDTH = 3
const RADIUS = (INDICATOR_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Animated Circle component for progress
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

import { getInitials, getInitialsColor, getTrustBadgeColor, getAvatarImageUrl } from '../lib/avatarUtils'

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
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const progressAnim = useRef(new Animated.Value(0)).current
  const colorAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(1)).current

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
    const initialProgress = Math.min(1, Math.max(0, elapsed / totalDuration))
    progressAnim.setValue(initialProgress)
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
        const progress = Math.min(1, Math.max(0, elapsed / totalDuration))

        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 1000,
          useNativeDriver: false,
        }).start()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [remainingSeconds, pendingRequest, onTimeout])

  // Handle status changes (accepted/declined)
  useEffect(() => {
    if (pendingRequest?.status === 'declined') {
      Animated.parallel([
        Animated.timing(colorAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      ]).start()
    } else if (pendingRequest?.status === 'accepted') {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
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
  const author = pendingRequest.creator
  const avatarUrl = author?.avatarIconUrl || author?.avatarUrl

  const bubbleBackground = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.chat, Colors.disagree],
  })

  // Inverted: strokeDashoffset starts at CIRCUMFERENCE (full ring) and decreases to 0 (empty)
  // So purple ring shows how much time is LEFT
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  })

  return (
    <>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
          {/* Author avatar */}
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: getAvatarImageUrl(avatarUrl) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: getInitialsColor(author?.displayName) }]}>
                <Text style={styles.avatarInitial}>{getInitials(author?.displayName)}</Text>
              </View>
            )}
            {author?.kudosCount > 0 && (
              <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(author.trustScore) }]}>
                <Ionicons name="star" size={8} color={Colors.primary} />
              </View>
            )}
          </View>

          {/* Author name */}
          {author && (
            <View style={styles.nameContainer}>
              <Text style={styles.displayName} numberOfLines={1}>{author.displayName}</Text>
              <Text style={styles.username} numberOfLines={1}>@{author.username}</Text>
            </View>
          )}

          {/* Countdown bubble */}
          <Animated.View
            style={[
              styles.bubble,
              { backgroundColor: bubbleBackground },
            ]}
          >
            <Svg width={INDICATOR_SIZE} height={INDICATOR_SIZE} style={styles.svgContainer}>
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
                  stroke={Colors.primary}
                  strokeWidth={STROKE_WIDTH}
                  fill="transparent"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${INDICATOR_SIZE / 2}, ${INDICATOR_SIZE / 2}`}
                />
              )}
            </Svg>

            <View style={styles.bubbleCenter}>
              {isDeclined ? (
                <Ionicons name="close" size={20} color="#fff" />
              ) : (
                <Ionicons name="chatbubble" size={16} color="#fff" />
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>

      {/* Cancel confirmation modal */}
      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCancelModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            {/* Card in stats page style: white on purple */}
            <CardShell
              style={styles.cardOuter}
              bottomSection={
                <View style={styles.pendingRow}>
                  <Ionicons name="chatbubble" size={14} color="#FFFFFF" />
                  <Text style={styles.pendingText}>Chat request pending</Text>
                </View>
              }
              bottomStyle={styles.cardPurpleBottom}
            >
              <PositionInfoCard
                position={{
                  statement: pendingRequest.positionStatement,
                  category: pendingRequest.category,
                  location: pendingRequest.location,
                  creator: author,
                }}
                authorSubtitle="username"
              />
            </CardShell>

            <Text style={styles.modalQuestion}>Cancel this chat request?</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.keepButton} onPress={() => setShowCancelModal(false)}>
                <Text style={styles.keepButtonText}>Keep Waiting</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={handleConfirmCancel}>
                <Text style={styles.cancelButtonText}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 5,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  nameContainer: {
    flexShrink: 1,
    maxWidth: 100,
  },
  displayName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.text,
  },
  username: {
    fontSize: 10,
    color: Colors.pass,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
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
  pendingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  keepButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  keepButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.disagree + '15',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.disagree + '40',
  },
  cancelButtonText: {
    color: Colors.disagree,
    fontSize: 14,
    fontWeight: '600',
  },
})

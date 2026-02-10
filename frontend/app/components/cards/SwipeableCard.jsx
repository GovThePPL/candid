import { StyleSheet, Dimensions, View, Animated, PanResponder, Platform } from 'react-native'
import { useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import { Ionicons } from '@expo/vector-icons'
import ThemedText from '../ThemedText'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const SWIPE_THRESHOLD = 60
const VERTICAL_THRESHOLD = 50

// Swipe directions and their meanings:
// Right = Agree (green)
// Left = Disagree (red)
// Down = Pass (gray)
// Up = Chat Request (yellow)

const SwipeableCard = forwardRef(function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  onSwipeUp,
  onSwipeDown,
  enableVerticalSwipe = true,
  isBackCard = false,
  backCardAnimatedValue,
  // When true, right swipe uses chat styling (yellow/chat bubble) instead of agree styling
  rightSwipeAsChatAccept = false,
  // When true, right swipe shows "Submit" text instead of checkmark (for surveys/demographics)
  rightSwipeAsSubmit = false,
  // When true, right swipe shows star icon with gold styling (for kudos)
  rightSwipeAsKudos = false,
  // When true, left swipe shows Pass overlay (gray) instead of Disagree (red/X)
  leftSwipeAsPass = false,
  // Custom label for right swipe text overlay (only used when rightSwipeAsSubmit is true)
  rightSwipeLabel,
  // Custom label for left/down pass text overlay (only used when leftSwipeAsPass is true)
  leftSwipeLabel,
}, ref) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const position = useRef(new Animated.ValueXY()).current

  // Refs to track swipe style/handler props for pan responder access
  const rightSwipeAsChatAcceptRef = useRef(rightSwipeAsChatAccept)
  rightSwipeAsChatAcceptRef.current = rightSwipeAsChatAccept
  const rightSwipeAsSubmitRef = useRef(rightSwipeAsSubmit)
  rightSwipeAsSubmitRef.current = rightSwipeAsSubmit
  const rightSwipeAsKudosRef = useRef(rightSwipeAsKudos)
  rightSwipeAsKudosRef.current = rightSwipeAsKudos
  const leftSwipeAsPassRef = useRef(leftSwipeAsPass)
  leftSwipeAsPassRef.current = leftSwipeAsPass
  const onSwipeUpRef = useRef(onSwipeUp)
  onSwipeUpRef.current = onSwipeUp

  // Separate animated values for each color overlay
  const greenOverlay = useRef(new Animated.Value(0)).current
  const redOverlay = useRef(new Animated.Value(0)).current
  const grayOverlay = useRef(new Animated.Value(0)).current
  const yellowOverlay = useRef(new Animated.Value(0)).current

  // Icon/text overlay animations
  const checkIconOpacity = useRef(new Animated.Value(0)).current
  const checkIconScale = useRef(new Animated.Value(0.5)).current
  const xIconOpacity = useRef(new Animated.Value(0)).current
  const xIconScale = useRef(new Animated.Value(0.5)).current
  const passTextOpacity = useRef(new Animated.Value(0)).current
  const passTextScale = useRef(new Animated.Value(0.5)).current
  const chatIconOpacity = useRef(new Animated.Value(0)).current
  const chatIconScale = useRef(new Animated.Value(0.5)).current
  const plusIconOpacity = useRef(new Animated.Value(0)).current
  const plusIconScale = useRef(new Animated.Value(0.5)).current
  const submitTextOpacity = useRef(new Animated.Value(0)).current
  const submitTextScale = useRef(new Animated.Value(0.5)).current
  const starIconOpacity = useRef(new Animated.Value(0)).current
  const starIconScale = useRef(new Animated.Value(0.5)).current
  const goldOverlay = useRef(new Animated.Value(0)).current

  const resetPosition = useCallback(() => {
    Animated.parallel([
      Animated.spring(position, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        friction: 6,
        tension: 100,
      }),
      Animated.timing(greenOverlay, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(redOverlay, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(grayOverlay, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(yellowOverlay, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(goldOverlay, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(checkIconOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(xIconOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(passTextOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(chatIconOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(starIconOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start()
  }, [position, greenOverlay, redOverlay, grayOverlay, yellowOverlay, goldOverlay, checkIconOpacity, xIconOpacity, passTextOpacity, chatIconOpacity, starIconOpacity])

  const swipeOffScreen = useCallback((direction) => {
    // Call handler first to check if swipe should proceed
    let result
    switch (direction) {
      case 'right': result = onSwipeRight?.(); break
      case 'left': result = onSwipeLeft?.(); break
      case 'up': result = onSwipeUpRef.current?.(); break
      case 'down': result = onSwipeDown?.(); break
    }

    // If handler returns false, reset position instead of swiping off
    if (result === false) {
      resetPosition()
      return
    }

    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 :
              direction === 'left' ? -SCREEN_WIDTH * 1.5 : 0
    const y = direction === 'up' ? -SCREEN_HEIGHT :
              direction === 'down' ? SCREEN_HEIGHT : 0

    Animated.timing(position, {
      toValue: { x, y },
      duration: 250,
      useNativeDriver: false,
    }).start()
  }, [position, onSwipeRight, onSwipeLeft, onSwipeUp, onSwipeDown, resetPosition])

  // Expose swipe methods for keyboard control (with color overlay animation)
  useImperativeHandle(ref, () => ({
    swipeRight: () => {
      if (rightSwipeAsChatAccept) {
        // Use chat styling (yellow/chat bubble) for chat request accept
        Animated.parallel([
          Animated.timing(yellowOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(chatIconOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(chatIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('right')
        })
      } else if (rightSwipeAsSubmit) {
        // Submit styling (green/"Submit" text) for surveys/demographics
        Animated.parallel([
          Animated.timing(greenOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(submitTextOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(submitTextScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('right')
        })
      } else if (rightSwipeAsKudos) {
        // Kudos styling (gold/star) for kudos cards
        Animated.parallel([
          Animated.timing(goldOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(starIconOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(starIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('right')
        })
      } else {
        // Normal agree styling (green/checkmark)
        Animated.parallel([
          Animated.timing(greenOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(checkIconOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(checkIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('right')
        })
      }
    },
    swipeLeft: () => {
      if (leftSwipeAsPass) {
        Animated.parallel([
          Animated.timing(grayOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(passTextOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(passTextScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('left')
        })
      } else {
        Animated.parallel([
          Animated.timing(redOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
          Animated.timing(xIconOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.spring(xIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
        ]).start(() => {
          swipeOffScreen('left')
        })
      }
    },
    swipeUp: () => {
      Animated.parallel([
        Animated.timing(yellowOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
        Animated.timing(chatIconOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
        Animated.spring(chatIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
      ]).start(() => {
        swipeOffScreen('up')
      })
    },
    swipeDown: () => {
      Animated.parallel([
        Animated.timing(grayOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }),
        Animated.timing(passTextOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
        Animated.spring(passTextScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
      ]).start(() => {
        swipeOffScreen('down')
      })
    },
    swipeRightWithPlus: () => {
      // Animate green overlay and plus icon together, then swipe off
      Animated.parallel([
        Animated.timing(greenOverlay, { toValue: 0.4, duration: 200, useNativeDriver: false }),
        Animated.timing(plusIconOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.spring(plusIconScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: false }),
      ]).start(() => {
        swipeOffScreen('right')
      })
    },
  }), [swipeOffScreen, greenOverlay, redOverlay, yellowOverlay, grayOverlay, goldOverlay, checkIconOpacity, checkIconScale, xIconOpacity, xIconScale, passTextOpacity, passTextScale, chatIconOpacity, chatIconScale, plusIconOpacity, plusIconScale, submitTextOpacity, submitTextScale, starIconOpacity, starIconScale, rightSwipeAsChatAccept, rightSwipeAsSubmit, rightSwipeAsKudos, leftSwipeAsPass])

  const panResponder = useRef(
    PanResponder.create({
      // Capture touch/mouse immediately to prevent text selection
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        // Stop any ongoing animation when starting a new gesture
        position.stopAnimation()
      },
      onPanResponderMove: (_, gesture) => {
        // Only allow vertical movement if there's a handler for that direction
        const canSwipeUp = enableVerticalSwipe && onSwipeUpRef.current
        const canSwipeDown = enableVerticalSwipe && onSwipeDown
        const canSwipeVertically = canSwipeUp || canSwipeDown

        // Constrain vertical movement based on available handlers
        let dy = 0
        if (canSwipeVertically) {
          if (gesture.dy < 0 && canSwipeUp) {
            dy = gesture.dy
          } else if (gesture.dy > 0 && canSwipeDown) {
            dy = gesture.dy
          }
        }

        // Constrain horizontal movement based on available handlers
        let dx = gesture.dx
        if (gesture.dx < 0 && !onSwipeLeft) {
          dx = 0 // Don't allow left swipe if no handler
        }

        position.setValue({ x: dx, y: dy })

        // Calculate overlay intensities based on swipe direction
        const horizontalProgress = Math.min(Math.abs(gesture.dx) / SWIPE_THRESHOLD, 1)
        const verticalProgress = Math.min(Math.abs(gesture.dy) / VERTICAL_THRESHOLD, 1)
        const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy)

        // Reset all overlays and icons first
        greenOverlay.setValue(0)
        redOverlay.setValue(0)
        grayOverlay.setValue(0)
        yellowOverlay.setValue(0)
        checkIconOpacity.setValue(0)
        checkIconScale.setValue(0.5)
        xIconOpacity.setValue(0)
        xIconScale.setValue(0.5)
        passTextOpacity.setValue(0)
        passTextScale.setValue(0.5)
        chatIconOpacity.setValue(0)
        chatIconScale.setValue(0.5)
        submitTextOpacity.setValue(0)
        submitTextScale.setValue(0.5)
        starIconOpacity.setValue(0)
        starIconScale.setValue(0.5)
        goldOverlay.setValue(0)

        if (isHorizontal) {
          if (gesture.dx > 0) {
            // Use chat styling for right swipe when rightSwipeAsChatAccept is true
            if (rightSwipeAsChatAcceptRef.current) {
              yellowOverlay.setValue(horizontalProgress * 0.4)
              chatIconOpacity.setValue(horizontalProgress)
              chatIconScale.setValue(0.5 + horizontalProgress * 0.5)
            } else if (rightSwipeAsSubmitRef.current) {
              // Use submit styling (green/"Submit" text) for surveys/demographics
              greenOverlay.setValue(horizontalProgress * 0.4)
              submitTextOpacity.setValue(horizontalProgress)
              submitTextScale.setValue(0.5 + horizontalProgress * 0.5)
            } else if (rightSwipeAsKudosRef.current) {
              // Use kudos styling (gold/star) for kudos cards
              goldOverlay.setValue(horizontalProgress * 0.4)
              starIconOpacity.setValue(horizontalProgress)
              starIconScale.setValue(0.5 + horizontalProgress * 0.5)
            } else {
              greenOverlay.setValue(horizontalProgress * 0.4)
              checkIconOpacity.setValue(horizontalProgress)
              checkIconScale.setValue(0.5 + horizontalProgress * 0.5)
            }
          } else if (onSwipeLeft) {
            if (leftSwipeAsPassRef.current) {
              // Pass styling for left swipe on non-position cards
              grayOverlay.setValue(horizontalProgress * 0.4)
              passTextOpacity.setValue(horizontalProgress)
              passTextScale.setValue(0.5 + horizontalProgress * 0.5)
            } else {
              // Disagree styling (red/X) for position cards
              redOverlay.setValue(horizontalProgress * 0.4)
              xIconOpacity.setValue(horizontalProgress)
              xIconScale.setValue(0.5 + horizontalProgress * 0.5)
            }
          }
        } else if (canSwipeVertically) {
          if (gesture.dy > 0 && canSwipeDown) {
            grayOverlay.setValue(verticalProgress * 0.4)
            passTextOpacity.setValue(verticalProgress)
            passTextScale.setValue(0.5 + verticalProgress * 0.5)
          } else if (gesture.dy < 0 && canSwipeUp) {
            yellowOverlay.setValue(verticalProgress * 0.4)
            chatIconOpacity.setValue(verticalProgress)
            chatIconScale.setValue(0.5 + verticalProgress * 0.5)
          }
        }
        // Note: Don't animate back card during drag - only on release
      },
      onPanResponderRelease: (_, gesture) => {
        const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy)
        const canSwipeUp = enableVerticalSwipe && onSwipeUpRef.current
        const canSwipeDown = enableVerticalSwipe && onSwipeDown

        if (isHorizontal) {
          if (gesture.dx > SWIPE_THRESHOLD) {
            swipeOffScreen('right')
          } else if (gesture.dx < -SWIPE_THRESHOLD && onSwipeLeft) {
            swipeOffScreen('left')
          } else {
            resetPosition()
          }
        } else if (canSwipeUp || canSwipeDown) {
          if (gesture.dy < -VERTICAL_THRESHOLD && canSwipeUp) {
            swipeOffScreen('up')
          } else if (gesture.dy > VERTICAL_THRESHOLD && canSwipeDown) {
            swipeOffScreen('down')
          } else {
            resetPosition()
          }
        } else {
          resetPosition()
        }
      },
      onPanResponderTerminate: () => {
        resetPosition()
      },
    })
  ).current

  const cardStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      {
        rotate: position.x.interpolate({
          inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
          outputRange: ['-12deg', '0deg', '12deg'],
        }),
      },
    ],
  }

  // Back card - just render the content without gesture handling
  if (isBackCard) {
    return (
      <View style={styles.backCardContainer}>
        <View style={styles.cardContent}>
          {children}
        </View>
      </View>
    )
  }

  return (
    <Animated.View style={[styles.container, cardStyle]} {...panResponder.panHandlers}>
      <View style={styles.cardContent}>
        {children}
      </View>
      {/* Green overlay for right swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: SemanticColors.agree, opacity: greenOverlay }]}
        pointerEvents="none"
      />
      {/* Red overlay for left swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: SemanticColors.disagree, opacity: redOverlay }]}
        pointerEvents="none"
      />
      {/* Gray overlay for down swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: colors.pass, opacity: grayOverlay }]}
        pointerEvents="none"
      />
      {/* Yellow overlay for up swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: colors.chat, opacity: yellowOverlay }]}
        pointerEvents="none"
      />
      {/* Checkmark icon overlay for right swipe (agree) */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: checkIconOpacity, transform: [{ scale: checkIconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="checkmark" size={120} color="#fff" />
      </Animated.View>
      {/* X icon overlay for left swipe (disagree) */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: xIconOpacity, transform: [{ scale: xIconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="close" size={120} color="#fff" />
      </Animated.View>
      {/* Pass text overlay for down swipe */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: passTextOpacity, transform: [{ scale: passTextScale }] }]}
        pointerEvents="none"
      >
        <ThemedText variant="overlay" color="inverse">{leftSwipeLabel || 'Pass'}</ThemedText>
      </Animated.View>
      {/* Chat icon overlay for up swipe */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: chatIconOpacity, transform: [{ scale: chatIconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="chatbubble" size={100} color="#fff" />
      </Animated.View>
      {/* Plus icon overlay for adopt */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: plusIconOpacity, transform: [{ scale: plusIconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="add" size={120} color="#fff" />
      </Animated.View>
      {/* Submit text overlay for surveys/demographics */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: submitTextOpacity, transform: [{ scale: submitTextScale }] }]}
        pointerEvents="none"
      >
        <ThemedText variant="overlay" color="inverse">{rightSwipeLabel || 'Submit'}</ThemedText>
      </Animated.View>
      {/* Gold overlay for kudos */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: '#FFD700', opacity: goldOverlay }]}
        pointerEvents="none"
      />
      {/* Star icon overlay for kudos */}
      <Animated.View
        style={[styles.iconOverlay, { opacity: starIconOpacity, transform: [{ scale: starIconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="star" size={120} color="#fff" />
      </Animated.View>
    </Animated.View>
  )
})

export default SwipeableCard

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    // Prevent text selection during drag on web
    ...(Platform.OS === 'web' && { userSelect: 'none', cursor: 'grab' }),
  },
  backCardContainer: {
    flex: 1,
    width: '100%',
  },
  cardContent: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    // Drop shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
    }),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  iconOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

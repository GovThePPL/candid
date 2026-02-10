import { StyleSheet, Dimensions, View, Platform } from 'react-native'
import { useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
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
  // Accessibility
  accessibilityLabel,
  accessibilityHint,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Position shared values
  const posX = useSharedValue(0)
  const posY = useSharedValue(0)

  // Color overlay opacities
  const greenOverlay = useSharedValue(0)
  const redOverlay = useSharedValue(0)
  const grayOverlay = useSharedValue(0)
  const yellowOverlay = useSharedValue(0)
  const goldOverlay = useSharedValue(0)

  // Icon/text overlay opacity + scale
  const checkO = useSharedValue(0)
  const checkS = useSharedValue(0.5)
  const xO = useSharedValue(0)
  const xS = useSharedValue(0.5)
  const passO = useSharedValue(0)
  const passS = useSharedValue(0.5)
  const chatO = useSharedValue(0)
  const chatS = useSharedValue(0.5)
  const plusO = useSharedValue(0)
  const plusS = useSharedValue(0.5)
  const submitO = useSharedValue(0)
  const submitS = useSharedValue(0.5)
  const starO = useSharedValue(0)
  const starS = useSharedValue(0.5)

  // Boolean flags as shared values for worklet access (synced each render)
  const flagChatAccept = useSharedValue(0)
  const flagSubmit = useSharedValue(0)
  const flagKudos = useSharedValue(0)
  const flagPassLeft = useSharedValue(0)
  const flagVertical = useSharedValue(0)
  const hasUp = useSharedValue(0)
  const hasLeft = useSharedValue(0)
  const hasDown = useSharedValue(0)
  flagChatAccept.value = rightSwipeAsChatAccept ? 1 : 0
  flagSubmit.value = rightSwipeAsSubmit ? 1 : 0
  flagKudos.value = rightSwipeAsKudos ? 1 : 0
  flagPassLeft.value = leftSwipeAsPass ? 1 : 0
  flagVertical.value = enableVerticalSwipe ? 1 : 0
  hasUp.value = onSwipeUp ? 1 : 0
  hasLeft.value = onSwipeLeft ? 1 : 0
  hasDown.value = onSwipeDown ? 1 : 0

  // Stable refs for JS callbacks (accessed by swipeOffScreen on JS thread)
  const onSwipeRightRef = useRef(onSwipeRight)
  onSwipeRightRef.current = onSwipeRight
  const onSwipeLeftRef = useRef(onSwipeLeft)
  onSwipeLeftRef.current = onSwipeLeft
  const onSwipeUpRef = useRef(onSwipeUp)
  onSwipeUpRef.current = onSwipeUp
  const onSwipeDownRef = useRef(onSwipeDown)
  onSwipeDownRef.current = onSwipeDown

  // Reset all animated values to initial state (JS thread — sets animations that run on UI thread)
  const resetAll = useCallback(() => {
    posX.value = withSpring(0, { damping: 15, stiffness: 100 })
    posY.value = withSpring(0, { damping: 15, stiffness: 100 })
    greenOverlay.value = withTiming(0, { duration: 150 })
    redOverlay.value = withTiming(0, { duration: 150 })
    grayOverlay.value = withTiming(0, { duration: 150 })
    yellowOverlay.value = withTiming(0, { duration: 150 })
    goldOverlay.value = withTiming(0, { duration: 150 })
    checkO.value = withTiming(0, { duration: 150 })
    xO.value = withTiming(0, { duration: 150 })
    passO.value = withTiming(0, { duration: 150 })
    chatO.value = withTiming(0, { duration: 150 })
    starO.value = withTiming(0, { duration: 150 })
  }, [])

  // Swipe card off screen — runs on JS thread, calls handler, then animates departure
  const swipeOffScreen = useCallback((direction) => {
    let result
    switch (direction) {
      case 'right': result = onSwipeRightRef.current?.(); break
      case 'left': result = onSwipeLeftRef.current?.(); break
      case 'up': result = onSwipeUpRef.current?.(); break
      case 'down': result = onSwipeDownRef.current?.(); break
    }

    // If handler returns false, reset position instead of swiping off
    if (result === false) {
      resetAll()
      return
    }

    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 :
              direction === 'left' ? -SCREEN_WIDTH * 1.5 : 0
    const y = direction === 'up' ? -SCREEN_HEIGHT :
              direction === 'down' ? SCREEN_HEIGHT : 0
    posX.value = withTiming(x, { duration: 250 })
    posY.value = withTiming(y, { duration: 250 })
  }, [resetAll])

  // Expose swipe methods for keyboard control (with overlay animation)
  useImperativeHandle(ref, () => ({
    swipeRight: () => {
      if (rightSwipeAsChatAccept) {
        yellowOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('right')
        })
        chatO.value = withTiming(1, { duration: 150 })
        chatS.value = withSpring(1, { damping: 15, stiffness: 100 })
      } else if (rightSwipeAsSubmit) {
        greenOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('right')
        })
        submitO.value = withTiming(1, { duration: 150 })
        submitS.value = withSpring(1, { damping: 15, stiffness: 100 })
      } else if (rightSwipeAsKudos) {
        goldOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('right')
        })
        starO.value = withTiming(1, { duration: 150 })
        starS.value = withSpring(1, { damping: 15, stiffness: 100 })
      } else {
        greenOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('right')
        })
        checkO.value = withTiming(1, { duration: 150 })
        checkS.value = withSpring(1, { damping: 15, stiffness: 100 })
      }
    },
    swipeLeft: () => {
      if (leftSwipeAsPass) {
        grayOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('left')
        })
        passO.value = withTiming(1, { duration: 150 })
        passS.value = withSpring(1, { damping: 15, stiffness: 100 })
      } else {
        redOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
          if (finished) runOnJS(swipeOffScreen)('left')
        })
        xO.value = withTiming(1, { duration: 150 })
        xS.value = withSpring(1, { damping: 15, stiffness: 100 })
      }
    },
    swipeUp: () => {
      yellowOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
        if (finished) runOnJS(swipeOffScreen)('up')
      })
      chatO.value = withTiming(1, { duration: 150 })
      chatS.value = withSpring(1, { damping: 15, stiffness: 100 })
    },
    swipeDown: () => {
      grayOverlay.value = withTiming(0.4, { duration: 150 }, (finished) => {
        if (finished) runOnJS(swipeOffScreen)('down')
      })
      passO.value = withTiming(1, { duration: 150 })
      passS.value = withSpring(1, { damping: 15, stiffness: 100 })
    },
    swipeRightWithPlus: () => {
      greenOverlay.value = withTiming(0.4, { duration: 200 }, (finished) => {
        if (finished) runOnJS(swipeOffScreen)('right')
      })
      plusO.value = withTiming(1, { duration: 200 })
      plusS.value = withSpring(1, { damping: 15, stiffness: 100 })
    },
  }), [swipeOffScreen, rightSwipeAsChatAccept, rightSwipeAsSubmit, rightSwipeAsKudos, leftSwipeAsPass])

  // Pan gesture — runs entirely on UI thread for smooth 60fps tracking
  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onStart(() => {
      'worklet'
      cancelAnimation(posX)
      cancelAnimation(posY)
    })
    .onUpdate((e) => {
      'worklet'
      const canSwipeUp = flagVertical.value && hasUp.value
      const canSwipeDown = flagVertical.value && hasDown.value
      const canSwipeVertically = canSwipeUp || canSwipeDown

      // Constrain vertical movement based on available handlers
      let dy = 0
      if (canSwipeVertically) {
        if (e.translationY < 0 && canSwipeUp) dy = e.translationY
        else if (e.translationY > 0 && canSwipeDown) dy = e.translationY
      }

      // Constrain horizontal movement based on available handlers
      let dx = e.translationX
      if (e.translationX < 0 && !hasLeft.value) dx = 0

      posX.value = dx
      posY.value = dy

      // Calculate overlay intensities based on swipe direction
      const horizontalProgress = Math.min(Math.abs(e.translationX) / SWIPE_THRESHOLD, 1)
      const verticalProgress = Math.min(Math.abs(e.translationY) / VERTICAL_THRESHOLD, 1)
      const isHorizontal = Math.abs(e.translationX) > Math.abs(e.translationY)

      // Determine which overlay is active and compute all values in one pass
      let gVal = 0, rVal = 0, grVal = 0, yVal = 0, goVal = 0
      let chkOV = 0, chkSV = 0.5, xOV = 0, xSV = 0.5, pOV = 0, pSV = 0.5
      let chatOV = 0, chatSV = 0.5, subOV = 0, subSV = 0.5, starOV = 0, starSV = 0.5

      if (isHorizontal) {
        if (e.translationX > 0) {
          if (flagChatAccept.value) {
            yVal = horizontalProgress * 0.4
            chatOV = horizontalProgress; chatSV = 0.5 + horizontalProgress * 0.5
          } else if (flagSubmit.value) {
            gVal = horizontalProgress * 0.4
            subOV = horizontalProgress; subSV = 0.5 + horizontalProgress * 0.5
          } else if (flagKudos.value) {
            goVal = horizontalProgress * 0.4
            starOV = horizontalProgress; starSV = 0.5 + horizontalProgress * 0.5
          } else {
            gVal = horizontalProgress * 0.4
            chkOV = horizontalProgress; chkSV = 0.5 + horizontalProgress * 0.5
          }
        } else if (hasLeft.value) {
          if (flagPassLeft.value) {
            grVal = horizontalProgress * 0.4
            pOV = horizontalProgress; pSV = 0.5 + horizontalProgress * 0.5
          } else {
            rVal = horizontalProgress * 0.4
            xOV = horizontalProgress; xSV = 0.5 + horizontalProgress * 0.5
          }
        }
      } else if (canSwipeVertically) {
        if (e.translationY > 0 && canSwipeDown) {
          grVal = verticalProgress * 0.4
          pOV = verticalProgress; pSV = 0.5 + verticalProgress * 0.5
        } else if (e.translationY < 0 && canSwipeUp) {
          yVal = verticalProgress * 0.4
          chatOV = verticalProgress; chatSV = 0.5 + verticalProgress * 0.5
        }
      }

      // Set all values at once — no intermediate zero-frame
      greenOverlay.value = gVal
      redOverlay.value = rVal
      grayOverlay.value = grVal
      yellowOverlay.value = yVal
      goldOverlay.value = goVal
      checkO.value = chkOV; checkS.value = chkSV
      xO.value = xOV; xS.value = xSV
      passO.value = pOV; passS.value = pSV
      chatO.value = chatOV; chatS.value = chatSV
      submitO.value = subOV; submitS.value = subSV
      starO.value = starOV; starS.value = starSV
    })
    .onEnd((e) => {
      'worklet'
      const isHorizontal = Math.abs(e.translationX) > Math.abs(e.translationY)
      const canSwipeUp = flagVertical.value && hasUp.value
      const canSwipeDown = flagVertical.value && hasDown.value

      if (isHorizontal) {
        if (e.translationX > SWIPE_THRESHOLD) {
          runOnJS(swipeOffScreen)('right')
        } else if (e.translationX < -SWIPE_THRESHOLD && hasLeft.value) {
          runOnJS(swipeOffScreen)('left')
        } else {
          runOnJS(resetAll)()
        }
      } else if (canSwipeUp || canSwipeDown) {
        if (e.translationY < -VERTICAL_THRESHOLD && canSwipeUp) {
          runOnJS(swipeOffScreen)('up')
        } else if (e.translationY > VERTICAL_THRESHOLD && canSwipeDown) {
          runOnJS(swipeOffScreen)('down')
        } else {
          runOnJS(resetAll)()
        }
      } else {
        runOnJS(resetAll)()
      }
    })
    .onFinalize((_, success) => {
      'worklet'
      if (!success) {
        runOnJS(resetAll)()
      }
    })

  // Card transform animated style (position + rotation)
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value },
      { translateY: posY.value },
      {
        rotate: `${interpolate(
          posX.value,
          [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
          [-12, 0, 12],
        )}deg`,
      },
    ],
  }))

  // Color overlay animated styles
  const greenOverlayStyle = useAnimatedStyle(() => ({ opacity: greenOverlay.value }))
  const redOverlayStyle = useAnimatedStyle(() => ({ opacity: redOverlay.value }))
  const grayOverlayStyle = useAnimatedStyle(() => ({ opacity: grayOverlay.value }))
  const yellowOverlayStyle = useAnimatedStyle(() => ({ opacity: yellowOverlay.value }))
  const goldOverlayStyle = useAnimatedStyle(() => ({ opacity: goldOverlay.value }))

  // Icon/text overlay animated styles
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkO.value,
    transform: [{ scale: checkS.value }],
  }))
  const xStyle = useAnimatedStyle(() => ({
    opacity: xO.value,
    transform: [{ scale: xS.value }],
  }))
  const passAnimStyle = useAnimatedStyle(() => ({
    opacity: passO.value,
    transform: [{ scale: passS.value }],
  }))
  const chatAnimStyle = useAnimatedStyle(() => ({
    opacity: chatO.value,
    transform: [{ scale: chatS.value }],
  }))
  const plusAnimStyle = useAnimatedStyle(() => ({
    opacity: plusO.value,
    transform: [{ scale: plusS.value }],
  }))
  const submitAnimStyle = useAnimatedStyle(() => ({
    opacity: submitO.value,
    transform: [{ scale: submitS.value }],
  }))
  const starAnimStyle = useAnimatedStyle(() => ({
    opacity: starO.value,
    transform: [{ scale: starS.value }],
  }))

  // Back card - just render the content without gesture handling
  if (isBackCard) {
    return (
      <View style={styles.backCardContainer} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={styles.cardContent}>
          {children}
        </View>
      </View>
    )
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.container, cardStyle]}
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View style={styles.cardContent}>
          {children}
        </View>
        {/* Swipe overlays — decorative, hidden from screen readers */}
        <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* Green overlay for right swipe */}
          <Animated.View
            style={[styles.overlay, { backgroundColor: SemanticColors.agree }, greenOverlayStyle]}
          />
          {/* Red overlay for left swipe */}
          <Animated.View
            style={[styles.overlay, { backgroundColor: SemanticColors.disagree }, redOverlayStyle]}
          />
          {/* Gray overlay for down swipe */}
          <Animated.View
            style={[styles.overlay, { backgroundColor: colors.pass }, grayOverlayStyle]}
          />
          {/* Yellow overlay for up swipe */}
          <Animated.View
            style={[styles.overlay, { backgroundColor: colors.chat }, yellowOverlayStyle]}
          />
          {/* Checkmark icon overlay for right swipe (agree) */}
          <Animated.View style={[styles.iconOverlay, checkStyle]}>
            <Ionicons name="checkmark" size={120} color="#fff" />
          </Animated.View>
          {/* X icon overlay for left swipe (disagree) */}
          <Animated.View style={[styles.iconOverlay, xStyle]}>
            <Ionicons name="close" size={120} color="#fff" />
          </Animated.View>
          {/* Pass text overlay for down swipe */}
          <Animated.View style={[styles.iconOverlay, passAnimStyle]}>
            <ThemedText variant="overlay" color="inverse">{leftSwipeLabel || t('swipePass')}</ThemedText>
          </Animated.View>
          {/* Chat icon overlay for up swipe */}
          <Animated.View style={[styles.iconOverlay, chatAnimStyle]}>
            <Ionicons name="chatbubble" size={100} color="#fff" />
          </Animated.View>
          {/* Plus icon overlay for adopt */}
          <Animated.View style={[styles.iconOverlay, plusAnimStyle]}>
            <Ionicons name="add" size={120} color="#fff" />
          </Animated.View>
          {/* Submit text overlay for surveys/demographics */}
          <Animated.View style={[styles.iconOverlay, submitAnimStyle]}>
            <ThemedText variant="overlay" color="inverse">{rightSwipeLabel || t('swipeSubmit')}</ThemedText>
          </Animated.View>
          {/* Gold overlay for kudos */}
          <Animated.View
            style={[styles.overlay, { backgroundColor: '#FFD700' }, goldOverlayStyle]}
          />
          {/* Star icon overlay for kudos */}
          <Animated.View style={[styles.iconOverlay, starAnimStyle]}>
            <Ionicons name="star" size={120} color="#fff" />
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
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
})

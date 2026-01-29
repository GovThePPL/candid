import { StyleSheet, Dimensions, View, Animated, PanResponder, Platform } from 'react-native'
import { useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Colors } from '../../constants/Colors'

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
}, ref) {
  const position = useRef(new Animated.ValueXY()).current

  // Separate animated values for each color overlay
  const greenOverlay = useRef(new Animated.Value(0)).current
  const redOverlay = useRef(new Animated.Value(0)).current
  const grayOverlay = useRef(new Animated.Value(0)).current
  const yellowOverlay = useRef(new Animated.Value(0)).current

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
    ]).start()
  }, [position, greenOverlay, redOverlay, grayOverlay, yellowOverlay])

  const swipeOffScreen = useCallback((direction) => {
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 :
              direction === 'left' ? -SCREEN_WIDTH * 1.5 : 0
    const y = direction === 'up' ? -SCREEN_HEIGHT :
              direction === 'down' ? SCREEN_HEIGHT : 0

    Animated.timing(position, {
      toValue: { x, y },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      // Call handler first - this will trigger index change and remount
      switch (direction) {
        case 'right': onSwipeRight?.(); break
        case 'left': onSwipeLeft?.(); break
        case 'up': onSwipeUp?.(); break
        case 'down': onSwipeDown?.(); break
      }
      // Note: Don't reset position here - the component will be replaced
      // when the card index changes, and the new instance starts fresh
    })
  }, [position, onSwipeRight, onSwipeLeft, onSwipeUp, onSwipeDown, greenOverlay, redOverlay, grayOverlay, yellowOverlay])

  // Expose swipe methods for keyboard control (with color overlay animation)
  useImperativeHandle(ref, () => ({
    swipeRight: () => {
      Animated.timing(greenOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }).start(() => {
        swipeOffScreen('right')
      })
    },
    swipeLeft: () => {
      Animated.timing(redOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }).start(() => {
        swipeOffScreen('left')
      })
    },
    swipeUp: () => {
      Animated.timing(yellowOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }).start(() => {
        swipeOffScreen('up')
      })
    },
    swipeDown: () => {
      Animated.timing(grayOverlay, { toValue: 0.4, duration: 150, useNativeDriver: false }).start(() => {
        swipeOffScreen('down')
      })
    },
  }), [swipeOffScreen, greenOverlay, redOverlay, yellowOverlay, grayOverlay])

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
        position.setValue({ x: gesture.dx, y: enableVerticalSwipe ? gesture.dy : 0 })

        // Calculate overlay intensities based on swipe direction
        const horizontalProgress = Math.min(Math.abs(gesture.dx) / SWIPE_THRESHOLD, 1)
        const verticalProgress = Math.min(Math.abs(gesture.dy) / VERTICAL_THRESHOLD, 1)
        const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy)

        // Reset all overlays first
        greenOverlay.setValue(0)
        redOverlay.setValue(0)
        grayOverlay.setValue(0)
        yellowOverlay.setValue(0)

        if (isHorizontal) {
          if (gesture.dx > 0) {
            greenOverlay.setValue(horizontalProgress * 0.4)
          } else {
            redOverlay.setValue(horizontalProgress * 0.4)
          }
        } else if (enableVerticalSwipe) {
          if (gesture.dy > 0) {
            grayOverlay.setValue(verticalProgress * 0.4)
          } else {
            yellowOverlay.setValue(verticalProgress * 0.4)
          }
        }
        // Note: Don't animate back card during drag - only on release
      },
      onPanResponderRelease: (_, gesture) => {
        const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy)

        if (isHorizontal) {
          if (gesture.dx > SWIPE_THRESHOLD) {
            swipeOffScreen('right')
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            swipeOffScreen('left')
          } else {
            resetPosition()
          }
        } else if (enableVerticalSwipe) {
          if (gesture.dy < -VERTICAL_THRESHOLD) {
            swipeOffScreen('up')
          } else if (gesture.dy > VERTICAL_THRESHOLD) {
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
        style={[styles.overlay, { backgroundColor: Colors.agree, opacity: greenOverlay }]}
        pointerEvents="none"
      />
      {/* Red overlay for left swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: Colors.disagree, opacity: redOverlay }]}
        pointerEvents="none"
      />
      {/* Gray overlay for down swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: Colors.pass, opacity: grayOverlay }]}
        pointerEvents="none"
      />
      {/* Yellow overlay for up swipe */}
      <Animated.View
        style={[styles.overlay, { backgroundColor: Colors.chat, opacity: yellowOverlay }]}
        pointerEvents="none"
      />
    </Animated.View>
  )
})

export default SwipeableCard

const styles = StyleSheet.create({
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
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
})

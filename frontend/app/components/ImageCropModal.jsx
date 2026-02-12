import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  PanResponder,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import Svg, { Defs, Mask, Rect, Circle } from 'react-native-svg'
import * as ImageManipulator from 'expo-image-manipulator'

import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CIRCLE_SIZE = 280
const MAX_SCALE = 3

// Calculate center position for the circle overlay
const HEADER_HEIGHT = 60
const FOOTER_HEIGHT = 140
const AVAILABLE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT
const CENTER_Y = HEADER_HEIGHT + AVAILABLE_HEIGHT / 2

// Clamp a value between min and max
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export default function ImageCropModal({ visible, imageUri, onCancel, onConfirm }) {
  const { t } = useTranslation('settings')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(0.5)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  // Refs for values that need to be accessed in PanResponder (which is created once)
  const positionRef = useRef({ x: 0, y: 0 })
  const gestureStartPosition = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const displaySizeRef = useRef({ width: 0, height: 0 })

  // Keep refs in sync with state
  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    displaySizeRef.current = displaySize
  }, [displaySize])

  // Load image dimensions when imageUri changes
  useEffect(() => {
    if (imageUri) {
      setImageLoading(true)
      setPosition({ x: 0, y: 0 })
      positionRef.current = { x: 0, y: 0 }
      gestureStartPosition.current = { x: 0, y: 0 }

      Image.getSize(
        imageUri,
        (width, height) => {
          setImageSize({ width, height })

          // Calculate display size to fit within available space while maintaining aspect ratio
          const aspectRatio = width / height
          let displayWidth, displayHeight

          if (aspectRatio > 1) {
            // Landscape: fit width to screen, height scales proportionally
            displayWidth = Math.min(SCREEN_WIDTH * 0.95, width)
            displayHeight = displayWidth / aspectRatio
          } else {
            // Portrait: fit height to available space, width scales proportionally
            displayHeight = Math.min(AVAILABLE_HEIGHT * 0.9, height)
            displayWidth = displayHeight * aspectRatio
          }

          setDisplaySize({ width: displayWidth, height: displayHeight })
          displaySizeRef.current = { width: displayWidth, height: displayHeight }

          // Calculate min scale so that zooming out allows the circle to contain
          // the full width or height of the image (whichever is larger in display)
          const minScaleValue = CIRCLE_SIZE / Math.max(displayWidth, displayHeight)
          setMinScale(minScaleValue)

          // Start at a scale where the image fills the circle
          const initialScale = Math.max(minScaleValue, CIRCLE_SIZE / Math.min(displayWidth, displayHeight))
          setScale(initialScale)
          scaleRef.current = initialScale

          setImageLoading(false)
        },
        (error) => {
          console.error('Failed to get image size:', error)
          setImageLoading(false)
        }
      )
    }
  }, [imageUri])

  // Calculate bounds for panning based on current scale (uses refs for PanResponder)
  const getBoundsFromRefs = () => {
    const currentScale = scaleRef.current
    const { width, height } = displaySizeRef.current
    const scaledWidth = width * currentScale
    const scaledHeight = height * currentScale

    // The image can move such that the circle always shows image content
    const maxX = Math.max(0, (scaledWidth - CIRCLE_SIZE) / 2)
    const maxY = Math.max(0, (scaledHeight - CIRCLE_SIZE) / 2)

    return { minX: -maxX, maxX, minY: -maxY, maxY }
  }

  // Clamp position to bounds when scale changes
  useEffect(() => {
    const scaledWidth = displaySize.width * scale
    const scaledHeight = displaySize.height * scale
    const maxX = Math.max(0, (scaledWidth - CIRCLE_SIZE) / 2)
    const maxY = Math.max(0, (scaledHeight - CIRCLE_SIZE) / 2)

    const clampedX = clamp(position.x, -maxX, maxX)
    const clampedY = clamp(position.y, -maxY, maxY)

    if (clampedX !== position.x || clampedY !== position.y) {
      setPosition({ x: clampedX, y: clampedY })
      positionRef.current = { x: clampedX, y: clampedY }
    }
  }, [scale, displaySize])

  // Pan responder for dragging the image
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Capture current position at the start of the gesture
        gestureStartPosition.current = { ...positionRef.current }
      },
      onPanResponderMove: (_, gesture) => {
        const newX = gestureStartPosition.current.x + gesture.dx
        const newY = gestureStartPosition.current.y + gesture.dy
        setPosition({ x: newX, y: newY })
      },
      onPanResponderRelease: (_, gesture) => {
        const bounds = getBoundsFromRefs()
        const newX = clamp(gestureStartPosition.current.x + gesture.dx, bounds.minX, bounds.maxX)
        const newY = clamp(gestureStartPosition.current.y + gesture.dy, bounds.minY, bounds.maxY)

        positionRef.current = { x: newX, y: newY }
        setPosition({ x: newX, y: newY })
      },
    })
  ).current

  // Handle accepting the crop
  const handleAccept = async () => {
    if (!imageUri || imageSize.width === 0) return

    setIsProcessing(true)

    try {
      // Calculate the scale factor between display and original image
      const scaleToOriginal = imageSize.width / displaySize.width

      // The crop region in original image coordinates
      // Center of display is at (displaySize.width/2, displaySize.height/2)
      // Position offsets the image, so negative position means we're showing
      // content to the right/bottom of center

      const scaledDisplayWidth = displaySize.width * scale
      const scaledDisplayHeight = displaySize.height * scale

      // Where is the circle center in the scaled image space?
      // The image center is at (scaledDisplayWidth/2, scaledDisplayHeight/2)
      // The offset moves the image, so the circle sees:
      const circleCenterInScaledImageX = scaledDisplayWidth / 2 - position.x
      const circleCenterInScaledImageY = scaledDisplayHeight / 2 - position.y

      // Convert to original image coordinates
      const effectiveScale = scale * (displaySize.width / imageSize.width)
      const cropCenterX = circleCenterInScaledImageX / effectiveScale
      const cropCenterY = circleCenterInScaledImageY / effectiveScale

      // Crop size in original coordinates
      const cropSizeInOriginal = CIRCLE_SIZE / effectiveScale

      // Calculate crop origin (top-left)
      let originX = cropCenterX - cropSizeInOriginal / 2
      let originY = cropCenterY - cropSizeInOriginal / 2

      // Clamp to image bounds
      originX = Math.max(0, Math.min(originX, imageSize.width - cropSizeInOriginal))
      originY = Math.max(0, Math.min(originY, imageSize.height - cropSizeInOriginal))

      // Ensure crop size doesn't exceed image
      const finalCropSize = Math.min(
        cropSizeInOriginal,
        imageSize.width - originX,
        imageSize.height - originY
      )

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(finalCropSize),
              height: Math.round(finalCropSize),
            },
          },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      )

      onConfirm(`data:image/jpeg;base64,${result.base64}`)
    } catch (error) {
      console.error('Failed to crop image:', error)
      // Fall back to just uploading the original
      try {
        const result = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 512, height: 512 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        )
        onConfirm(`data:image/jpeg;base64,${result.base64}`)
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Image position styles
  const imageStyle = {
    width: displaySize.width * scale,
    height: displaySize.height * scale,
    transform: [{ translateX: position.x }, { translateY: position.y }],
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('cancelCropA11y')}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <ThemedText variant="h2" color="inverse">{t('cropPhoto')}</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        {/* Image Container */}
        <View style={styles.imageContainer} {...panResponder.panHandlers}>
          {imageLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              {/* The draggable image */}
              <View style={styles.imageWrapper}>
                <Image source={{ uri: imageUri }} style={imageStyle} resizeMode="cover" />
              </View>

              {/* Dark overlay with circular cutout */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg width={SCREEN_WIDTH} height={AVAILABLE_HEIGHT}>
                  <Defs>
                    <Mask id="circleMask">
                      <Rect width={SCREEN_WIDTH} height={AVAILABLE_HEIGHT} fill="white" />
                      <Circle
                        cx={SCREEN_WIDTH / 2}
                        cy={AVAILABLE_HEIGHT / 2}
                        r={CIRCLE_SIZE / 2}
                        fill="black"
                      />
                    </Mask>
                  </Defs>
                  <Rect
                    width={SCREEN_WIDTH}
                    height={AVAILABLE_HEIGHT}
                    fill="rgba(0, 0, 0, 0.7)"
                    mask="url(#circleMask)"
                  />
                </Svg>
              </View>

              {/* Circle border */}
              <View
                style={[
                  styles.circleBorder,
                  {
                    top: (AVAILABLE_HEIGHT - CIRCLE_SIZE) / 2,
                    left: (SCREEN_WIDTH - CIRCLE_SIZE) / 2,
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                  },
                ]}
                pointerEvents="none"
              />
            </>
          )}
        </View>

        {/* Footer with slider and accept button */}
        <View style={styles.footer}>
          {/* Zoom slider */}
          <View style={styles.sliderContainer}>
            <Ionicons name="remove" size={24} color="#fff" />
            <Slider
              style={styles.slider}
              minimumValue={minScale}
              maximumValue={MAX_SCALE}
              value={scale}
              onValueChange={(val) => {
                setScale(val)
                scaleRef.current = val
              }}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor="#666"
              thumbTintColor={colors.primary}
              accessibilityLabel={t('zoomA11y')}
            />
            <Ionicons name="add" size={24} color="#fff" />
          </View>

          {/* Accept button */}
          <TouchableOpacity
            style={[styles.acceptButton, isProcessing && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={isProcessing || imageLoading}
            accessibilityRole="button"
            accessibilityLabel={t('acceptCrop')}
            accessibilityState={{ disabled: isProcessing || imageLoading }}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText variant="h2" color="inverse">{t('acceptCrop')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  cancelButton: {
    padding: 8,
  },
  headerSpacer: {
    width: 44,
  },
  imageContainer: {
    height: AVAILABLE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBorder: {
    position: 'absolute',
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  footer: {
    height: FOOTER_HEIGHT,
    paddingHorizontal: 20,
    paddingBottom: 30,
    justifyContent: 'center',
    gap: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  acceptButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
})

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Pressable,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import useModalBackHandler from '../hooks/useModalBackHandler'
import useIsDesktop from '../hooks/useIsDesktop'
import { SemanticColors } from '../constants/Colors'
import { Shadows } from '../constants/Theme'
import ThemedText from './ThemedText'

const SCREEN_HEIGHT = Dimensions.get('window').height

export const MAX_HEIGHT_FRACTION = 0.85

/**
 * Animated bottom drawer modal with overlay fade and slide-up transition.
 * On desktop (>= 1024px), renders as a centered popup instead.
 * By default fills to 85% of screen height. Pass `shrink` to size to content instead.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the drawer should be shown
 * @param {Function} props.onClose - Called when closing (overlay tap or close button)
 * @param {string} [props.title] - Header title
 * @param {string} [props.subtitle] - Header subtitle below title
 * @param {ReactNode} [props.headerRight] - Custom element on the right side of the header (replaces default close button)
 * @param {ReactNode} [props.headerLeft] - Custom element on the left side of the header (e.g. back button)
 * @param {ReactNode} props.children - Drawer content
 * @param {boolean} [props.shrink=false] - When true, drawer shrinks to fit content (capped at 85%). Use for small dialogs with fixed content.
 */
export default function BottomDrawerModal({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  headerLeft,
  children,
  shrink = false,
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop])
  const [modalVisible, setModalVisible] = useState(false)
  useModalBackHandler(visible, onClose)
  const overlayOpacity = useSharedValue(0)
  const slideY = useSharedValue(SCREEN_HEIGHT)
  const popupScale = useSharedValue(0.95)
  const maxHeight = MAX_HEIGHT_FRACTION * SCREEN_HEIGHT

  const hideModal = useCallback(() => {
    setModalVisible(false)
  }, [])

  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      overlayOpacity.value = withTiming(1, { duration: 300 })
      if (isDesktop) {
        popupScale.value = withTiming(1, { duration: 200 })
      } else {
        slideY.value = withTiming(0, { duration: 300 })
      }
    } else {
      overlayOpacity.value = withTiming(0, { duration: 250 })
      if (isDesktop) {
        popupScale.value = withTiming(0.95, { duration: 150 }, () => {
          runOnJS(hideModal)()
        })
      } else {
        slideY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
          runOnJS(hideModal)()
        })
      }
    }
  }, [visible, isDesktop])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const drawerContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }))

  const popupContentStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: popupScale.value }],
  }))

  const header = (
    <View style={styles.header}>
      {headerLeft && <View style={styles.headerLeftSlot}>{headerLeft}</View>}
      <View style={styles.headerTitleContainer}>
        {title && <ThemedText variant="h2" color="primary" style={styles.title}>{title}</ThemedText>}
        {subtitle && <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{subtitle}</ThemedText>}
      </View>
      {headerRight || (
        <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel={t('close')} accessibilityRole="button">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('closeDrawer')} accessibilityRole="button" />
        </Animated.View>

        {isDesktop ? (
          <Pressable style={styles.popupCenter} onPress={onClose}>
            <Animated.View
              testID="drawer-content"
              style={[styles.popupContent, popupContentStyle]}
            >
              <Pressable onPress={(e) => e.stopPropagation()} accessible={false} importantForAccessibility="no">
                {header}
                <View style={shrink ? { maxHeight: maxHeight * 0.7 } : { height: maxHeight * 0.7 }}>
                  {children}
                </View>
              </Pressable>
            </Animated.View>
          </Pressable>
        ) : (
          <Animated.View
            testID="drawer-content"
            style={[
              styles.content,
              shrink ? { maxHeight: maxHeight } : { height: maxHeight },
              drawerContentStyle,
            ]}
          >
            {header}
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  )
}

const createStyles = (colors, isDesktop) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: isDesktop ? 'center' : 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SemanticColors.overlay,
  },
  // Mobile: bottom drawer
  content: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  // Desktop: centered popup positioning
  popupCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Desktop: popup container
  popupContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    width: '100%',
    maxWidth: 560,
    overflow: 'hidden',
    ...Shadows.elevated,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: isDesktop ? 16 : 20,
    borderTopRightRadius: isDesktop ? 16 : 20,
  },
  headerLeftSlot: {
    marginRight: 12,
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
})

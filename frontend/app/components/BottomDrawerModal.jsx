import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import { Typography } from '../constants/Theme'
import ThemedText from './ThemedText'

const SCREEN_HEIGHT = Dimensions.get('window').height

/**
 * Animated bottom drawer modal with overlay fade and slide-up transition.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the drawer should be shown
 * @param {Function} props.onClose - Called when closing (overlay tap or close button)
 * @param {string} [props.title] - Header title
 * @param {string} [props.subtitle] - Header subtitle below title
 * @param {ReactNode} [props.headerRight] - Custom element on the right side of the header (replaces default close button)
 * @param {ReactNode} [props.headerLeft] - Custom element on the left side of the header (e.g. back button)
 * @param {ReactNode} props.children - Drawer content
 * @param {string} [props.maxHeight='85%'] - Maximum height of the drawer
 */
export default function BottomDrawerModal({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  headerLeft,
  children,
  maxHeight = '85%',
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [modalVisible, setModalVisible] = useState(false)
  const overlayOpacity = useSharedValue(0)
  const slideY = useSharedValue(SCREEN_HEIGHT)

  // Resolve percentage to pixels for native compatibility
  const resolvedMaxHeight = typeof maxHeight === 'string' && maxHeight.endsWith('%')
    ? (parseFloat(maxHeight) / 100) * SCREEN_HEIGHT
    : maxHeight

  const hideModal = useCallback(() => {
    setModalVisible(false)
  }, [])

  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      overlayOpacity.value = withTiming(1, { duration: 300 })
      slideY.value = withTiming(0, { duration: 300 })
    } else {
      overlayOpacity.value = withTiming(0, { duration: 250 })
      slideY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
        runOnJS(hideModal)()
      })
    }
  }, [visible])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }))

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

        <Animated.View
          style={[
            styles.content,
            { height: resolvedMaxHeight },
            contentStyle,
          ]}
        >
          {/* Header */}
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

          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SemanticColors.overlay,
  },
  content: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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

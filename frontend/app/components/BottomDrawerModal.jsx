import { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'

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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [modalVisible, setModalVisible] = useState(false)
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false)
      })
    }
  }, [visible])

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            { maxHeight, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            {headerLeft && <View style={styles.headerLeftSlot}>{headerLeft}</View>}
            <View style={styles.headerTitleContainer}>
              {title && <Text style={styles.title}>{title}</Text>}
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {headerRight || (
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
})

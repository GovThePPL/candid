import { useMemo, useEffect, useRef } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Animated,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import useModalBackHandler from '../hooks/useModalBackHandler'
import { createSharedStyles } from '../constants/SharedStyles'
import ThemedText from './ThemedText'

/**
 * Modal shown when a message may be toxic, encouraging the user to reconsider.
 *
 * Props:
 *   visible      - Whether the modal is shown
 *   countdown    - Remaining seconds before "Send Anyway" is enabled
 *   checking     - Whether the toxicity check is in progress (shows spinner)
 *   onRevise     - Called when the user taps "Revise Message"
 *   onSendAnyway - Called when the user taps "Send Anyway" (after countdown)
 */
export default function ReconsiderModal({
  visible,
  countdown,
  onRevise,
  onSendAnyway,
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])
  const pulseAnim = useRef(new Animated.Value(1)).current

  useModalBackHandler(visible, onRevise)

  const canSend = countdown <= 0

  // Pulse animation on the countdown number
  useEffect(() => {
    if (!visible || canSend) return

    const pulse = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ])
    pulse.start()
  }, [countdown, visible, canSend, pulseAnim])

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onRevise}
    >
      <Pressable
        style={shared.modalOverlay}
        onPress={onRevise}
        accessibilityLabel={t('dismissModal')}
      >
        <Pressable
          style={styles.container}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          importantForAccessibility="no"
        >
          <View style={styles.iconContainer}>
            <Ionicons name="heart" size={48} color={colors.primary} />
          </View>

          <ThemedText variant="h4" color="primary" style={styles.title}>
            {t('reconsiderTitle')}
          </ThemedText>

          <ThemedText variant="body" style={styles.message}>
            {t('reconsiderMessage')}
          </ThemedText>

          <TouchableOpacity
            style={styles.reviseButton}
            onPress={onRevise}
            accessibilityRole="button"
            accessibilityLabel={t('reconsiderReviseA11y')}
          >
            <ThemedText variant="button" color="inverse">
              {t('reconsiderRevise')}
            </ThemedText>
          </TouchableOpacity>

          {canSend ? (
            <TouchableOpacity
              style={styles.sendAnywayButton}
              onPress={onSendAnyway}
              accessibilityRole="button"
              accessibilityLabel={t('reconsiderSendAnywayA11y')}
              accessibilityState={{ disabled: false }}
            >
              <ThemedText variant="bodySmall" color="secondary">
                {t('reconsiderSendAnyway')}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <Animated.View
              accessible={true}
              style={[styles.countdownContainer, { transform: [{ scale: pulseAnim }] }]}
              accessibilityRole="button"
              accessibilityLabel={t('reconsiderSendAnywayA11y')}
              accessibilityState={{ disabled: true }}
            >
              <ThemedText variant="h2" color="disabled">
                {countdown}
              </ThemedText>
            </Animated.View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: colors.primary + '20',
    borderRadius: 40,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: 16,
  },
  reviseButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 4,
  },
  sendAnywayButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  countdownContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 12,
    alignItems: 'center',
  },
})

/**
 * Haptic feedback utilities.
 * Wraps expo-haptics with platform-safe no-ops on web.
 */

import { Platform } from 'react-native'

const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : null

/** Light impact tap — tactile confirmation for user actions. */
export function hapticTap() {
  if (!Haptics) return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

/** Success notification — for milestone moments (agreement, bridging). */
export function hapticSuccess() {
  if (!Haptics) return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

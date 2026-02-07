import { Platform } from 'react-native'
import api from './api'

let Notifications = null
let Device = null

// Lazy-load expo-notifications and expo-device (they may not be installed yet)
try {
  Notifications = require('expo-notifications')
  Device = require('expo-device')
} catch {
  // expo-notifications not installed — push notifications won't work
}

/**
 * Request permission and register the device's Expo push token with the backend.
 * Returns the token string on success, or null if permission denied / unavailable.
 */
export async function registerForPushNotifications() {
  if (!Notifications || !Device) {
    console.warn('[notifications] expo-notifications or expo-device not available')
    return null
  }

  // Push notifications don't work on simulators
  if (!Device.isDevice) {
    console.warn('[notifications] Must use physical device for push notifications')
    return null
  }

  // Check / request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    console.warn('[notifications] Push notification permission not granted')
    return null
  }

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync()
  const token = tokenData.data

  // Register with backend
  const platform = Platform.OS === 'web' ? 'web' : 'expo'
  await api.users.registerPushToken(token, platform)

  return token
}

/**
 * Configure how notifications are displayed when the app is in the foreground.
 */
export function setupNotificationHandler() {
  if (!Notifications) return

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

/**
 * Add a listener for when the user taps a notification.
 * Returns a cleanup function.
 */
export function addNotificationResponseListener(callback) {
  if (!Notifications) return () => {}

  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data
    callback(data)
  })

  return () => subscription.remove()
}

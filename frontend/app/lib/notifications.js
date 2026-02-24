import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import api from './api'

/**
 * Request permission and register the device's Expo push token with the backend.
 * Returns the token string on success, or null if permission denied / unavailable.
 */
export async function registerForPushNotifications() {
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

  // Get Expo push token (projectId required for SDK 54+)
  // This throws on Expo Go SDK 53+ (remote push removed); requires dev build.
  let token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
    token = tokenData.data
  } catch (err) {
    console.warn('[notifications] Could not get push token (dev build required for remote push):', err.message)
    return null
  }

  // Register with backend
  const platform = Platform.OS === 'web' ? 'web' : 'expo'
  await api.users.registerPushToken(token, platform)

  return token
}

/**
 * Configure how notifications are displayed when the app is in the foreground.
 */
export function setupNotificationHandler() {
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
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data
    callback(data)
  })

  return () => subscription.remove()
}

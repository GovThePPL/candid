/**
 * Platform-aware secure storage wrapper.
 *
 * - Native (iOS/Android): uses expo-secure-store (encrypted keychain/keystore)
 * - Web: falls back to AsyncStorage (no native secure storage API available)
 */

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

let SecureStore = null
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store')
}

export async function getSecureItem(key) {
  if (SecureStore) {
    return await SecureStore.getItemAsync(key)
  }
  return await AsyncStorage.getItem(key)
}

export async function setSecureItem(key, value) {
  if (SecureStore) {
    await SecureStore.setItemAsync(key, value)
  } else {
    await AsyncStorage.setItem(key, value)
  }
}

export async function deleteSecureItem(key) {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(key)
  } else {
    await AsyncStorage.removeItem(key)
  }
}

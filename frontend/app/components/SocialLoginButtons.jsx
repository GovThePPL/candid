import { View, Platform, Pressable, StyleSheet, Image } from 'react-native'
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { useTheme } from '../contexts/ThemeContext'
import { useUser } from '../hooks/useUser'
import ThemedText from './ThemedText'
import { Typography } from '../constants/Theme'

// Google "G" logo — inline SVG data URI (brand-compliant colors)
const GOOGLE_LOGO = require('../assets/google-g.png')

export function isSocialLoginEnabled() {
  return (
    !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ||
    !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ||
    !!process.env.EXPO_PUBLIC_APPLE_SERVICE_ID
  )
}

const SocialLoginButtons = ({ onError, showDivider = true }) => {
  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const { isDark } = useTheme()
  const { socialLogin } = useUser()
  const [loading, setLoading] = useState(null) // 'apple' | 'google' | null
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark])

  const handleAppleSignIn = useCallback(async () => {
    if (loading) return
    setLoading('apple')
    try {
      if (Platform.OS === 'ios') {
        const AppleAuthentication = require('expo-apple-authentication')
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        })
        const userInfo = {}
        if (credential.fullName) {
          const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean)
          if (parts.length) userInfo.displayName = parts.join(' ')
        }
        if (credential.email) userInfo.email = credential.email
        await socialLogin('apple', credential.identityToken, Object.keys(userInfo).length ? userInfo : undefined)
      } else if (Platform.OS === 'web') {
        // Web: use Apple JS SDK
        await handleAppleSignInWeb()
      }
    } catch (error) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        onError?.(t('socialLoginFailed'))
      }
    } finally {
      setLoading(null)
    }
  }, [loading, socialLogin, onError, t])

  const handleAppleSignInWeb = useCallback(async () => {
    // Dynamically load Apple JS SDK
    if (!window.AppleID) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    window.AppleID.auth.init({
      clientId: process.env.EXPO_PUBLIC_APPLE_SERVICE_ID || 'com.candid.app.web',
      scope: 'name email',
      redirectURI: window.location.origin,
      usePopup: true,
    })

    const response = await window.AppleID.auth.signIn()
    const userInfo = {}
    if (response.user) {
      const parts = [response.user.name?.firstName, response.user.name?.lastName].filter(Boolean)
      if (parts.length) userInfo.displayName = parts.join(' ')
      if (response.user.email) userInfo.email = response.user.email
    }
    await socialLogin('apple', response.authorization.id_token, Object.keys(userInfo).length ? userInfo : undefined)
  }, [socialLogin])

  const handleGoogleSignIn = useCallback(async () => {
    if (loading) return
    setLoading('google')
    try {
      if (Platform.OS === 'web') {
        await handleGoogleSignInWeb()
      } else {
        const { GoogleSignin } = require('@react-native-google-signin/google-signin')
        // Configure on first use
        GoogleSignin.configure({
          iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
        })
        await GoogleSignin.hasPlayServices()
        const response = await GoogleSignin.signIn()
        const idToken = response.data?.idToken || response.idToken
        if (!idToken) throw new Error('No identity token received from Google')
        await socialLogin('google', idToken)
      }
    } catch (error) {
      if (error.code !== 'SIGN_IN_CANCELLED' && error.code !== 'ERR_REQUEST_CANCELED') {
        onError?.(t('socialLoginFailed'))
      }
    } finally {
      setLoading(null)
    }
  }, [loading, socialLogin, onError, t])

  const handleGoogleSignInWeb = useCallback(async () => {
    // Dynamically load Google Identity Services
    if (!window.google?.accounts?.id) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    return new Promise((resolve, reject) => {
      window.google.accounts.id.initialize({
        client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
        callback: async (response) => {
          try {
            await socialLogin('google', response.credential)
            resolve()
          } catch (error) {
            reject(error)
          }
        },
        // Use FedCM where available (Chrome 117+), falls back to One Tap
        use_fedcm_for_prompt: true,
      })
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          reject(new Error('Google sign-in prompt was not displayed'))
        }
      })
    })
  }, [socialLogin])

  const showApple = Platform.OS === 'ios' || Platform.OS === 'web'

  if (!isSocialLoginEnabled()) return null

  return (
    <View style={styles.container}>
      {/* Apple Sign In — iOS native + web */}
      {showApple && Platform.OS === 'ios' && (
        <AppleButtonNative
          isDark={isDark}
          loading={loading === 'apple'}
          onPress={handleAppleSignIn}
          styles={styles}
          t={t}
        />
      )}
      {showApple && Platform.OS === 'web' && (
        <Pressable
          style={[styles.appleButton, isDark && styles.appleButtonDark]}
          onPress={handleAppleSignIn}
          disabled={!!loading}
          accessibilityRole="button"
          accessibilityLabel={t('signInWithAppleA11y')}
          accessibilityState={{ disabled: !!loading }}
        >
          <ThemedText
            variant="button"
            style={[styles.appleButtonText, isDark && styles.appleButtonTextDark]}
          >
            {loading === 'apple' ? '...' : t('signInWithApple')}
          </ThemedText>
        </Pressable>
      )}

      {/* Google Sign In — all platforms */}
      <Pressable
        style={[styles.googleButton]}
        onPress={handleGoogleSignIn}
        disabled={!!loading}
        accessibilityRole="button"
        accessibilityLabel={t('signInWithGoogleA11y')}
        accessibilityState={{ disabled: !!loading }}
      >
        <View style={styles.googleButtonContent}>
          <Image source={GOOGLE_LOGO} style={styles.googleLogo} />
          <ThemedText variant="button" style={styles.googleButtonText}>
            {loading === 'google' ? '...' : t('signInWithGoogle')}
          </ThemedText>
        </View>
      </Pressable>

      {/* Divider */}
      {showDivider && (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.dividerText}>
            {t('orDivider')}
          </ThemedText>
          <View style={styles.dividerLine} />
        </View>
      )}
    </View>
  )
}

// Native Apple button (iOS only) — uses expo-apple-authentication
function AppleButtonNative({ isDark, loading, onPress, styles, t }) {
  const AppleAuthentication = require('expo-apple-authentication')

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={
        isDark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={30}
      style={styles.appleNativeButton}
      onPress={onPress}
      disabled={loading}
    />
  )
}

export default SocialLoginButtons

const createStyles = (colors, isDark) => StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
    alignItems: 'center',
  },
  // Apple button (web fallback)
  appleButton: {
    width: '100%',
    height: 48,
    borderRadius: 30,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleButtonDark: {
    backgroundColor: '#FFFFFF',
  },
  appleButtonText: {
    color: '#FFFFFF',
  },
  appleButtonTextDark: {
    color: '#000000',
  },
  // Apple native button (iOS)
  appleNativeButton: {
    width: '100%',
    height: 48,
  },
  // Google button
  googleButton: {
    width: '100%',
    height: 48,
    borderRadius: 30,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    color: colors.darkText,
  },
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    marginHorizontal: 16,
  },
})

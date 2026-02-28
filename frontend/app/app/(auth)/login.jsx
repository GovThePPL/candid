import { StyleSheet, Platform, View, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { Link } from 'expo-router'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'
import { useUser } from '../../hooks/useUser'
import { translateError } from '../../lib/api'
import * as keycloak from '../../lib/keycloak'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import Spacer from '../../components/Spacer'
import ThemedButton from '../../components/ThemedButton'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import LanguagePicker from '../../components/LanguagePicker'
import SocialLoginButtons, { isSocialLoginEnabled } from '../../components/SocialLoginButtons'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'

const TIMING_CONFIG = { duration: 300, easing: Easing.out(Easing.cubic) }

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [loading, setLoading] = useState(false)
  const [centerMinHeight, setCenterMinHeight] = useState(0)
  const socialLoginEnabled = isSocialLoginEnabled()
  const [showCredentials, setShowCredentials] = useState(!socialLoginEnabled)
  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { login, pendingSocialLogin, completeSocialSignup, clearPendingSocialLogin } = useUser()
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  // Phone verification state for social login 202 flow
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [phoneStep, setPhoneStep] = useState('phone') // 'phone' | 'code'
  const [resendCountdown, setResendCountdown] = useState(0)
  const countdownRef = useRef(null)

  const scrollRef = useRef(null)
  const centerY = useRef(0)
  const formLayout = useRef({ y: 0, height: 0 })
  const centerMeasured = useRef(false)

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const startResendCountdown = useCallback(() => {
    setResendCountdown(60)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          countdownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // Animation: 0 = social view, 1 = credential view
  const progress = useSharedValue(socialLoginEnabled ? 0 : 1)

  const socialViewStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    height: progress.value === 1 ? 0 : 'auto',
    overflow: 'hidden',
  }))

  const credentialViewStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    height: progress.value === 0 ? 0 : 'auto',
    overflow: 'hidden',
  }))

  const handleShowCredentials = useCallback(() => {
    setShowCredentials(true)
    progress.value = withTiming(1, TIMING_CONFIG)
  }, [progress])

  const handleBackToSocial = useCallback(() => {
    setShowCredentials(false)
    setError(null)
    progress.value = withTiming(0, TIMING_CONFIG)
  }, [progress])

  // Scroll to form when keyboard opens (both native and web)
  useEffect(() => {
    if (keyboardHeight > 0) {
      const delay = Platform.OS === 'web' ? 300 : 50
      const timer = setTimeout(() => {
        const formBottom = centerY.current + formLayout.current.y + formLayout.current.height
        let visibleHeight
        if (Platform.OS === 'web') {
          const vv = window.visualViewport
          const init = webInitialHeight || window.innerHeight
          const actualKB = vv ? (init - vv.height) : 0
          visibleHeight = actualKB > 150 ? vv.height : init - keyboardHeight
        } else {
          visibleHeight = screenHeight - keyboardHeight
        }
        // Extra margin (60px) accounts for iOS password autofill bar above keyboard
        const target = formBottom - visibleHeight + 60
        if (target > 0) {
          scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true })
        }
      }, delay)
      return () => clearTimeout(timer)
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
    }
  }, [keyboardHeight, screenHeight, webInitialHeight])

  const handleLogin = async () => {
    setError(null)

    if (!username.trim() || !password) {
      setError(t('usernamePasswordRequired'))
      return
    }

    setLoading(true)

    try {
      await login(username.trim(), password)
    } catch (error) {
      setError(translateError(error.message, t) || t('loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  // --- Phone verification for social login 202 flow ---
  const handleSendPhoneCode = async () => {
    setError(null)
    if (!phoneNumber.trim()) { setError(t('phoneRequired')); return }
    setSendingCode(true)
    try {
      await keycloak.sendPhoneVerification(phoneNumber.trim())
      setPhoneStep('code')
      startResendCountdown()
    } catch (err) {
      setError(translateError(err.message, t) || err.message)
    } finally { setSendingCode(false) }
  }

  const handleResendCode = async () => {
    setError(null)
    setSendingCode(true)
    try {
      await keycloak.sendPhoneVerification(phoneNumber.trim())
      startResendCountdown()
    } catch (err) {
      setError(translateError(err.message, t) || err.message)
    } finally { setSendingCode(false) }
  }

  const handleVerifyAndComplete = async () => {
    setError(null)
    if (!verificationCode.trim()) { setError(t('verificationFailed')); return }
    setLoading(true)
    try {
      const { verifyToken } = await keycloak.confirmPhoneVerification(
        phoneNumber.trim(), verificationCode.trim()
      )
      await completeSocialSignup(phoneNumber.trim(), verifyToken)
    } catch (err) {
      setError(translateError(err.message, t) || err.message)
    } finally { setLoading(false) }
  }

  const handleCancelSocialPhone = () => {
    clearPendingSocialLogin()
    setPhoneNumber('')
    setVerificationCode('')
    setPhoneStep('phone')
    setError(null)
  }

  const showPhoneVerification = !!pendingSocialLogin

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8 },
          Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.languageOverlay, { top: insets.top + 8 }]}>
          <LanguagePicker variant="dropdown" />
        </View>

        {/* Centering wrapper — flex:1 fills available space, justifyContent centers logo+form */}
        <View
          style={[styles.centerWrapper, { minHeight: centerMinHeight }]}
          onLayout={(e) => {
            centerY.current = e.nativeEvent.layout.y
            if (!centerMeasured.current && !keyboardHeight) {
              setCenterMinHeight(e.nativeEvent.layout.height)
              centerMeasured.current = true
            }
          }}
        >
          <View style={styles.logoContainer}>
            <ThemedText variant="brand" color="primary" style={styles.logo}>{' Candid '}</ThemedText>
            <Spacer height={8} />
            <ThemedText variant="body" color="secondary" style={styles.subtitle}>
              {t('welcomeSubtitle')}
            </ThemedText>
          </View>

          <Spacer height={24} />

          {showPhoneVerification ? (
            <>
              <ThemedText variant="h1" title={true} style={styles.title}>
                {phoneStep === 'phone' ? t('phoneVerificationRequired') : t('verificationTitle')}
              </ThemedText>
              <Spacer height={16} />
              <View
                style={styles.formContainer}
                onLayout={(e) => {
                  formLayout.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }
                }}
              >
                {phoneStep === 'phone' ? (
                  <>
                    <ThemedTextInput
                      style={styles.input}
                      placeholder={t('phonePlaceholder')}
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      returnKeyType="done"
                      onSubmitEditing={handleSendPhoneCode}
                      accessibilityLabel={t('phoneInputA11y')}
                      accessibilityRole="none"
                    />
                    <ThemedText variant="bodySmall" color="secondary" style={styles.phoneHint}>
                      {t('phoneHint')}
                    </ThemedText>
                    <Spacer height={8} />
                    <ThemedButton
                      onPress={handleSendPhoneCode}
                      disabled={sendingCode}
                      style={styles.button}
                      accessibilityLabel={t('sendCodeA11y')}
                      accessibilityRole="button"
                    >
                      <ThemedText variant="button" color="inverse">
                        {sendingCode ? t('sendingCode') : t('sendCode')}
                      </ThemedText>
                    </ThemedButton>
                    <ThemedButton variant="text" onPress={handleCancelSocialPhone} accessibilityRole="button">
                      <ThemedText variant="buttonSmall" color="primary">{t('backToForm')}</ThemedText>
                    </ThemedButton>
                  </>
                ) : (
                  <>
                    <ThemedText variant="body" color="secondary" style={styles.verifySubtitle}>
                      {t('verificationSubtitle', { phone: phoneNumber.trim() })}
                    </ThemedText>
                    <ThemedTextInput
                      style={styles.input}
                      placeholder={t('codePlaceholder')}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyAndComplete}
                      accessibilityLabel={t('codeInputA11y')}
                      accessibilityRole="none"
                    />
                    <Spacer height={8} />
                    <ThemedButton
                      onPress={handleVerifyAndComplete}
                      disabled={loading}
                      style={styles.button}
                      accessibilityRole="button"
                    >
                      <ThemedText variant="button" color="inverse">
                        {loading ? t('verifying') : t('verifyAndCreate')}
                      </ThemedText>
                    </ThemedButton>
                    <View style={styles.verifyActions}>
                      <ThemedButton
                        variant="text"
                        onPress={handleResendCode}
                        disabled={resendCountdown > 0 || sendingCode}
                        accessibilityLabel={t('resendCodeA11y')}
                        accessibilityRole="button"
                      >
                        <ThemedText variant="buttonSmall" color={resendCountdown > 0 ? 'secondary' : 'primary'}>
                          {resendCountdown > 0 ? t('resendIn', { seconds: resendCountdown }) : t('resendCode')}
                        </ThemedText>
                      </ThemedButton>
                      <ThemedButton variant="text" onPress={handleCancelSocialPhone} accessibilityRole="button">
                        <ThemedText variant="buttonSmall" color="primary">{t('backToForm')}</ThemedText>
                      </ThemedButton>
                    </View>
                  </>
                )}
              </View>

              {error && (
                <View style={styles.errorContainer}>
                  <ThemedText variant="bodySmall" style={styles.error}>{error}</ThemedText>
                </View>
              )}

              <Spacer height={20} />
              <Link href="/register" replace>
                <ThemedText variant="bodySmall" color="secondary">
                  {t('noAccount')} <ThemedText variant="buttonSmall" color="primary">{t('createAccountLink')}</ThemedText>
                </ThemedText>
              </Link>
            </>
          ) : socialLoginEnabled ? (
            <>
              {/* Social login view — fades out when switching to credentials */}
              {!showCredentials && (
                <Animated.View style={[styles.socialContainer, socialViewStyle]}>
                  <SocialLoginButtons onError={setError} showDivider={false} />
                  <Spacer height={16} />
                  <Pressable
                    style={styles.usernameLoginButton}
                    onPress={handleShowCredentials}
                    accessibilityRole="button"
                    accessibilityLabel={t('loginWithUsernameA11y')}
                  >
                    <ThemedText variant="button" color="primary">
                      {t('loginWithUsername')}
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              )}

              {/* Credential view — fades in when user taps "Login with Username" */}
              {showCredentials && (
                <Animated.View style={[styles.credentialContainer, credentialViewStyle]}>
                  <Pressable
                    onPress={handleBackToSocial}
                    accessibilityRole="button"
                    accessibilityLabel={t('backToOptionsA11y')}
                    style={styles.backLink}
                  >
                    <ThemedText variant="bodySmall" color="primary">
                      {t('backToOptions')}
                    </ThemedText>
                  </Pressable>

                  <Spacer height={12} />

                  <View
                    style={styles.formContainer}
                    onLayout={(e) => {
                      formLayout.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }
                    }}
                  >
                    <ThemedTextInput
                      style={styles.input}
                      placeholder={t('usernamePlaceholder')}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      returnKeyType="next"
                    />

                    <ThemedTextInput
                      style={styles.input}
                      placeholder={t('passwordPlaceholder')}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="password"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />

                    <Spacer height={8} />
                    <ThemedButton onPress={handleLogin} disabled={loading} style={styles.button}>
                      <ThemedText variant="button" color="inverse">
                        {loading ? t('signingIn') : t('signIn')}
                      </ThemedText>
                    </ThemedButton>
                  </View>

                  {error && (
                    <View style={styles.errorContainer}>
                      <ThemedText variant="bodySmall" style={styles.error}>
                        {error}
                      </ThemedText>
                    </View>
                  )}

                  <Spacer height={20} />
                  <Link href="/register" replace>
                    <ThemedText variant="bodySmall" color="secondary">
                      {t('noAccount')} <ThemedText variant="buttonSmall" color="primary">{t('createAccountLink')}</ThemedText>
                    </ThemedText>
                  </Link>
                </Animated.View>
              )}
            </>
          ) : (
            <>
              <View
                style={styles.formContainer}
                onLayout={(e) => {
                  formLayout.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }
                }}
              >
                <ThemedTextInput
                  style={styles.input}
                  placeholder={t('usernamePlaceholder')}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  returnKeyType="next"
                />

                <ThemedTextInput
                  style={styles.input}
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />

                <Spacer height={8} />
                <ThemedButton onPress={handleLogin} disabled={loading} style={styles.button}>
                  <ThemedText variant="button" color="inverse">
                    {loading ? t('signingIn') : t('signIn')}
                  </ThemedText>
                </ThemedButton>
              </View>

              {error && (
                <View style={styles.errorContainer}>
                  <ThemedText variant="bodySmall" style={styles.error}>
                    {error}
                  </ThemedText>
                </View>
              )}

              <Spacer height={20} />
              <Link href="/register" replace>
                <ThemedText variant="bodySmall" color="secondary">
                  {t('noAccount')} <ThemedText variant="buttonSmall" color="primary">{t('createAccountLink')}</ThemedText>
                </ThemedText>
              </Link>
            </>
          )}
        </View>

        {/* Keyboard spacer — creates scroll room so form can be scrolled above keyboard */}
        {keyboardHeight > 0 && <View style={{ height: keyboardHeight }} />}
      </ScrollView>
    </ThemedView>
  )
}

export default Login

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  languageOverlay: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  centerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    fontFamily: Platform.OS === 'web' ? 'Pacifico, cursive' : 'Pacifico_400Regular',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 280,
  },
  socialContainer: {
    width: '100%',
    alignItems: 'center',
  },
  usernameLoginButton: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  credentialContainer: {
    width: '100%',
    alignItems: 'center',
  },
  backLink: {
    alignSelf: 'center',
  },
  formContainer: {
    width: "100%",
    maxWidth: 320,
    gap: 12,
  },
  input: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...Typography.button,
    fontWeight: undefined,
    backgroundColor: colors.cardBackground,
    color: colors.darkText,
  },
  button: {
    width: "100%",
  },
  title: {
    textAlign: 'center',
  },
  phoneHint: {
    textAlign: 'center',
    marginTop: -4,
  },
  verifySubtitle: {
    textAlign: 'center',
  },
  verifyActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorContainer: {
    marginTop: 12,
    width: '100%',
    maxWidth: 320,
  },
  error: {
    color: SemanticColors.warning,
    padding: 12,
    backgroundColor: colors.errorBannerBg,
    borderColor: SemanticColors.warning,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
  },
})

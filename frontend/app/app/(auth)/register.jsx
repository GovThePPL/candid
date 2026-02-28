import { StyleSheet, Platform, View, ScrollView, useWindowDimensions } from 'react-native'
import { Link } from 'expo-router'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

const SMS_ENABLED = process.env.EXPO_PUBLIC_SMS_ENABLED === 'true'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [centerMinHeight, setCenterMinHeight] = useState(0)
  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Phone verification state (step 2)
  const [step, setStep] = useState('form') // 'form' | 'verify'
  const [verificationCode, setVerificationCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const countdownRef = useRef(null)

  const { register } = useUser()
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const scrollRef = useRef(null)
  const centerY = useRef(0)
  const formLayout = useRef({ y: 0, height: 0 })
  const centerMeasured = useRef(false)

  // Clean up countdown timer
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Start 60s resend countdown
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

  // Validate form fields (shared between direct register and send-code)
  const validateForm = () => {
    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()

    if (!trimmedUsername) {
      setError(t('usernameRequired'))
      return false
    }
    if (trimmedUsername.length < 3) {
      setError(t('usernameMinLength'))
      return false
    }
    if (!trimmedEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(trimmedEmail)) {
      setError(t('emailRequired'))
      return false
    }
    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return false
    }
    if (SMS_ENABLED && !phoneNumber.trim()) {
      setError(t('phoneRequired'))
      return false
    }
    return true
  }

  // Step 1: Send verification code
  const handleSendCode = async () => {
    setError(null)
    if (!validateForm()) return

    setSendingCode(true)
    try {
      await keycloak.sendPhoneVerification(phoneNumber.trim())
      setStep('verify')
      startResendCountdown()
    } catch (err) {
      setError(translateError(err.message, t) || err.message)
    } finally {
      setSendingCode(false)
    }
  }

  // Resend code
  const handleResendCode = async () => {
    setError(null)
    setSendingCode(true)
    try {
      await keycloak.sendPhoneVerification(phoneNumber.trim())
      startResendCountdown()
    } catch (err) {
      setError(translateError(err.message, t) || err.message)
    } finally {
      setSendingCode(false)
    }
  }

  // Step 2: Verify code and create account
  const handleVerifyAndRegister = async () => {
    setError(null)
    if (!verificationCode.trim()) {
      setError(t('verificationFailed'))
      return
    }

    setLoading(true)
    try {
      // Confirm phone code → get verify token
      const { verifyToken } = await keycloak.confirmPhoneVerification(
        phoneNumber.trim(), verificationCode.trim()
      )
      // Register with phone fields
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        phoneNumber: phoneNumber.trim(),
        phoneVerifyToken: verifyToken,
      })
    } catch (err) {
      setError(translateError(err.message, t) || t('registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  // Register without phone (SMS disabled)
  const handleRegister = async () => {
    setError(null)
    if (!validateForm()) return

    setLoading(true)
    try {
      await register({ username: username.trim(), email: email.trim(), password })
    } catch (err) {
      setError(translateError(err.message, t) || t('registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  // Back to form from verification step
  const handleBackToForm = () => {
    setStep('form')
    setVerificationCode('')
    setError(null)
  }

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

          <Spacer height={16} />
          {step === 'form' && isSocialLoginEnabled() && <SocialLoginButtons onError={setError} />}

          <ThemedText variant="h1" title={true} style={styles.title}>
            {step === 'form' ? t('createAccountTitle') : t('verificationTitle')}
          </ThemedText>

          <Spacer height={16} />
          <View
            style={styles.formContainer}
            onLayout={(e) => {
              formLayout.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }
            }}
          >
            {step === 'form' ? (
              <>
                <ThemedTextInput
                  style={styles.input}
                  placeholder={t('usernamePlaceholder')}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username-new"
                  returnKeyType="next"
                />

                <ThemedTextInput
                  style={styles.input}
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                />

                <ThemedTextInput
                  style={styles.input}
                  placeholder={t('passwordMinPlaceholder')}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  returnKeyType={SMS_ENABLED ? 'next' : 'done'}
                  onSubmitEditing={SMS_ENABLED ? undefined : handleRegister}
                />

                {SMS_ENABLED && (
                  <>
                    <ThemedTextInput
                      style={styles.input}
                      placeholder={t('phonePlaceholder')}
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      returnKeyType="done"
                      accessibilityLabel={t('phoneInputA11y')}
                      accessibilityRole="none"
                    />
                    <ThemedText variant="bodySmall" color="secondary" style={styles.phoneHint}>
                      {t('phoneHint')}
                    </ThemedText>
                  </>
                )}

                <Spacer height={8} />
                <ThemedButton
                  onPress={SMS_ENABLED ? handleSendCode : handleRegister}
                  disabled={loading || sendingCode}
                  style={styles.button}
                  accessibilityLabel={SMS_ENABLED ? t('sendCodeA11y') : undefined}
                  accessibilityRole="button"
                >
                  <ThemedText variant="button" color="inverse">
                    {sendingCode ? t('sendingCode')
                      : loading ? t('creatingAccount')
                      : SMS_ENABLED ? t('sendCode')
                      : t('createAccount')}
                  </ThemedText>
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
                  onSubmitEditing={handleVerifyAndRegister}
                  accessibilityLabel={t('codeInputA11y')}
                  accessibilityRole="none"
                />

                <Spacer height={8} />
                <ThemedButton
                  onPress={handleVerifyAndRegister}
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

                  <ThemedButton variant="text" onPress={handleBackToForm} accessibilityRole="button">
                    <ThemedText variant="buttonSmall" color="primary">
                      {t('backToForm')}
                    </ThemedText>
                  </ThemedButton>
                </View>
              </>
            )}
          </View>

          {/* Error + link — inside center wrapper so they stay near the form */}
          {error && (
            <View style={styles.errorContainer}>
              <ThemedText variant="bodySmall" style={styles.error}>
                {error}
              </ThemedText>
            </View>
          )}

          <Spacer height={20} />
          <Link href="/login" replace>
            <ThemedText variant="bodySmall" color="secondary">
              {t('hasAccount')} <ThemedText variant="buttonSmall" color="primary">{t('signInLink')}</ThemedText>
            </ThemedText>
          </Link>
        </View>

        {/* Keyboard spacer — creates scroll room so form can be scrolled above keyboard */}
        {keyboardHeight > 0 && <View style={{ height: keyboardHeight }} />}
      </ScrollView>
    </ThemedView>
  )
}

export default Register

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
  title: {
    textAlign: "center",
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

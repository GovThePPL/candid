import { StyleSheet, Platform, View, ScrollView, useWindowDimensions } from 'react-native'
import { Link } from 'expo-router'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '../../hooks/useUser'
import { translateError } from '../../lib/api'

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
import useKeyboardHeight from '../../hooks/useKeyboardHeight'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [centerMinHeight, setCenterMinHeight] = useState(0)
  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { register } = useUser()
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const scrollRef = useRef(null)
  const centerY = useRef(0)
  const formLayout = useRef({ y: 0, height: 0 })
  const centerMeasured = useRef(false)

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
        const target = formBottom - visibleHeight + 20
        if (target > 0) {
          scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true })
        }
      }, delay)
      return () => clearTimeout(timer)
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
    }
  }, [keyboardHeight, screenHeight, webInitialHeight])

  const handleRegister = async () => {
    setError(null)

    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()

    if (!trimmedUsername) {
      setError(t('usernameRequired'))
      return
    }
    if (trimmedUsername.length < 3) {
      setError(t('usernameMinLength'))
      return
    }
    if (!trimmedEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(trimmedEmail)) {
      setError(t('emailRequired'))
      return
    }
    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }

    setLoading(true)

    try {
      await register({ username: trimmedUsername, email: trimmedEmail, password })
    } catch (error) {
      setError(translateError(error.message, t) || t('registrationFailed'))
    } finally {
      setLoading(false)
    }
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
          </View>

          <Spacer height={16} />
          <ThemedText variant="h1" title={true} style={styles.title}>
            {t('createAccountTitle')}
          </ThemedText>

          <Spacer height={16} />
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
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />

            <Spacer height={8} />
            <ThemedButton onPress={handleRegister} disabled={loading} style={styles.button}>
              <ThemedText variant="button" color="inverse">
                {loading ? t('creatingAccount') : t('createAccount')}
              </ThemedText>
            </ThemedButton>
          </View>
        </View>

        {/* Below centered area — error + link */}
        {error && (
          <View style={styles.errorContainer}>
            <ThemedText variant="bodySmall" style={styles.error}>
              {error}
            </ThemedText>
          </View>
        )}

        <Spacer height={24} />
        <Link href="/login" replace>
          <ThemedText variant="bodySmall" color="secondary">
            {t('hasAccount')} <ThemedText variant="buttonSmall" color="primary">{t('signInLink')}</ThemedText>
          </ThemedText>
        </Link>
        <Spacer height={20} />

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
    marginBottom: 0,
  },
  logo: {
    fontFamily: Platform.OS === 'web' ? 'Pacifico, cursive' : 'Pacifico_400Regular',
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
    borderRadius: 12,
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

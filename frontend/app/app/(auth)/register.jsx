import { StyleSheet, Platform, View, KeyboardAvoidingView, ScrollView } from 'react-native'
import { Link } from 'expo-router'
import { useState, useMemo } from 'react'
import { useUser } from '../../hooks/useUser'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import Spacer from '../../components/Spacer'
import ThemedButton from '../../components/ThemedButton'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { register } = useUser()

  const handleRegister = async () => {
    setError(null)

    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()

    if (!trimmedUsername) {
      setError('Username is required')
      return
    }
    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (!trimmedEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(trimmedEmail)) {
      setError('A valid email is required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      await register({ username: trimmedUsername, email: trimmedEmail, password })
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <ThemedText variant="brand" color="primary" style={styles.logo}>Candid</ThemedText>
          </View>

          <Spacer height={30} />
          <ThemedText variant="h1" title={true} style={styles.title}>
            Create an Account
          </ThemedText>

          <ThemedText variant="body" style={styles.subtitle}>
            Join the conversation on issues that matter
          </ThemedText>

          <Spacer height={24} />
          <View style={styles.formContainer}>
            <ThemedTextInput
              style={styles.input}
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              returnKeyType="next"
            />

            <ThemedTextInput
              style={styles.input}
              placeholder="Email"
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
              placeholder="Password (min 8 characters)"
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
                {loading ? 'Creating Account...' : 'Create Account'}
              </ThemedText>
            </ThemedButton>
          </View>

          {/* Error container - always present to prevent layout shift */}
          <View style={styles.errorContainer}>
            <ThemedText variant="bodySmall" style={[styles.error, !error && styles.errorHidden]}>
              {error || 'Placeholder'}
            </ThemedText>
          </View>

          <Spacer height={24} />
          <Link href="/login" replace>
            <ThemedText variant="bodySmall" color="secondary">
              Already have an account? <ThemedText variant="buttonSmall" color="primary">Sign In</ThemedText>
            </ThemedText>
          </Link>
          <Spacer height={40} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default Register

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logo: {
    ...Platform.select({
      web: {
        fontFamily: 'Pacifico, cursive',
      },
      default: {
        // Fallback for native
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontWeight: '600',
      },
    }),
  },
  title: {
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 280,
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
    paddingVertical: 16,
    borderRadius: 12,
  },
  errorContainer: {
    height: 60,
    justifyContent: 'center',
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
  errorHidden: {
    opacity: 0,
  },
})

import { StyleSheet, Platform, View, KeyboardAvoidingView } from 'react-native'
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

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [loading, setLoading] = useState(false)
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { login } = useUser()

  const handleLogin = async () => {
    setError(null)

    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }

    setLoading(true)

    try {
      await login(username.trim(), password)
    } catch (error) {
      setError(error.message || 'Login failed. Please try again.')
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
        <View style={styles.logoContainer}>
          <ThemedText variant="brand" color="primary" style={styles.logo}>Candid</ThemedText>
        </View>

        <Spacer height={30} />
        <ThemedText variant="h1" title={true} style={styles.title}>
          Welcome to Candid
        </ThemedText>

        <ThemedText variant="body" style={styles.subtitle}>
          Peaceful and productive discussion of issues that matter
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
            autoComplete="username"
            returnKeyType="next"
          />

          <ThemedTextInput
            style={styles.input}
            placeholder="Password"
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
              {loading ? 'Signing in...' : 'Sign In'}
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
        <Link href="/register" replace>
          <ThemedText variant="bodySmall" color="secondary" style={styles.registerLink}>
            Don't have an account? <ThemedText variant="buttonSmall" color="primary">Create Account</ThemedText>
          </ThemedText>
        </Link>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default Login

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
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

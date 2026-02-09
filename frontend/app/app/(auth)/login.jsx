import { StyleSheet, Text, Platform, View, KeyboardAvoidingView } from 'react-native'
import { Link } from 'expo-router'
import { useState } from 'react'
import { useUser } from '../../hooks/useUser'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import Spacer from '../../components/Spacer'
import ThemedButton from '../../components/ThemedButton'
import { Colors } from '../../constants/Colors'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [loading, setLoading] = useState(false)

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
          <Text style={styles.logo}>Candid</Text>
        </View>

        <Spacer height={30} />
        <ThemedText title={true} style={styles.title}>
          Welcome to Candid
        </ThemedText>

        <ThemedText style={styles.subtitle}>
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
            <Text style={styles.buttonText}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </ThemedButton>
        </View>

        {/* Error container - always present to prevent layout shift */}
        <View style={styles.errorContainer}>
          <Text style={[styles.error, !error && styles.errorHidden]}>
            {error || 'Placeholder'}
          </Text>
        </View>

        <Spacer height={24} />
        <Link href="/register" replace>
          <Text style={styles.registerLink}>
            Don't have an account? <Text style={styles.registerLinkBold}>Create Account</Text>
          </Text>
        </Link>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default Login

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
    fontSize: 56,
    color: Colors.primary,
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
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 14,
    color: Colors.pass,
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
    borderColor: Colors.cardBorder,
    fontSize: 16,
    backgroundColor: Colors.white,
    color: Colors.darkText,
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    height: 60,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
  },
  error: {
    color: Colors.warning,
    padding: 12,
    backgroundColor: '#ffe6e6',
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
  },
  errorHidden: {
    opacity: 0,
  },
  registerLink: {
    color: Colors.pass,
    fontSize: 14,
  },
  registerLinkBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
})

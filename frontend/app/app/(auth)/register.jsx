import { StyleSheet, Text, Platform, View, KeyboardAvoidingView, ScrollView } from 'react-native'
import { Link } from 'expo-router'
import { useState } from 'react'
import { useUser } from '../../hooks/useUser'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import Spacer from '../../components/Spacer'
import ThemedButton from '../../components/ThemedButton'
import { Colors } from '../../constants/Colors'

const Register = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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
            <Text style={styles.logo}>Candid</Text>
          </View>

          <Spacer height={30} />
          <ThemedText title={true} style={styles.title}>
            Create an Account
          </ThemedText>

          <ThemedText style={styles.subtitle}>
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
              <Text style={styles.buttonText}>
                {loading ? 'Creating Account...' : 'Create Account'}
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
          <Link href="/login" replace>
            <Text style={styles.loginLink}>
              Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
          </Link>
          <Spacer height={40} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default Register

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
  loginLink: {
    color: Colors.pass,
    fontSize: 14,
  },
  loginLinkBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
})

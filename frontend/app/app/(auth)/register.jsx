import { Keyboard, StyleSheet, Text, Pressable, Platform, View } from 'react-native'
import { Link } from 'expo-router'
import { useState, useRef } from 'react'
import { useUser } from '../../hooks/useUser'

import ThemedView from '../../components/ThemedView'
import ThemedText from '../../components/ThemedText'
import Spacer from '../../components/Spacer'
import ThemedButton from '../../components/ThemedButton'
import ThemedTextInput from "../../components/ThemedTextInput"
import { Colors } from '../../constants/Colors'

const Register = () => {
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const displayNameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  const { register } = useUser()

  const handleSubmit = async () => {
    if (!username || !displayName || !password) {
      setError('Please fill in all required fields')
      return
    }

    setError(null)
    setLoading(true)

    try {
      await register(username, displayName, password, email || null)
    } catch (error) {
      // Convert technical error messages to user-friendly ones
      let message = error.message || 'Registration failed. Please try again.'
      if (message.toUpperCase() === 'CONFLICT') {
        message = 'Username is already taken'
      } else if (message.toUpperCase() === 'BAD REQUEST') {
        message = 'Please check your information and try again'
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const dismissKeyboard = () => {
    if (Platform.OS !== 'web') {
      Keyboard.dismiss()
    }
  }

  return (
    <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
      <ThemedView style={styles.container}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>Candid</Text>
        </View>

        <Spacer height={40} />
        <ThemedText title={true} style={styles.title}>
          Create an Account
        </ThemedText>

        <Spacer height={20} />
        <ThemedTextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => displayNameRef.current?.focus()}
        />

        <ThemedTextInput
          ref={displayNameRef}
          style={styles.input}
          placeholder="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />

        <ThemedTextInput
          ref={emailRef}
          style={styles.input}
          placeholder="Email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <ThemedTextInput
          ref={passwordRef}
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={true}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <ThemedButton onPress={handleSubmit} disabled={loading} style={styles.button}>
          <Text style={styles.buttonText}>
            {loading ? 'Creating Account...' : 'Register'}
          </Text>
        </ThemedButton>

        {/* Error container - always present to prevent layout shift */}
        <View style={styles.errorContainer}>
          <Text style={[styles.error, !error && styles.errorHidden]}>
            {error || 'Placeholder'}
          </Text>
        </View>

        <Spacer height={44} />
        <Link href="/login" replace>
          <Text style={styles.loginLink}>
            Already have an account? <Text style={styles.loginLinkBold}>Login</Text>
          </Text>
        </Link>

      </ThemedView>
    </Pressable>
  )
}

export default Register

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
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
  input: {
    marginBottom: 16,
    width: "100%",
    maxWidth: 320,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    color: '#1a1a1a',
  },
  button: {
    width: "100%",
    maxWidth: 320,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
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

/**
 * Keycloak OIDC authentication for Expo using Authorization Code + PKCE.
 *
 * Uses expo-auth-session for the browser-based login flow and manages
 * token storage/refresh via AsyncStorage.
 */

import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Complete the auth session when returning from the browser
WebBrowser.maybeCompleteAuthSession()

// Keycloak configuration
const KEYCLOAK_URL = process.env.EXPO_PUBLIC_KEYCLOAK_URL
  || (__DEV__ ? 'http://localhost:8180' : 'https://auth.candid.app')

const KEYCLOAK_REALM = 'candid'
const CLIENT_ID = 'candid-app'

const REFRESH_TOKEN_KEY = 'candid_refresh_token'

// OIDC discovery document
const discovery = {
  authorizationEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
  endSessionEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
}

// Redirect URI for the app
const redirectUri = AuthSession.makeRedirectUri({ scheme: 'candid' })

// Backend API URL (proxies ROPC to Keycloak to avoid CORS issues)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
  || (__DEV__ ? 'http://localhost:8000/api/v1' : 'https://api.candid.app/api/v1')

/**
 * Login via ROPC (Resource Owner Password Credentials).
 * Proxied through the backend API to avoid browser CORS issues.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export async function loginWithCredentials(username, password) {
  const response = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Invalid username or password')
  }

  const data = await response.json()

  if (data.refresh_token) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  }
}

/**
 * Start the Keycloak login flow (Authorization Code + PKCE).
 * Opens the system browser for authentication.
 * Kept as fallback for browser-based login.
 *
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export async function login() {
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  })

  const result = await request.promptAsync(discovery)

  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' ? 'Login cancelled' : 'Login failed')
  }

  // Exchange authorization code for tokens
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    discovery
  )

  // Store refresh token for later use
  if (tokenResponse.refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refreshToken)
  }

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
  }
}

/**
 * Start the Keycloak registration flow.
 * Opens the Keycloak registration page in the browser.
 * Kept as fallback for browser-based registration.
 *
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export async function register() {
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams: {
      // Keycloak-specific: go directly to registration page
      kc_action: 'REGISTER',
    },
  })

  const result = await request.promptAsync(discovery)

  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' ? 'Registration cancelled' : 'Registration failed')
  }

  // Exchange authorization code for tokens
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    discovery
  )

  if (tokenResponse.refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refreshToken)
  }

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
  }
}

/**
 * Refresh the access token using a stored refresh token.
 *
 * @returns {Promise<{accessToken: string, refreshToken: string} | null>}
 *   Returns new tokens or null if refresh is not possible.
 */
export async function refreshToken() {
  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY)
  if (!storedRefreshToken) {
    return null
  }

  try {
    const tokenResponse = await AuthSession.refreshAsync(
      {
        clientId: CLIENT_ID,
        refreshToken: storedRefreshToken,
      },
      discovery
    )

    // Update stored refresh token (Keycloak may rotate it)
    if (tokenResponse.refreshToken) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refreshToken)
    }

    return {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
    }
  } catch (error) {
    console.warn('[Keycloak] Token refresh failed:', error.message)
    // Clear invalid refresh token
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY)
    return null
  }
}

/**
 * Log out by ending the Keycloak session and clearing local tokens.
 */
export async function logout() {
  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY)
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY)

  // Attempt to end the Keycloak session (best-effort)
  if (storedRefreshToken) {
    try {
      await fetch(discovery.endSessionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          refresh_token: storedRefreshToken,
        }).toString(),
      })
    } catch {
      // Ignore errors - local cleanup is sufficient
    }
  }
}

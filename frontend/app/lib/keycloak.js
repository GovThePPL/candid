/**
 * Keycloak OIDC authentication for Expo using Authorization Code + PKCE.
 *
 * Uses expo-auth-session for the browser-based login flow and manages
 * token storage/refresh via AsyncStorage.
 */

import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStorage'

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
    await setSecureItem(REFRESH_TOKEN_KEY, data.refresh_token)
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
    await setSecureItem(REFRESH_TOKEN_KEY, tokenResponse.refreshToken)
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
    await setSecureItem(REFRESH_TOKEN_KEY, tokenResponse.refreshToken)
  }

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
  }
}

/**
 * Login via social identity token (Apple / Google).
 * Sends the provider's identity token to the backend for validation,
 * user creation/linking, and Keycloak token exchange.
 *
 * @param {string} provider - 'apple' or 'google'
 * @param {string} identityToken - JWT from the provider's SDK
 * @param {object} [userInfo] - Optional user info (Apple provides name only on first sign-in)
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export async function loginWithSocialToken(provider, identityToken, userInfo) {
  const response = await fetch(`${API_BASE_URL}/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      identityToken,
      ...(userInfo ? { userInfo } : {}),
    }),
  })

  const data = await response.json().catch(() => ({}))

  // 202 = new user, phone verification required
  if (response.status === 202) {
    return {
      phoneVerificationRequired: true,
      pendingToken: data.pendingToken,
    }
  }

  if (!response.ok) {
    throw new Error(data.detail || 'Social login failed')
  }

  if (data.refresh_token) {
    await setSecureItem(REFRESH_TOKEN_KEY, data.refresh_token)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  }
}

/**
 * Send a phone verification SMS code.
 *
 * @param {string} phoneNumber
 * @returns {Promise<{message: string}>}
 */
export async function sendPhoneVerification(phoneNumber) {
  const response = await fetch(`${API_BASE_URL}/auth/phone-verifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.detail || 'Failed to send verification code')
  }
  return data
}

/**
 * Confirm a phone verification code and get a verify token.
 *
 * @param {string} phoneNumber
 * @param {string} code - 6-digit code
 * @returns {Promise<{verifyToken: string}>}
 */
export async function confirmPhoneVerification(phoneNumber, code) {
  const response = await fetch(`${API_BASE_URL}/auth/phone-confirmations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.detail || 'Verification failed')
  }
  return data
}

/**
 * Complete a social login registration after phone verification.
 *
 * @param {string} pendingToken - JWT from 202 social login response
 * @param {string} phoneNumber
 * @param {string} phoneVerifyToken
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export async function completeSocialRegistration(pendingToken, phoneNumber, phoneVerifyToken) {
  const response = await fetch(`${API_BASE_URL}/auth/social-registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingToken, phoneNumber, phoneVerifyToken }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.detail || 'Registration failed')
  }

  if (data.refresh_token) {
    await setSecureItem(REFRESH_TOKEN_KEY, data.refresh_token)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  }
}

/**
 * Refresh the access token using a stored refresh token.
 * Proxied through the backend API to keep the Keycloak issuer consistent
 * with login (avoids issuer mismatch between Docker-internal and external URLs).
 *
 * @returns {Promise<{accessToken: string, refreshToken: string} | null>}
 *   Returns new tokens or null if refresh is not possible.
 */
export async function refreshToken() {
  const storedRefreshToken = await getSecureItem(REFRESH_TOKEN_KEY)
  if (!storedRefreshToken) {
    return null
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: storedRefreshToken }),
    })

    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.status}`)
    }

    const data = await response.json()

    // Update stored refresh token (Keycloak may rotate it)
    if (data.refresh_token) {
      await setSecureItem(REFRESH_TOKEN_KEY, data.refresh_token)
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }
  } catch (error) {
    console.warn('[Keycloak] Token refresh failed:', error.message)
    // Clear invalid refresh token
    await deleteSecureItem(REFRESH_TOKEN_KEY)
    return null
  }
}

/**
 * Log out by ending the Keycloak session and clearing local tokens.
 */
export async function logout() {
  const storedRefreshToken = await getSecureItem(REFRESH_TOKEN_KEY)
  await deleteSecureItem(REFRESH_TOKEN_KEY)

  // End the Keycloak session via backend proxy (best-effort).
  // Uses the backend proxy so the request reaches Keycloak at the same
  // internal hostname used for login/refresh, avoiding issuer mismatches.
  if (storedRefreshToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      })
    } catch {
      // Ignore network errors - local cleanup is sufficient
    }
  }
}

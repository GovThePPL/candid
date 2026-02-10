import AsyncStorage from '@react-native-async-storage/async-storage'

// Mock expo-auth-session
const mockPromptAsync = jest.fn()
const mockExchangeCodeAsync = jest.fn()
const mockRefreshAsync = jest.fn()

jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn().mockImplementation(() => ({
    promptAsync: mockPromptAsync,
    codeVerifier: 'test-verifier',
  })),
  exchangeCodeAsync: (...args) => mockExchangeCodeAsync(...args),
  refreshAsync: (...args) => mockRefreshAsync(...args),
  makeRedirectUri: jest.fn(() => 'candid://redirect'),
  ResponseType: { Code: 'code' },
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}))

import {
  loginWithCredentials,
  login,
  register,
  refreshToken,
  logout,
} from '../../lib/keycloak'

// Mock global fetch
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.setItem.mockResolvedValue()
  AsyncStorage.removeItem.mockResolvedValue()
  global.fetch = jest.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('loginWithCredentials', () => {
  it('returns tokens on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'at-123',
        refresh_token: 'rt-456',
      }),
    })

    const result = await loginWithCredentials('user', 'pass')
    expect(result.accessToken).toBe('at-123')
    expect(result.refreshToken).toBe('rt-456')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('candid_refresh_token', 'rt-456')
  })

  it('throws on error response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Bad credentials' }),
    })

    await expect(loginWithCredentials('user', 'bad')).rejects.toThrow('Bad credentials')
  })

  it('throws default message when error has no detail', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    })

    await expect(loginWithCredentials('user', 'bad')).rejects.toThrow('Invalid username or password')
  })

  it('sends correct request body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
    })

    await loginWithCredentials('alice', 'secret')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/token'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'secret' }),
      })
    )
  })
})

describe('login (PKCE flow)', () => {
  it('returns tokens on success', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'auth-code-123' },
    })
    mockExchangeCodeAsync.mockResolvedValueOnce({
      accessToken: 'at-pkce',
      refreshToken: 'rt-pkce',
    })

    const result = await login()
    expect(result.accessToken).toBe('at-pkce')
    expect(result.refreshToken).toBe('rt-pkce')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('candid_refresh_token', 'rt-pkce')
  })

  it('throws on cancel', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'cancel' })
    await expect(login()).rejects.toThrow('Login cancelled')
  })

  it('throws on failure', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'error' })
    await expect(login()).rejects.toThrow('Login failed')
  })
})

describe('register (PKCE flow)', () => {
  it('returns tokens on success', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'reg-code' },
    })
    mockExchangeCodeAsync.mockResolvedValueOnce({
      accessToken: 'at-reg',
      refreshToken: 'rt-reg',
    })

    const result = await register()
    expect(result.accessToken).toBe('at-reg')
    expect(result.refreshToken).toBe('rt-reg')
  })

  it('throws on cancel', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'cancel' })
    await expect(register()).rejects.toThrow('Registration cancelled')
  })
})

describe('refreshToken', () => {
  it('returns null when no stored refresh token', async () => {
    const result = await refreshToken()
    expect(result).toBeNull()
  })

  it('returns new tokens on success', async () => {
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_refresh_token') return Promise.resolve('old-rt')
      return Promise.resolve(null)
    })
    mockRefreshAsync.mockResolvedValueOnce({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    })

    const result = await refreshToken()
    expect(result.accessToken).toBe('new-at')
    expect(result.refreshToken).toBe('new-rt')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('candid_refresh_token', 'new-rt')
  })

  it('returns null and clears token on failure', async () => {
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_refresh_token') return Promise.resolve('old-rt')
      return Promise.resolve(null)
    })
    mockRefreshAsync.mockRejectedValueOnce(new Error('expired'))

    const result = await refreshToken()
    expect(result).toBeNull()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_refresh_token')
  })
})

describe('logout', () => {
  it('removes refresh token from storage', async () => {
    await logout()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_refresh_token')
  })

  it('calls end-session endpoint when refresh token exists', async () => {
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_refresh_token') return Promise.resolve('rt-to-revoke')
      return Promise.resolve(null)
    })
    global.fetch.mockResolvedValueOnce({ ok: true })

    await logout()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/logout'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('tolerates fetch failure during logout', async () => {
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_refresh_token') return Promise.resolve('rt')
      return Promise.resolve(null)
    })
    global.fetch.mockRejectedValueOnce(new Error('network'))

    // Should not throw
    await logout()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_refresh_token')
  })
})

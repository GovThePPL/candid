import AsyncStorage from '@react-native-async-storage/async-storage'

// Mock secureStorage (api.js now uses secureStorage for token operations)
const mockGetSecureItem = jest.fn(() => Promise.resolve(null))
const mockSetSecureItem = jest.fn(() => Promise.resolve())
const mockDeleteSecureItem = jest.fn(() => Promise.resolve())

jest.mock('../../lib/secureStorage', () => ({
  getSecureItem: (...args) => mockGetSecureItem(...args),
  setSecureItem: (...args) => mockSetSecureItem(...args),
  deleteSecureItem: (...args) => mockDeleteSecureItem(...args),
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
  loginWithCredentials: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
}))

// Mock atob for JWT decoding (not available in Node test env)
global.atob = (str) => Buffer.from(str, 'base64').toString('binary')

jest.mock('candid_api', () => {
  const mockAuth = { BearerAuth: { accessToken: null } }
  return {
    ApiClient: jest.fn(() => ({ authentications: mockAuth })),
    UsersApi: jest.fn(() => ({ getCurrentUser: jest.fn() })),
    CardsApi: jest.fn(() => ({})),
    PositionsApi: jest.fn(() => ({})),
    ChatApi: jest.fn(() => ({})),
    SurveysApi: jest.fn(() => ({})),
    SessionsApi: jest.fn(() => ({})),
    ChattingListApi: jest.fn(() => ({})),
    StatsApi: jest.fn(() => ({})),
    ModerationApi: jest.fn(() => ({})),
    BugReportsApi: jest.fn(() => ({})),
    AdminApi: jest.fn(() => ({})),
    AuthenticationApi: jest.fn(() => ({})),
    PostsApi: jest.fn(() => ({})),
    CommentsApi: jest.fn(() => ({})),
    NotificationsApi: jest.fn(() => ({})),
    GlossaryApi: jest.fn(() => ({})),
  }
})

jest.mock('../../lib/cache', () => ({
  CacheManager: { clearAll: jest.fn(() => Promise.resolve()) },
}))

jest.mock('../../lib/errorCollector', () => ({
  recordApiError: jest.fn(),
}))

import {
  translateError,
  isTokenFresh,
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  initializeAuth,
  authApi,
} from '../../lib/api'

import { CacheManager } from '../../lib/cache'

beforeEach(() => {
  jest.clearAllMocks()
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.setItem.mockResolvedValue()
  AsyncStorage.removeItem.mockResolvedValue()
  mockGetSecureItem.mockResolvedValue(null)
  mockSetSecureItem.mockResolvedValue()
  mockDeleteSecureItem.mockResolvedValue()
})

describe('translateError', () => {
  it('returns original message for null/undefined', () => {
    expect(translateError(null, jest.fn())).toBeNull()
    expect(translateError(undefined, jest.fn())).toBeUndefined()
  })

  it('returns original message when t is falsy', () => {
    expect(translateError('test', null)).toBe('test')
  })

  it('translates known backend error messages', () => {
    const t = jest.fn((key) => `translated:${key}`)
    const result = translateError('Invalid username or password', t)
    expect(t).toHaveBeenCalledWith('errors:invalidCredentials')
    expect(result).toBe('translated:errors:invalidCredentials')
  })

  it('translates other known errors', () => {
    const t = jest.fn((key) => `translated:${key}`)
    expect(translateError('User not found', t)).toBe('translated:errors:userNotFound')
    expect(translateError('Chat not found', t)).toBe('translated:errors:chatNotFound')
    expect(translateError('Authentication failed', t)).toBe('translated:errors:authenticationFailed')
  })

  it('returns original message for unknown errors', () => {
    const t = jest.fn((key) => key)
    const result = translateError('Some weird error', t)
    expect(t).not.toHaveBeenCalled()
    expect(result).toBe('Some weird error')
  })
})

describe('getToken / setToken', () => {
  it('getToken returns null when nothing stored', async () => {
    const token = await getToken()
    expect(token).toBeNull()
  })

  it('setToken stores token in secureStorage', async () => {
    await setToken('my-token')
    expect(mockSetSecureItem).toHaveBeenCalledWith('candid_auth_token', 'my-token')
  })

  it('setToken(null) removes token from secureStorage', async () => {
    await setToken(null)
    expect(mockDeleteSecureItem).toHaveBeenCalledWith('candid_auth_token')
  })

  it('getToken retrieves from secureStorage', async () => {
    mockGetSecureItem.mockResolvedValueOnce('stored-token')
    const token = await getToken()
    expect(token).toBe('stored-token')
  })

  it('getToken returns null on storage error', async () => {
    mockGetSecureItem.mockRejectedValueOnce(new Error('fail'))
    const token = await getToken()
    expect(token).toBeNull()
  })
})

describe('getStoredUser / setStoredUser', () => {
  it('getStoredUser returns null when nothing stored', async () => {
    const user = await getStoredUser()
    expect(user).toBeNull()
  })

  it('setStoredUser stores JSON-serialized user', async () => {
    const user = { id: 'u1', name: 'Alice' }
    await setStoredUser(user)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'candid_user',
      JSON.stringify(user)
    )
  })

  it('getStoredUser parses stored JSON', async () => {
    const user = { id: 'u1', name: 'Alice' }
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_user') return Promise.resolve(JSON.stringify(user))
      return Promise.resolve(null)
    })
    const result = await getStoredUser()
    expect(result).toEqual(user)
  })

  it('setStoredUser(null) removes user from AsyncStorage', async () => {
    await setStoredUser(null)
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_user')
  })

  it('getStoredUser returns null on parse error', async () => {
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_user') return Promise.resolve('invalid-json{')
      return Promise.resolve(null)
    })
    const result = await getStoredUser()
    expect(result).toBeNull()
  })
})

describe('initializeAuth', () => {
  it('reads token from storage', async () => {
    mockGetSecureItem.mockImplementation((key) => {
      if (key === 'candid_auth_token') return Promise.resolve('saved-token')
      return Promise.resolve(null)
    })
    // Should not throw
    await initializeAuth()
    expect(mockGetSecureItem).toHaveBeenCalledWith('candid_auth_token')
  })

  it('completes without error when no token stored', async () => {
    await initializeAuth()
    expect(mockGetSecureItem).toHaveBeenCalledWith('candid_auth_token')
  })
})

describe('authApi.logout', () => {
  it('clears token, user, and cache', async () => {
    await authApi.logout()
    expect(mockDeleteSecureItem).toHaveBeenCalledWith('candid_auth_token')
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_user')
    expect(CacheManager.clearAll).toHaveBeenCalled()
  })
})

// Helper to create a JWT with a given exp (seconds since epoch)
function makeJwt(exp) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'user1', exp })).toString('base64url')
  return `${header}.${payload}.signature`
}

describe('isTokenFresh', () => {
  it('returns true for a non-expired token', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    const token = makeJwt(exp)
    expect(isTokenFresh(token)).toBe(true)
  })

  it('returns true for a token expiring 1 second from now', () => {
    const exp = Math.floor(Date.now() / 1000) + 1
    const token = makeJwt(exp)
    expect(isTokenFresh(token)).toBe(true)
  })

  it('returns false for an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 60 // 1 minute ago
    const token = makeJwt(exp)
    expect(isTokenFresh(token)).toBe(false)
  })

  it('returns false for a token that expired exactly now', () => {
    const exp = Math.floor(Date.now() / 1000) // exp === now => not fresh (> vs >=)
    const token = makeJwt(exp)
    expect(isTokenFresh(token)).toBe(false)
  })

  it('returns false for a malformed token (not 3 parts)', () => {
    expect(isTokenFresh('not-a-jwt')).toBe(false)
    expect(isTokenFresh('two.parts')).toBe(false)
    expect(isTokenFresh('')).toBe(false)
  })

  it('returns false for a token with invalid base64 payload', () => {
    expect(isTokenFresh('header.!!!invalid!!!.signature')).toBe(false)
  })

  it('returns false for null or undefined', () => {
    expect(isTokenFresh(null)).toBe(false)
    expect(isTokenFresh(undefined)).toBe(false)
  })

  it('returns falsy for a JWT payload without exp claim', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'user1' })).toString('base64url')
    const token = `${header}.${payload}.signature`
    expect(isTokenFresh(token)).toBeFalsy()
  })
})

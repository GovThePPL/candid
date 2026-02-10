import AsyncStorage from '@react-native-async-storage/async-storage'

jest.mock('candid_api', () => {
  const mockAuth = { BearerAuth: { accessToken: null } }
  return {
    ApiClient: jest.fn(() => ({ authentications: mockAuth })),
    UsersApi: jest.fn(() => ({ getCurrentUser: jest.fn() })),
    CardsApi: jest.fn(() => ({})),
    PositionsApi: jest.fn(() => ({})),
    ChatApi: jest.fn(() => ({})),
    SurveysApi: jest.fn(() => ({})),
    CategoriesApi: jest.fn(() => ({})),
    ChattingListApi: jest.fn(() => ({})),
    StatsApi: jest.fn(() => ({})),
    ModerationApi: jest.fn(() => ({})),
    BugReportsApi: jest.fn(() => ({})),
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

  it('setToken stores token in AsyncStorage', async () => {
    await setToken('my-token')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('candid_auth_token', 'my-token')
  })

  it('setToken(null) removes token from AsyncStorage', async () => {
    await setToken(null)
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_auth_token')
  })

  it('getToken retrieves from AsyncStorage', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('stored-token')
    const token = await getToken()
    expect(token).toBe('stored-token')
  })

  it('getToken returns null on storage error', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('fail'))
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
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'candid_auth_token') return Promise.resolve('saved-token')
      return Promise.resolve(null)
    })
    // Should not throw
    await initializeAuth()
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('candid_auth_token')
  })

  it('completes without error when no token stored', async () => {
    await initializeAuth()
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('candid_auth_token')
  })
})

describe('authApi.logout', () => {
  it('clears token, user, and cache', async () => {
    await authApi.logout()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_auth_token')
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_user')
    expect(CacheManager.clearAll).toHaveBeenCalled()
  })
})

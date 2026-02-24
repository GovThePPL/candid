import AsyncStorage from '@react-native-async-storage/async-storage'

// Mock keycloak before importing api module
jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
  loginWithCredentials: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
}))

// Mock atob for JWT decoding (not available in Node test env)
global.atob = (str) => Buffer.from(str, 'base64').toString('binary')

const { getOrRefreshToken } = require('../../lib/api')
const keycloak = require('../../lib/keycloak')

// Helper to create a JWT with a given exp (seconds since epoch)
function makeJwt(exp) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'user1', exp })).toString('base64url')
  return `${header}.${payload}.signature`
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getOrRefreshToken', () => {
  it('returns token as-is when >60s remaining', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600 // 10 min from now
    const token = makeJwt(exp)
    AsyncStorage.getItem.mockResolvedValue(token)

    const result = await getOrRefreshToken()
    expect(result).toBe(token)
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })

  it('refreshes token when <=60s remaining', async () => {
    const exp = Math.floor(Date.now() / 1000) + 30 // 30s from now
    const oldToken = makeJwt(exp)
    AsyncStorage.getItem.mockResolvedValue(oldToken)

    const newExp = Math.floor(Date.now() / 1000) + 3600
    const freshToken = makeJwt(newExp)
    keycloak.refreshToken.mockResolvedValue({ accessToken: freshToken })

    const result = await getOrRefreshToken()
    expect(result).toBe(freshToken)
    expect(keycloak.refreshToken).toHaveBeenCalledTimes(1)
    // Verify setToken was called (stores via AsyncStorage.setItem)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('candid_auth_token', freshToken)
  })

  it('falls back to existing token when refresh fails', async () => {
    const exp = Math.floor(Date.now() / 1000) + 10 // About to expire
    const token = makeJwt(exp)
    AsyncStorage.getItem.mockResolvedValue(token)

    keycloak.refreshToken.mockRejectedValue(new Error('Network error'))

    const result = await getOrRefreshToken()
    // Should return existing token on failure (graceful degradation)
    expect(result).toBe(token)
  })

  it('falls back when refresh returns null', async () => {
    const exp = Math.floor(Date.now() / 1000) + 10
    const token = makeJwt(exp)
    AsyncStorage.getItem.mockResolvedValue(token)

    keycloak.refreshToken.mockResolvedValue(null)

    const result = await getOrRefreshToken()
    expect(result).toBe(token)
  })

  it('returns null when no token stored', async () => {
    AsyncStorage.getItem.mockResolvedValue(null)

    const result = await getOrRefreshToken()
    expect(result).toBeNull()
  })

  it('returns token as-is for malformed JWT (not 3 parts)', async () => {
    AsyncStorage.getItem.mockResolvedValue('not-a-jwt')

    const result = await getOrRefreshToken()
    expect(result).toBe('not-a-jwt')
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })

  it('returns token as-is when JWT has no exp claim', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'user1' })).toString('base64url')
    const token = `${header}.${payload}.signature`
    AsyncStorage.getItem.mockResolvedValue(token)

    const result = await getOrRefreshToken()
    expect(result).toBe(token)
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })
})

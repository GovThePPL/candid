import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Mock all dependencies before importing UserContext
const mockLoginWithCredentials = jest.fn()
const mockRefreshToken = jest.fn()
const mockKeycloakLogout = jest.fn()
jest.mock('../../lib/keycloak', () => ({
  loginWithCredentials: (...args) => mockLoginWithCredentials(...args),
  refreshToken: (...args) => mockRefreshToken(...args),
  logout: (...args) => mockKeycloakLogout(...args),
}))

const mockConnectSocket = jest.fn()
const mockDisconnectSocket = jest.fn()
const mockOnChatRequestResponse = jest.fn(() => jest.fn())
const mockOnChatRequestReceived = jest.fn(() => jest.fn())
const mockOnChatStarted = jest.fn(() => jest.fn())
jest.mock('../../lib/socket', () => ({
  __esModule: true,
  default: { connect: jest.fn(), disconnect: jest.fn() },
  connectSocket: (...args) => mockConnectSocket(...args),
  disconnectSocket: (...args) => mockDisconnectSocket(...args),
  onChatRequestResponse: (...args) => mockOnChatRequestResponse(...args),
  onChatRequestReceived: (...args) => mockOnChatRequestReceived(...args),
  onChatStarted: (...args) => mockOnChatStarted(...args),
}))

jest.mock('../../lib/notifications', () => ({
  setupNotificationHandler: jest.fn(),
  addNotificationResponseListener: jest.fn(() => jest.fn()),
}))

jest.mock('../../lib/errorCollector', () => ({
  install: jest.fn(),
  drain: jest.fn(() => null),
}))

const mockGetCurrentUser = jest.fn()
const mockLogout = jest.fn()
const mockRegisterAccount = jest.fn()
const mockGetActiveChat = jest.fn()

const _mockApiTokenFns = {}

jest.mock('../../lib/api', () => {
  _mockApiTokenFns.getToken = jest.fn(() => Promise.resolve('test-token'))
  _mockApiTokenFns.setToken = jest.fn(() => Promise.resolve())
  _mockApiTokenFns.getStoredUser = jest.fn(() => Promise.resolve(null))
  _mockApiTokenFns.setStoredUser = jest.fn(() => Promise.resolve())
  _mockApiTokenFns.initializeAuth = jest.fn(() => Promise.resolve())

  return {
    __esModule: true,
    getToken: (...args) => _mockApiTokenFns.getToken(...args),
    setToken: (...args) => _mockApiTokenFns.setToken(...args),
    getStoredUser: (...args) => _mockApiTokenFns.getStoredUser(...args),
    setStoredUser: (...args) => _mockApiTokenFns.setStoredUser(...args),
    initializeAuth: (...args) => _mockApiTokenFns.initializeAuth(...args),
    bugReportsApiWrapper: { createReport: jest.fn() },
    default: {
      auth: {
        getCurrentUser: (...args) => mockGetCurrentUser(...args),
        logout: (...args) => mockLogout(...args),
        registerAccount: (...args) => mockRegisterAccount(...args),
      },
      chat: {
        getActiveChat: (...args) => mockGetActiveChat(...args),
      },
    },
  }
})

import { UserProvider, UserContext } from '../../contexts/UserContext'

function useUserContext() {
  const ctx = React.useContext(UserContext)
  return ctx
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.setItem.mockResolvedValue()
  AsyncStorage.removeItem.mockResolvedValue()
  _mockApiTokenFns.getToken.mockResolvedValue('test-token')
  _mockApiTokenFns.setToken.mockResolvedValue()
  _mockApiTokenFns.getStoredUser.mockResolvedValue(null)
  _mockApiTokenFns.setStoredUser.mockResolvedValue()
  _mockApiTokenFns.initializeAuth.mockResolvedValue()
  mockGetCurrentUser.mockResolvedValue(null)
  mockLogout.mockResolvedValue()
  mockGetActiveChat.mockResolvedValue(null)
  mockConnectSocket.mockResolvedValue({})
  mockKeycloakLogout.mockResolvedValue()
})

afterEach(() => {
  jest.useRealTimers()
})

function renderUserHook() {
  return renderHook(() => useUserContext(), {
    wrapper: ({ children }) => <UserProvider>{children}</UserProvider>,
  })
}

describe('UserProvider initialization', () => {
  it('sets authChecked to true after initialization', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })
  })

  it('user is null when no stored user', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })
    expect(result.current.user).toBeNull()
  })

  it('restores user from storage when token is valid', async () => {
    const storedUser = { id: 'u1', username: 'alice', status: 'active' }
    _mockApiTokenFns.getStoredUser.mockResolvedValue(storedUser)
    mockGetCurrentUser.mockResolvedValue(storedUser)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.user).toEqual(storedUser)
    })
  })

  it('refreshes token when getCurrentUser fails', async () => {
    const storedUser = { id: 'u1', username: 'alice', status: 'active' }
    _mockApiTokenFns.getStoredUser.mockResolvedValue(storedUser)
    mockGetCurrentUser
      .mockRejectedValueOnce(new Error('unauthorized'))
      .mockResolvedValueOnce(storedUser)
    mockRefreshToken.mockResolvedValue({ accessToken: 'new-token' })

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.user).toEqual(storedUser)
    })
    expect(mockRefreshToken).toHaveBeenCalled()
  })

  it('logs out when token refresh fails', async () => {
    const storedUser = { id: 'u1', username: 'alice', status: 'active' }
    _mockApiTokenFns.getStoredUser.mockResolvedValue(storedUser)
    mockGetCurrentUser.mockRejectedValue(new Error('unauthorized'))
    mockRefreshToken.mockResolvedValue(null)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })
    expect(result.current.user).toBeNull()
    expect(mockLogout).toHaveBeenCalled()
  })
})

describe('login', () => {
  it('authenticates and sets user', async () => {
    const user = { id: 'u1', username: 'alice', status: 'active' }
    mockLoginWithCredentials.mockResolvedValue({ accessToken: 'at-1' })
    mockGetCurrentUser.mockResolvedValue(user)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    await act(async () => {
      await result.current.login('alice', 'pass')
    })

    expect(result.current.user).toEqual(user)
    expect(_mockApiTokenFns.setToken).toHaveBeenCalledWith('at-1')
    expect(_mockApiTokenFns.setStoredUser).toHaveBeenCalledWith(user)
  })

  it('throws on login failure', async () => {
    mockLoginWithCredentials.mockRejectedValue(new Error('Bad credentials'))

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    await expect(
      act(async () => {
        await result.current.login('alice', 'wrong')
      })
    ).rejects.toThrow('Bad credentials')
  })
})

describe('logout', () => {
  it('clears user and calls cleanup', async () => {
    const user = { id: 'u1', username: 'alice', status: 'active' }
    mockLoginWithCredentials.mockResolvedValue({ accessToken: 'at-1' })
    mockGetCurrentUser.mockResolvedValue(user)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    // Login first
    await act(async () => {
      await result.current.login('alice', 'pass')
    })
    expect(result.current.user).toEqual(user)

    // Logout
    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(mockKeycloakLogout).toHaveBeenCalled()
    expect(mockLogout).toHaveBeenCalled()
  })
})

describe('isBanned', () => {
  it('returns true when user status is banned', async () => {
    const bannedUser = { id: 'u1', username: 'bad', status: 'banned' }
    _mockApiTokenFns.getStoredUser.mockResolvedValue(bannedUser)
    mockGetCurrentUser.mockResolvedValue(bannedUser)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.user).toEqual(bannedUser)
    })
    expect(result.current.isBanned).toBe(true)
  })

  it('returns false when user is not banned', async () => {
    const user = { id: 'u1', username: 'good', status: 'active' }
    _mockApiTokenFns.getStoredUser.mockResolvedValue(user)
    mockGetCurrentUser.mockResolvedValue(user)

    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.user).toEqual(user)
    })
    expect(result.current.isBanned).toBe(false)
  })
})

describe('invalidatePositions', () => {
  it('increments positionsVersion', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    const initial = result.current.positionsVersion
    act(() => {
      result.current.invalidatePositions()
    })
    expect(result.current.positionsVersion).toBe(initial + 1)
  })
})

describe('pendingChatRequest', () => {
  it('defaults to null', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })
    expect(result.current.pendingChatRequest).toBeNull()
  })

  it('setPendingChatRequest persists to AsyncStorage', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    const request = { id: 'r1', status: 'pending' }
    act(() => {
      result.current.setPendingChatRequest(request)
    })

    expect(result.current.pendingChatRequest).toEqual(request)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'candid_pending_chat_request',
      JSON.stringify(request)
    )
  })

  it('clearPendingChatRequest removes from storage', async () => {
    const { result } = renderUserHook()
    await act(async () => {
      jest.runAllTimers()
    })
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true)
    })

    act(() => {
      result.current.setPendingChatRequest({ id: 'r1' })
    })
    act(() => {
      result.current.clearPendingChatRequest()
    })

    expect(result.current.pendingChatRequest).toBeNull()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('candid_pending_chat_request')
  })
})

import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockShowToast = jest.fn()
jest.mock('../../components/Toast', () => ({
  useToast: () => mockShowToast,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}))

const mockGetUserChats = jest.fn()
const mockGetUserChatsMetadata = jest.fn()
const mockSendKudos = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    chat: {
      getUserChats: (...args) => mockGetUserChats(...args),
      getUserChatsMetadata: (...args) => mockGetUserChatsMetadata(...args),
      sendKudos: (...args) => mockSendKudos(...args),
    },
  },
  translateError: (msg) => msg,
}))

const mockCacheGet = jest.fn()
const mockCacheSet = jest.fn()
const mockCacheInvalidate = jest.fn()
jest.mock('../../lib/cache', () => ({
  CacheManager: {
    get: (...args) => mockCacheGet(...args),
    set: (...args) => mockCacheSet(...args),
    invalidate: (...args) => mockCacheInvalidate(...args),
  },
  CacheKeys: {
    userChats: (id) => `chats:${id}`,
  },
}))

// Mock UserContext to avoid keycloak/expo-auth-session import
jest.mock('../../contexts/UserContext', () => ({
  UserContext: {
    _currentValue: { user: { id: 'user-1' } },
  },
}))

const React = require('react')
const originalUseContext = React.useContext
jest.spyOn(React, 'useContext').mockImplementation((context) => {
  if (context === require('../../contexts/UserContext').UserContext) {
    return { user: { id: 'user-1' } }
  }
  return originalUseContext(context)
})

import useChatHistory from '../../hooks/useChatHistory'

beforeEach(() => {
  jest.clearAllMocks()
  mockCacheGet.mockResolvedValue(null)
  mockGetUserChatsMetadata.mockResolvedValue({ count: 0, lastActivityTime: null })
  mockGetUserChats.mockResolvedValue([])
  mockCacheSet.mockResolvedValue(undefined)
  mockCacheInvalidate.mockResolvedValue(undefined)
})

describe('useChatHistory', () => {
  it('fetches chats on mount', async () => {
    const chats = [{ id: 'c1', topic: 'Test' }]
    mockGetUserChats.mockResolvedValue(chats)

    const { result } = renderHook(() => useChatHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.chats).toEqual(chats)
  })

  it('sets error state on fetch failure', async () => {
    mockGetUserChats.mockRejectedValue(new Error('Network error'))
    mockGetUserChatsMetadata.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useChatHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('handleSendKudos updates local state on success', async () => {
    const chats = [
      { id: 'c1', topic: 'Test', kudosSent: false },
      { id: 'c2', topic: 'Other', kudosSent: false },
    ]
    mockGetUserChats.mockResolvedValue(chats)
    mockSendKudos.mockResolvedValue({})

    const { result } = renderHook(() => useChatHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleSendKudos('c1')
    })

    expect(mockSendKudos).toHaveBeenCalledWith('c1')
    expect(result.current.chats[0].kudosSent).toBe(true)
    expect(result.current.chats[1].kudosSent).toBe(false)
  })

  it('handleSendKudos treats 409 as already sent', async () => {
    const chats = [{ id: 'c1', topic: 'Test', kudosSent: false }]
    mockGetUserChats.mockResolvedValue(chats)
    mockSendKudos.mockRejectedValue({ status: 409, message: '409' })

    const { result } = renderHook(() => useChatHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleSendKudos('c1')
    })

    // Should mark as sent, not show error toast
    expect(result.current.chats[0].kudosSent).toBe(true)
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('handleSendKudos shows error toast on non-409 failure', async () => {
    const chats = [{ id: 'c1', topic: 'Test', kudosSent: false }]
    mockGetUserChats.mockResolvedValue(chats)
    mockSendKudos.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useChatHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleSendKudos('c1')
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorKudosFailed')
    expect(result.current.chats[0].kudosSent).toBe(false)
  })

  it('handleRefresh triggers fetch with refreshing state', async () => {
    mockGetUserChats.mockResolvedValue([])

    const { result } = renderHook(() => useChatHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetUserChats.mockResolvedValue([{ id: 'c2', topic: 'New' }])

    await act(async () => {
      result.current.handleRefresh()
    })

    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.chats).toEqual([{ id: 'c2', topic: 'New' }])
  })
})

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockGetUnreadCount = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    notifications: {
      getUnreadCount: (...args) => mockGetUnreadCount(...args),
    },
  },
}))

let notificationHandler = null
jest.mock('../../lib/socket', () => ({
  onNotification: (handler) => {
    notificationHandler = handler
    return () => { notificationHandler = null }
  },
}))

import { NotificationProvider, useNotificationCount } from '../../contexts/NotificationContext'

beforeEach(() => {
  jest.clearAllMocks()
  notificationHandler = null
  mockGetUnreadCount.mockResolvedValue({ count: 0 })
})

function renderNotificationHook() {
  return renderHook(() => useNotificationCount(), {
    wrapper: ({ children }) => <NotificationProvider>{children}</NotificationProvider>,
  })
}

describe('NotificationProvider', () => {
  it('fetches initial unread count on mount', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 3 })
    const { result } = renderNotificationHook()

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(3)
    })
  })

  it('increments on real-time notification', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 1 })
    const { result } = renderNotificationHook()
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    act(() => {
      notificationHandler({ id: 'n1', type: 'comment_reply' })
    })

    expect(result.current.unreadCount).toBe(2)
  })

  it('decrements unread count', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 5 })
    const { result } = renderNotificationHook()
    await waitFor(() => expect(result.current.unreadCount).toBe(5))

    act(() => { result.current.decrementUnread() })
    expect(result.current.unreadCount).toBe(4)
  })

  it('does not go below zero', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 0 })
    const { result } = renderNotificationHook()
    await waitFor(() => expect(result.current.unreadCount).toBe(0))

    act(() => { result.current.decrementUnread() })
    expect(result.current.unreadCount).toBe(0)
  })

  it('clears unread count', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 10 })
    const { result } = renderNotificationHook()
    await waitFor(() => expect(result.current.unreadCount).toBe(10))

    act(() => { result.current.clearUnread() })
    expect(result.current.unreadCount).toBe(0)
  })

  it('handles fetch error gracefully', async () => {
    mockGetUnreadCount.mockRejectedValue(new Error('Network error'))
    const { result } = renderNotificationHook()

    // Should default to 0 and not throw
    await act(() => Promise.resolve())
    expect(result.current.unreadCount).toBe(0)
  })
})

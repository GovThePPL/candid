import { renderHook, act, waitFor } from '@testing-library/react-native'
import React from 'react'

const mockGetNotifications = jest.fn()
const mockMarkRead = jest.fn()
const mockMarkAllRead = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    notifications: {
      getNotifications: (...args) => mockGetNotifications(...args),
      markRead: (...args) => mockMarkRead(...args),
      markAllRead: (...args) => mockMarkAllRead(...args),
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

const mockDecrementUnread = jest.fn()
const mockClearUnread = jest.fn()
jest.mock('../../contexts/NotificationContext', () => ({
  useNotificationCount: () => ({
    decrementUnread: mockDecrementUnread,
    clearUnread: mockClearUnread,
  }),
}))

import useNotifications from '../../hooks/useNotifications'

beforeEach(() => {
  jest.clearAllMocks()
  notificationHandler = null
  mockGetNotifications.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
  mockMarkRead.mockResolvedValue(undefined)
  mockMarkAllRead.mockResolvedValue(undefined)
})

const sampleNotifications = [
  { id: 'n1', type: 'comment_reply', title: 'Reply', body: 'Body 1', isRead: false, createdTime: '2026-02-16T10:00:00Z' },
  { id: 'n2', type: 'post_comment', title: 'Comment', body: 'Body 2', isRead: true, createdTime: '2026-02-16T09:00:00Z' },
]

describe('useNotifications', () => {
  it('fetches notifications on mount and marks all read on server', async () => {
    mockGetNotifications.mockResolvedValue({ items: sampleNotifications, hasMore: false, nextCursor: null })
    const { result } = renderHook(() => useNotifications())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notifications).toEqual(sampleNotifications)
    expect(result.current.hasMore).toBe(false)

    // Server-side markAllRead is called after initial fetch
    await waitFor(() => expect(mockMarkAllRead).toHaveBeenCalled())
    expect(mockClearUnread).toHaveBeenCalled()

    // Local isRead values are preserved (unread items stay unread in UI)
    expect(result.current.notifications[0].isRead).toBe(false)
    expect(result.current.notifications[1].isRead).toBe(true)
  })

  it('handles empty response', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notifications).toEqual([])
  })

  it('loads more with cursor', async () => {
    mockGetNotifications
      .mockResolvedValueOnce({ items: [sampleNotifications[0]], hasMore: true, nextCursor: 'cursor1' })
      .mockResolvedValueOnce({ items: [sampleNotifications[1]], hasMore: false, nextCursor: null })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.notifications).toHaveLength(2)
    expect(mockGetNotifications).toHaveBeenCalledWith({ cursor: 'cursor1', limit: 20 })
  })

  it('marks a notification as read optimistically', async () => {
    mockGetNotifications.mockResolvedValue({ items: sampleNotifications, hasMore: false, nextCursor: null })
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markRead('n1')
    })

    expect(result.current.notifications[0].isRead).toBe(true)
    expect(mockMarkRead).toHaveBeenCalledWith('n1')
  })

  it('does not call markAllRead when initial fetch fails', async () => {
    mockGetNotifications.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useNotifications())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notifications).toEqual([])
    expect(mockMarkAllRead).not.toHaveBeenCalled()
    expect(mockClearUnread).not.toHaveBeenCalled()
  })

  it('prepends real-time notifications', async () => {
    mockGetNotifications.mockResolvedValue({ items: [sampleNotifications[1]], hasMore: false, nextCursor: null })
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const newNotif = { id: 'n3', type: 'chat_request', title: 'Chat', body: 'New chat', isRead: false }
    act(() => {
      notificationHandler(newNotif)
    })

    expect(result.current.notifications[0]).toEqual(newNotif)
    expect(result.current.notifications).toHaveLength(2)
  })
})

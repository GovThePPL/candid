import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockShowToast = jest.fn()
jest.mock('../../components/Toast', () => ({
  useToast: () => mockShowToast,
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}))

jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'mod-1' } }),
}))

const mockGetQueue = jest.fn()
const mockClaimReport = jest.fn()
const mockReleaseReport = jest.fn()
const mockTakeAction = jest.fn()
const mockRespondToAppeal = jest.fn()
const mockDismissAdminResponseNotification = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    moderation: {
      getQueue: (...args) => mockGetQueue(...args),
      claimReport: (...args) => mockClaimReport(...args),
      releaseReport: (...args) => mockReleaseReport(...args),
      takeAction: (...args) => mockTakeAction(...args),
      respondToAppeal: (...args) => mockRespondToAppeal(...args),
      dismissAdminResponseNotification: (...args) => mockDismissAdminResponseNotification(...args),
    },
  },
  translateError: (msg) => msg,
}))

import useModerationQueue from '../../hooks/useModerationQueue'

const makeReport = (id = 'r1') => ({
  type: 'report',
  data: { id, reportedUser: { id: 'u1' } },
})

const makeAppeal = (id = 'a1') => ({
  type: 'appeal',
  data: { id, modActionAppealId: 'ma1' },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetQueue.mockResolvedValue([makeReport()])
  mockClaimReport.mockResolvedValue({})
})

describe('useModerationQueue', () => {
  it('fetches queue on mount', async () => {
    const items = [makeReport('r1'), makeReport('r2')]
    mockGetQueue.mockResolvedValue(items)

    const { result } = renderHook(() => useModerationQueue())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.queue).toEqual(items)
    expect(result.current.currentItem).toEqual(items[0])
  })

  it('sets error state on fetch failure', async () => {
    mockGetQueue.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useModerationQueue())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  // handlePass
  it('handlePass advances queue and releases report', async () => {
    const items = [makeReport('r1'), makeReport('r2')]
    mockGetQueue.mockResolvedValue(items)
    mockReleaseReport.mockResolvedValue({})

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handlePass()
    })

    expect(mockReleaseReport).toHaveBeenCalledWith('r1')
  })

  it('handlePass shows error toast on release failure', async () => {
    mockGetQueue.mockResolvedValue([makeReport('r1'), makeReport('r2')])
    mockReleaseReport.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handlePass()
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorPassFailed')
  })

  // handleDismiss
  it('handleDismiss calls takeAction and advances', async () => {
    mockGetQueue.mockResolvedValue([makeReport('r1'), makeReport('r2')])
    mockTakeAction.mockResolvedValue({})

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleDismiss()
    })

    expect(mockTakeAction).toHaveBeenCalledWith('r1', {
      modResponse: 'dismiss',
      modResponseText: undefined,
    })
  })

  it('handleDismiss shows error toast on failure', async () => {
    mockGetQueue.mockResolvedValue([makeReport('r1'), makeReport('r2')])
    mockTakeAction.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleDismiss()
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorDismissReportFailed')
  })

  // handleMarkSpurious
  it('handleMarkSpurious shows error toast on failure', async () => {
    mockGetQueue.mockResolvedValue([makeReport('r1'), makeReport('r2')])
    mockTakeAction.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleMarkSpurious()
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorActionFailed')
  })

  // handleTakeAction
  it('handleTakeAction shows error toast on failure', async () => {
    mockGetQueue.mockResolvedValue([makeReport('r1'), makeReport('r2')])
    mockTakeAction.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleTakeAction({ modResponse: 'warn' })
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorActionFailed')
  })

  // handleAppealResponse
  it('handleAppealResponse shows error toast on failure', async () => {
    mockGetQueue.mockResolvedValue([makeAppeal('a1')])
    mockRespondToAppeal.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Set required state
    await act(() => {
      result.current.setAppealResponseType('uphold')
    })

    await act(async () => {
      await result.current.handleAppealResponse()
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorAppealResponseFailed')
  })

  // handleDismissAdminResponse
  it('handleDismissAdminResponse shows error toast on failure', async () => {
    const adminNotification = {
      type: 'admin_response_notification',
      data: { id: 'n1', modActionAppealId: 'ma1' },
    }
    mockGetQueue.mockResolvedValue([adminNotification])
    mockDismissAdminResponseNotification.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleDismissAdminResponse()
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorDismissReportFailed')
  })

  // handleModifyAction
  it('handleModifyAction shows error toast on failure', async () => {
    mockGetQueue.mockResolvedValue([makeAppeal('a1')])
    mockRespondToAppeal.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleModifyAction({
        modResponseText: 'Modified',
        actions: [],
      })
    })

    expect(mockShowToast).toHaveBeenCalledWith('errorModifyFailed')
  })

  // handleChatPress
  it('handleChatPress navigates to chat', async () => {
    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.handleChatPress('chat-1', 'reporter-1')
    })

    expect(mockPush).toHaveBeenCalledWith('/chat/chat-1?from=moderation&reporterId=reporter-1')
  })

  // Optimistic advancement
  it('handlePass advances before API resolves', async () => {
    const items = [makeReport('r1'), makeReport('r2')]
    mockGetQueue.mockResolvedValue(items)
    // Never resolves — simulates slow network
    mockReleaseReport.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useModerationQueue())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.currentItem.data.id).toBe('r1')

    act(() => {
      result.current.handlePass()
    })

    // Should have advanced immediately
    expect(result.current.currentItem.data.id).toBe('r2')
  })
})

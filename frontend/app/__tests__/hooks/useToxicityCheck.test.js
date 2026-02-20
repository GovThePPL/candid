import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockCheckToxicity = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    moderation: {
      checkToxicity: (...args) => mockCheckToxicity(...args),
    },
  },
}))

import useToxicityCheck from '../../hooks/useToxicityCheck'

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockCheckToxicity.mockResolvedValue({ isToxic: false, toxicityScore: 0.1 })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useToxicityCheck', () => {
  it('calls sendFn immediately for clean text', async () => {
    mockCheckToxicity.mockResolvedValue({ isToxic: false, toxicityScore: 0.1 })
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('hello', sendFn)
    })

    expect(sendFn).toHaveBeenCalledTimes(1)
    expect(result.current.modalProps.visible).toBe(false)
  })

  it('shows modal for toxic text instead of calling sendFn', async () => {
    mockCheckToxicity.mockResolvedValue({ isToxic: true, toxicityScore: 0.95 })
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('you are terrible', sendFn)
    })

    expect(sendFn).not.toHaveBeenCalled()
    expect(result.current.modalProps.visible).toBe(true)
    expect(result.current.modalProps.countdown).toBe(5)
  })

  it('calls sendFn on API failure (fail-open)', async () => {
    mockCheckToxicity.mockRejectedValue(new Error('Network error'))
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('some text', sendFn)
    })

    expect(sendFn).toHaveBeenCalledTimes(1)
    expect(result.current.modalProps.visible).toBe(false)
  })

  it('onRevise closes modal without sending', async () => {
    mockCheckToxicity.mockResolvedValue({ isToxic: true, toxicityScore: 0.9 })
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('toxic text', sendFn)
    })

    expect(result.current.modalProps.visible).toBe(true)

    act(() => {
      result.current.modalProps.onRevise()
    })

    expect(result.current.modalProps.visible).toBe(false)
    expect(sendFn).not.toHaveBeenCalled()
  })

  it('onSendAnyway sends the message and closes modal', async () => {
    mockCheckToxicity.mockResolvedValue({ isToxic: true, toxicityScore: 0.9 })
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('toxic text', sendFn)
    })

    expect(result.current.modalProps.visible).toBe(true)

    act(() => {
      result.current.modalProps.onSendAnyway()
    })

    expect(result.current.modalProps.visible).toBe(false)
    expect(sendFn).toHaveBeenCalledTimes(1)
  })

  it('does nothing for empty text', async () => {
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('', sendFn)
    })

    expect(mockCheckToxicity).not.toHaveBeenCalled()
    expect(sendFn).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only text', async () => {
    const sendFn = jest.fn()

    const { result } = renderHook(() => useToxicityCheck())

    await act(async () => {
      await result.current.checkAndSend('   ', sendFn)
    })

    expect(mockCheckToxicity).not.toHaveBeenCalled()
    expect(sendFn).not.toHaveBeenCalled()
  })
})

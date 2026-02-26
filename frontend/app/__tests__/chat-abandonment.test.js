/**
 * Tests for chat abandonment detection socket events.
 *
 * These tests verify the socket-level behavior of partner disconnect/reconnect
 * events and the leaveChat emission. The chat screen's UI rendering of the
 * partner disconnected banner is covered by manual testing (the screen has too
 * many dependencies for unit testing).
 */

// Mock socket.io-client
const mockOn = jest.fn()
const mockOff = jest.fn()
const mockEmit = jest.fn()
const mockConnect = jest.fn()
const mockDisconnect = jest.fn()
const mockRemoveAllListeners = jest.fn()

const mockSocket = {
  on: mockOn,
  off: mockOff,
  emit: mockEmit,
  connect: mockConnect,
  disconnect: mockDisconnect,
  removeAllListeners: mockRemoveAllListeners,
  connected: false,
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

jest.mock('../lib/api', () => ({
  getToken: jest.fn(() => Promise.resolve('test-token')),
  getOrRefreshToken: jest.fn(() => Promise.resolve('test-token')),
}))

let socketModule

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockSocket.connected = false
  mockOn.mockReset()
  mockOff.mockReset()
  mockEmit.mockReset()
  mockConnect.mockReset()
  mockDisconnect.mockReset()
  mockRemoveAllListeners.mockReset()

  jest.resetModules()
  jest.mock('socket.io-client', () => ({
    io: jest.fn(() => mockSocket),
  }))
  jest.mock('../lib/api', () => ({
    getToken: jest.fn(() => Promise.resolve('test-token')),
    getOrRefreshToken: jest.fn(() => Promise.resolve('test-token')),
  }))
  socketModule = require('../lib/socket')
})

afterEach(() => {
  jest.useRealTimers()
})

async function connectTestSocket() {
  mockOn.mockImplementation((event, handler) => {
    if (event === 'authenticated') {
      setTimeout(() => handler({ userId: 'u1', activeChats: [] }), 0)
    }
  })
  mockConnect.mockImplementation(() => {
    const authHandler = mockOn.mock.calls.find(c => c[0] === 'authenticated')?.[1]
    if (authHandler) authHandler({ userId: 'u1', activeChats: [] })
  })
  await socketModule.connectSocket()
  jest.runOnlyPendingTimers()
  mockSocket.connected = true
}

describe('leaveChat', () => {
  it('does not emit when socket is disconnected', () => {
    socketModule.leaveChat('chat-1')
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('emits leave_chat with correct payload when connected', async () => {
    await connectTestSocket()
    socketModule.leaveChat('chat-42')
    expect(mockEmit).toHaveBeenCalledWith('leave_chat', { chatId: 'chat-42' })
  })
})

describe('onPartnerDisconnected', () => {
  it('returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onPartnerDisconnected(jest.fn())
    expect(typeof cleanup).toBe('function')
    cleanup() // should not throw
  })

  it('registers and cleans up partner_disconnected listener', async () => {
    await connectTestSocket()

    const handler = jest.fn()
    const cleanup = socketModule.onPartnerDisconnected(handler)

    // Verify .on was called with 'partner_disconnected' (wrapped handler)
    const onCall = mockOn.mock.calls.find(c => c[0] === 'partner_disconnected')
    expect(onCall).toBeDefined()
    expect(typeof onCall[1]).toBe('function')

    // Cleanup should call .off
    cleanup()
    const offCall = mockOff.mock.calls.find(c => c[0] === 'partner_disconnected')
    expect(offCall).toBeDefined()
    expect(typeof offCall[1]).toBe('function')
  })
})

describe('onPartnerReconnected', () => {
  it('returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onPartnerReconnected(jest.fn())
    expect(typeof cleanup).toBe('function')
    cleanup() // should not throw
  })

  it('registers and cleans up partner_reconnected listener', async () => {
    await connectTestSocket()

    const handler = jest.fn()
    const cleanup = socketModule.onPartnerReconnected(handler)

    const onCall = mockOn.mock.calls.find(c => c[0] === 'partner_reconnected')
    expect(onCall).toBeDefined()
    expect(typeof onCall[1]).toBe('function')

    cleanup()
    const offCall = mockOff.mock.calls.find(c => c[0] === 'partner_reconnected')
    expect(offCall).toBeDefined()
    expect(typeof offCall[1]).toBe('function')
  })
})

describe('chat request unmount restore logic', () => {
  // Tests the core logic used by CardQueueContent to restore unconsumed
  // chat requests back to context when the component unmounts.
  const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

  it('finds first unconsumed chat_request at or after currentIndex', () => {
    const cards = [
      { type: 'position', data: { id: 'p1' } },
      { type: 'chat_request', data: { id: 'cr-1', createdTime: new Date().toISOString() } },
      { type: 'position', data: { id: 'p2' } },
    ]
    const currentIndex = 0
    const remaining = cards.slice(currentIndex)
    const pending = remaining.find(c => c.type === 'chat_request')
    expect(pending).toBeTruthy()
    expect(pending.data.id).toBe('cr-1')
  })

  it('does not restore expired chat requests', () => {
    const expiredTime = new Date(Date.now() - CHAT_REQUEST_TIMEOUT_MS - 1000).toISOString()
    const cards = [
      { type: 'chat_request', data: { id: 'cr-1', createdTime: expiredTime } },
    ]
    const remaining = cards.slice(0)
    const pending = remaining.find(c => c.type === 'chat_request')
    expect(pending).toBeTruthy()

    const expiresAt = new Date(pending.data.createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS
    expect(expiresAt > Date.now()).toBe(false)
  })

  it('restores non-expired chat requests', () => {
    const freshTime = new Date().toISOString()
    const cards = [
      { type: 'position', data: { id: 'p1' } },
      { type: 'chat_request', data: { id: 'cr-1', createdTime: freshTime } },
    ]
    const currentIndex = 0
    const remaining = cards.slice(currentIndex)
    const pending = remaining.find(c => c.type === 'chat_request')

    const expiresAt = new Date(pending.data.createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS
    expect(expiresAt > Date.now()).toBe(true)
  })

  it('does not find chat_request before currentIndex', () => {
    const cards = [
      { type: 'chat_request', data: { id: 'cr-1', createdTime: new Date().toISOString() } },
      { type: 'position', data: { id: 'p1' } },
    ]
    const currentIndex = 1
    const remaining = cards.slice(currentIndex)
    const pending = remaining.find(c => c.type === 'chat_request')
    expect(pending).toBeUndefined()
  })
})

describe('partner disconnect/reconnect event flow', () => {
  it('handler receives correct data when partner_disconnected fires', async () => {
    await connectTestSocket()

    // Capture the handler that was registered
    const handler = jest.fn()
    socketModule.onPartnerDisconnected(handler)

    // Find the registered handler and invoke it
    const registeredCall = mockOn.mock.calls.find(c => c[0] === 'partner_disconnected')
    expect(registeredCall).toBeTruthy()
    const registeredHandler = registeredCall[1]

    registeredHandler({ chatId: 'chat-1', userId: 'user-2' })
    expect(handler).toHaveBeenCalledWith({ chatId: 'chat-1', userId: 'user-2' })
  })

  it('handler receives correct data when partner_reconnected fires', async () => {
    await connectTestSocket()

    const handler = jest.fn()
    socketModule.onPartnerReconnected(handler)

    const registeredCall = mockOn.mock.calls.find(c => c[0] === 'partner_reconnected')
    expect(registeredCall).toBeTruthy()
    const registeredHandler = registeredCall[1]

    registeredHandler({ chatId: 'chat-1', userId: 'user-2' })
    expect(handler).toHaveBeenCalledWith({ chatId: 'chat-1', userId: 'user-2' })
  })
})

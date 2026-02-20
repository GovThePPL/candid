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
}))

let socketModule

beforeEach(() => {
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
  }))
  socketModule = require('../lib/socket')
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

    // Verify .on was called with 'partner_disconnected'
    expect(mockOn).toHaveBeenCalledWith('partner_disconnected', handler)

    // Cleanup should call .off
    cleanup()
    expect(mockOff).toHaveBeenCalledWith('partner_disconnected', handler)
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

    expect(mockOn).toHaveBeenCalledWith('partner_reconnected', handler)

    cleanup()
    expect(mockOff).toHaveBeenCalledWith('partner_reconnected', handler)
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

/**
 * Tests for definition socket events (requestDefinition, respondDefinition,
 * acceptDefinition, counterDefine, onDefinition).
 *
 * These tests verify the socket-level behavior of definition events.
 * Follows the same pattern as chat-abandonment.test.js.
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

describe('requestDefinition', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.requestDefinition('chat-1', 'freedom')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits definition event with request action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'requested', requestId: 'req-123' })
      }
    })

    const result = await socketModule.requestDefinition('chat-42', 'liberty')
    expect(result).toEqual({ status: 'requested', requestId: 'req-123' })

    const definitionCall = mockEmit.mock.calls.find(c => c[0] === 'definition')
    expect(definitionCall).toBeDefined()
    expect(definitionCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'request',
      term: 'liberty',
    })
  })

  it('rejects on error response', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'error', message: 'Term is required' })
      }
    })

    await expect(
      socketModule.requestDefinition('chat-42', '')
    ).rejects.toThrow('Term is required')
  })
})

describe('respondDefinition', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.respondDefinition('chat-1', 'req-1', 'a meaning')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits definition event with define action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'defined', requestId: 'req-1' })
      }
    })

    const result = await socketModule.respondDefinition('chat-42', 'req-1', 'the ability to choose')
    expect(result).toEqual({ status: 'defined', requestId: 'req-1' })

    const definitionCall = mockEmit.mock.calls.find(c => c[0] === 'definition')
    expect(definitionCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'define',
      requestId: 'req-1',
      definition: 'the ability to choose',
    })
  })

  it('rejects on error response', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'error', message: 'Cannot define your own request' })
      }
    })

    await expect(
      socketModule.respondDefinition('chat-42', 'req-1', 'def')
    ).rejects.toThrow('Cannot define your own request')
  })
})

describe('acceptDefinition', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.acceptDefinition('chat-1', 'req-1')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits definition event with accept action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'accepted', requestId: 'req-1' })
      }
    })

    const result = await socketModule.acceptDefinition('chat-42', 'req-1')
    expect(result).toEqual({ status: 'accepted', requestId: 'req-1' })

    const definitionCall = mockEmit.mock.calls.find(c => c[0] === 'definition')
    expect(definitionCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'accept',
      requestId: 'req-1',
    })
  })
})

describe('counterDefine', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.counterDefine('chat-1', 'req-1', 'my definition')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits definition event with counter_define action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'definition') {
        cb({ status: 'both_defined', requestId: 'req-1' })
      }
    })

    const result = await socketModule.counterDefine('chat-42', 'req-1', 'my own definition')
    expect(result).toEqual({ status: 'both_defined', requestId: 'req-1' })

    const definitionCall = mockEmit.mock.calls.find(c => c[0] === 'definition')
    expect(definitionCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'counter_define',
      requestId: 'req-1',
      definition: 'my own definition',
    })
  })
})

describe('onDefinition', () => {
  it('returns noop cleanup when not connected', () => {
    const cleanup = socketModule.onDefinition(() => {})
    expect(typeof cleanup).toBe('function')
    expect(mockOn).not.toHaveBeenCalledWith('definition', expect.any(Function))
  })

  it('registers definition listener when connected', async () => {
    await connectTestSocket()
    const handler = jest.fn()
    socketModule.onDefinition(handler)

    const definitionCall = mockOn.mock.calls.find(c => c[0] === 'definition')
    expect(definitionCall).toBeDefined()
  })

  it('cleanup removes definition listener', async () => {
    await connectTestSocket()
    const handler = jest.fn()
    const cleanup = socketModule.onDefinition(handler)

    cleanup()

    const offCall = mockOff.mock.calls.find(c => c[0] === 'definition')
    expect(offCall).toBeDefined()
    expect(typeof offCall[1]).toBe('function')
  })
})

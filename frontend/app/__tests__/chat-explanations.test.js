/**
 * Tests for explain_position socket events (requestExplanation, respondExplanation,
 * confirmGoodFaith, rejectExplanation, acceptExplanation, correctExplanation,
 * onExplainPosition).
 *
 * Follows the same pattern as chat-definitions.test.js.
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

describe('requestExplanation', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.requestExplanation('chat-1', 'Climate change is urgent')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with request action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'requested', requestId: 'req-123' })
      }
    })

    const result = await socketModule.requestExplanation('chat-42', 'Universal healthcare is essential')
    expect(result).toEqual({ status: 'requested', requestId: 'req-123' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall).toBeDefined()
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'request',
      position: 'Universal healthcare is essential',
    })
  })

  it('rejects on error response', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'error', message: 'Position is required' })
      }
    })

    await expect(
      socketModule.requestExplanation('chat-42', '')
    ).rejects.toThrow('Position is required')
  })
})

describe('respondExplanation', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.respondExplanation('chat-1', 'req-1', 'They believe...')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with explain action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'explained', requestId: 'req-1' })
      }
    })

    const result = await socketModule.respondExplanation('chat-42', 'req-1', 'You believe healthcare should be free')
    expect(result).toEqual({ status: 'explained', requestId: 'req-1' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'explain',
      requestId: 'req-1',
      explanation: 'You believe healthcare should be free',
    })
  })

  it('rejects on error response', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'error', message: 'Cannot explain your own request' })
      }
    })

    await expect(
      socketModule.respondExplanation('chat-42', 'req-1', 'explanation')
    ).rejects.toThrow('Cannot explain your own request')
  })
})

describe('confirmGoodFaith', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.confirmGoodFaith('chat-1', 'req-1')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with good_faith action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'good_faith', requestId: 'req-1' })
      }
    })

    const result = await socketModule.confirmGoodFaith('chat-42', 'req-1')
    expect(result).toEqual({ status: 'good_faith', requestId: 'req-1' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'good_faith',
      requestId: 'req-1',
    })
  })
})

describe('rejectExplanation', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.rejectExplanation('chat-1', 'req-1')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with reject action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'rejected', requestId: 'req-1' })
      }
    })

    const result = await socketModule.rejectExplanation('chat-42', 'req-1')
    expect(result).toEqual({ status: 'rejected', requestId: 'req-1' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'reject',
      requestId: 'req-1',
    })
  })
})

describe('acceptExplanation', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.acceptExplanation('chat-1', 'req-1')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with accept action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'completed', requestId: 'req-1' })
      }
    })

    const result = await socketModule.acceptExplanation('chat-42', 'req-1')
    expect(result).toEqual({ status: 'completed', requestId: 'req-1' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'accept',
      requestId: 'req-1',
    })
  })
})

describe('correctExplanation', () => {
  it('throws when not connected', async () => {
    await expect(
      socketModule.correctExplanation('chat-1', 'req-1', 'Actually I meant...')
    ).rejects.toThrow('Not connected to chat server')
  })

  it('emits explain_position event with correct action', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'corrected', requestId: 'req-1' })
      }
    })

    const result = await socketModule.correctExplanation('chat-42', 'req-1', 'I believe in balanced reform')
    expect(result).toEqual({ status: 'corrected', requestId: 'req-1' })

    const emitCall = mockEmit.mock.calls.find(c => c[0] === 'explain_position')
    expect(emitCall[1]).toEqual({
      chatId: 'chat-42',
      action: 'correct',
      requestId: 'req-1',
      correction: 'I believe in balanced reform',
    })
  })

  it('rejects on error response', async () => {
    await connectTestSocket()
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'explain_position') {
        cb({ status: 'error', message: 'Correction is required' })
      }
    })

    await expect(
      socketModule.correctExplanation('chat-42', 'req-1', '')
    ).rejects.toThrow('Correction is required')
  })
})

describe('onExplainPosition', () => {
  it('returns noop cleanup when not connected', () => {
    const cleanup = socketModule.onExplainPosition(() => {})
    expect(typeof cleanup).toBe('function')
    expect(mockOn).not.toHaveBeenCalledWith('explain_position', expect.any(Function))
  })

  it('registers explain_position listener when connected', async () => {
    await connectTestSocket()
    const handler = jest.fn()
    socketModule.onExplainPosition(handler)

    const listenCall = mockOn.mock.calls.find(c => c[0] === 'explain_position')
    expect(listenCall).toBeDefined()
  })

  it('cleanup removes explain_position listener', async () => {
    await connectTestSocket()
    const handler = jest.fn()
    const cleanup = socketModule.onExplainPosition(handler)

    cleanup()

    const offCall = mockOff.mock.calls.find(c => c[0] === 'explain_position')
    expect(offCall).toBeDefined()
    expect(offCall[1]).toBe(handler)
  })
})

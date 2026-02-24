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

jest.mock('../../lib/api', () => ({
  getToken: jest.fn(() => Promise.resolve('test-token')),
  getOrRefreshToken: jest.fn(() => Promise.resolve('test-token')),
}))

// Reset module state between tests to clear the internal `socket` variable
let socketModule

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockSocket.connected = false
  mockOn.mockReset()
  mockOff.mockReset()
  mockEmit.mockReset()
  mockConnect.mockReset()
  mockDisconnect.mockReset()
  mockRemoveAllListeners.mockReset()

  jest.resetModules()
  // Re-mock after resetModules
  jest.mock('socket.io-client', () => ({
    io: jest.fn(() => mockSocket),
  }))
  jest.mock('../../lib/api', () => ({
    getToken: jest.fn(() => Promise.resolve('test-token')),
    getOrRefreshToken: jest.fn(() => Promise.resolve('test-token')),
  }))
  socketModule = require('../../lib/socket')
})

afterEach(() => {
  jest.useRealTimers()
})

describe('connectSocket', () => {
  it('passes token in auth handshake and resolves on authenticated event', async () => {
    const { io } = require('socket.io-client')

    // Simulate: connect triggers server 'authenticated' event
    mockOn.mockImplementation((event, handler) => {
      if (event === 'authenticated') {
        // Server emits authenticated after accepting handshake
        setTimeout(() => handler({ userId: 'u1', activeChats: [] }), 0)
      }
    })

    mockConnect.mockImplementation(() => {
      const authHandler = mockOn.mock.calls.find(c => c[0] === 'authenticated')?.[1]
      if (authHandler) authHandler({ userId: 'u1', activeChats: [] })
    })

    const result = await socketModule.connectSocket()
    expect(result).toBe(mockSocket)
    // Verify auth is a dynamic callback that resolves to the token
    const authArg = io.mock.calls[0][1].auth
    expect(typeof authArg).toBe('function')
    // Call the auth callback and verify it uses getOrRefreshToken() for fresh tokens
    const { getOrRefreshToken } = require('../../lib/api')
    getOrRefreshToken.mockResolvedValueOnce('fresh-token')
    const cb = jest.fn()
    await authArg(cb)
    expect(cb).toHaveBeenCalledWith({ token: 'fresh-token' })
  })

  it('reuses existing connected socket', async () => {
    const { io } = require('socket.io-client')

    mockSocket.connected = true
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

    // Second call should return immediately
    const result = await socketModule.connectSocket()
    expect(result).toBe(mockSocket)
    expect(io).toHaveBeenCalledTimes(1)
  })

  it('throws when no token available', async () => {
    const { getToken, getOrRefreshToken } = require('../../lib/api')
    getToken.mockResolvedValueOnce(null)
    getOrRefreshToken.mockResolvedValueOnce(null)

    await expect(socketModule.connectSocket()).rejects.toThrow('No authentication token available')
  })

  it('rejects on initial connect_error', async () => {
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect_error') {
        setTimeout(() => {
          handler(new Error('invalid or expired token'))
        }, 0)
      }
    })

    mockConnect.mockImplementation(() => {
      const errorHandler = mockOn.mock.calls.find(c => c[0] === 'connect_error')?.[1]
      if (errorHandler) {
        errorHandler(new Error('invalid or expired token'))
      }
    })

    await expect(socketModule.connectSocket()).rejects.toThrow('invalid or expired token')
  })

  it('disables built-in reconnection', async () => {
    const { io } = require('socket.io-client')

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

    const opts = io.mock.calls[0][1]
    expect(opts.reconnection).toBe(false)
  })
})

describe('preConnectHook', () => {
  it('calls preConnectHook before socket.connect()', async () => {
    const callOrder = []

    mockOn.mockImplementation((event, handler) => {
      if (event === 'authenticated') {
        setTimeout(() => handler({ userId: 'u1', activeChats: [] }), 0)
      }
    })
    mockConnect.mockImplementation(() => {
      callOrder.push('connect')
      const authHandler = mockOn.mock.calls.find(c => c[0] === 'authenticated')?.[1]
      if (authHandler) authHandler({ userId: 'u1', activeChats: [] })
    })

    const preConnectHook = jest.fn(() => {
      callOrder.push('preConnectHook')
    })

    await socketModule.connectSocket(null, { preConnectHook })

    expect(preConnectHook).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['preConnectHook', 'connect'])
  })

  it('allows registering listeners in preConnectHook', async () => {
    mockOn.mockImplementation((event, handler) => {
      if (event === 'authenticated') {
        setTimeout(() => handler({ userId: 'u1', activeChats: [] }), 0)
      }
    })
    mockConnect.mockImplementation(() => {
      const authHandler = mockOn.mock.calls.find(c => c[0] === 'authenticated')?.[1]
      if (authHandler) authHandler({ userId: 'u1', activeChats: [] })
    })

    let cleanup
    await socketModule.connectSocket(null, {
      preConnectHook: () => {
        // socket is set, so on* helpers should work
        cleanup = socketModule.onChatRequestReceived(jest.fn())
      },
    })

    // Listener should have been registered (not noop)
    expect(mockOn).toHaveBeenCalledWith('chat_request_received', expect.any(Function))
    expect(typeof cleanup).toBe('function')
  })
})

describe('reconnect behavior', () => {
  it('schedules reconnect on disconnect (not intentional)', async () => {
    // Use real timers for this test since reconnect uses setTimeout + async
    jest.useRealTimers()

    const handlers = {}
    mockOn.mockImplementation((event, handler) => {
      handlers[event] = handler
    })
    mockConnect.mockImplementation(() => {
      if (handlers.authenticated) handlers.authenticated({ userId: 'u1', activeChats: [] })
    })

    await socketModule.connectSocket()
    expect(handlers.disconnect).toBeDefined()
    mockConnect.mockClear()

    // Simulate disconnect
    handlers.disconnect('transport close')

    // Wait for the 1s backoff + async getOrRefreshToken to complete
    await new Promise(r => setTimeout(r, 1500))

    // socket.connect() should have been called for reconnect
    expect(mockConnect).toHaveBeenCalled()

    jest.useFakeTimers()
  })

  it('does not reconnect after intentional disconnectSocket()', async () => {
    let disconnectHandler
    mockOn.mockImplementation((event, handler) => {
      if (event === 'authenticated') {
        setTimeout(() => handler({ userId: 'u1', activeChats: [] }), 0)
      }
      if (event === 'disconnect') {
        disconnectHandler = handler
      }
    })
    mockConnect.mockImplementation(() => {
      const authHandler = mockOn.mock.calls.find(c => c[0] === 'authenticated')?.[1]
      if (authHandler) authHandler({ userId: 'u1', activeChats: [] })
    })

    await socketModule.connectSocket()

    // Intentional disconnect
    socketModule.disconnectSocket()
    mockConnect.mockClear()

    // Advance timers — should NOT attempt reconnect
    jest.advanceTimersByTime(60000)
    await Promise.resolve()
    expect(mockConnect).not.toHaveBeenCalled()
  })
})

describe('reconnectNow', () => {
  it('reconnects existing disconnected socket without creating a new one', async () => {
    const { io } = require('socket.io-client')

    const handlers = {}
    mockOn.mockImplementation((event, handler) => {
      handlers[event] = handler
    })
    mockConnect.mockImplementation(() => {
      if (handlers.authenticated) handlers.authenticated({ userId: 'u1', activeChats: [] })
    })

    await socketModule.connectSocket()
    const initialCallCount = io.mock.calls.length

    // Simulate disconnect
    mockSocket.connected = false
    mockConnect.mockClear()

    // reconnectNow should reuse existing socket, not create a new one
    socketModule.reconnectNow()
    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(io.mock.calls.length).toBe(initialCallCount) // No new io() call
  })

  it('does nothing when socket is already connected', async () => {
    const handlers = {}
    mockOn.mockImplementation((event, handler) => {
      handlers[event] = handler
    })
    mockConnect.mockImplementation(() => {
      if (handlers.authenticated) handlers.authenticated({ userId: 'u1', activeChats: [] })
    })

    await socketModule.connectSocket()
    mockSocket.connected = true
    mockConnect.mockClear()

    socketModule.reconnectNow()
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('does nothing when no socket exists', () => {
    socketModule.reconnectNow()
    expect(mockConnect).not.toHaveBeenCalled()
  })
})

describe('disconnectSocket', () => {
  it('disconnects and clears socket', async () => {
    // First connect
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

    socketModule.disconnectSocket()
    expect(mockDisconnect).toHaveBeenCalled()
    expect(socketModule.getSocket()).toBeNull()
  })

  it('does nothing when not connected', () => {
    socketModule.disconnectSocket()
    expect(mockDisconnect).not.toHaveBeenCalled()
  })
})

describe('isConnected', () => {
  it('returns false when no socket', () => {
    expect(socketModule.isConnected()).toBe(false)
  })
})

describe('getSocket', () => {
  it('returns null when not connected', () => {
    expect(socketModule.getSocket()).toBeNull()
  })
})

describe('event listeners', () => {
  it('onMessage returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onMessage(jest.fn())
    expect(typeof cleanup).toBe('function')
    cleanup() // Should not throw
  })

  it('onChatRequestResponse returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onChatRequestResponse({
      onAccepted: jest.fn(),
      onDeclined: jest.fn(),
    })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onChatRequestReceived returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onChatRequestReceived(jest.fn())
    expect(typeof cleanup).toBe('function')
  })

  it('onChatStarted returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onChatStarted(jest.fn())
    expect(typeof cleanup).toBe('function')
  })

  it('onTyping returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onTyping(jest.fn())
    expect(typeof cleanup).toBe('function')
  })

  it('onChatStatus returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onChatStatus(jest.fn())
    expect(typeof cleanup).toBe('function')
  })

  it('onReadReceipt returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onReadReceipt(jest.fn())
    expect(typeof cleanup).toBe('function')
  })

  it('onAgreedPosition returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onAgreedPosition(jest.fn())
    expect(typeof cleanup).toBe('function')
  })
})

describe('emit functions without connection', () => {
  it('joinChat throws when not connected', async () => {
    await expect(socketModule.joinChat('chat-1')).rejects.toThrow('Not connected')
  })

  it('sendMessage throws when not connected', async () => {
    await expect(socketModule.sendMessage('chat-1', 'hi')).rejects.toThrow('Not connected')
  })

  it('exitChat throws when not connected', async () => {
    await expect(socketModule.exitChat('chat-1')).rejects.toThrow('Not connected')
  })

  it('sendTyping does nothing when not connected', () => {
    // Should not throw
    socketModule.sendTyping('chat-1', true)
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('sendReadReceipt does nothing when not connected', () => {
    socketModule.sendReadReceipt('chat-1', 'msg-1')
    expect(mockEmit).not.toHaveBeenCalled()
  })
})

describe('exitChat with connected socket', () => {
  beforeEach(async () => {
    // Connect the socket first
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
  })

  it('resolves when server responds with status "ended"', async () => {
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'exit_chat' && cb) {
        cb({ status: 'ended', chatId: 'chat-1' })
      }
    })

    const result = await socketModule.exitChat('chat-1')
    expect(result).toEqual({ status: 'ended', chatId: 'chat-1' })
  })

  it('rejects when server responds with error status', async () => {
    mockEmit.mockImplementation((event, data, cb) => {
      if (event === 'exit_chat' && cb) {
        cb({ status: 'error', message: 'Not a participant in this chat' })
      }
    })

    await expect(socketModule.exitChat('chat-1')).rejects.toThrow('Not a participant in this chat')
  })
})

describe('leaveChat', () => {
  it('does nothing when not connected', () => {
    socketModule.leaveChat('chat-1')
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('emits leave_chat when connected', async () => {
    // Connect first
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

    socketModule.leaveChat('chat-1')
    expect(mockEmit).toHaveBeenCalledWith('leave_chat', { chatId: 'chat-1' })
  })
})

describe('partner disconnect/reconnect listeners', () => {
  it('onPartnerDisconnected returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onPartnerDisconnected(jest.fn())
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('onPartnerReconnected returns noop cleanup when no socket', () => {
    const cleanup = socketModule.onPartnerReconnected(jest.fn())
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})

describe('emit functions without connection (continued)', () => {
  it('proposeAgreedPosition throws when not connected', async () => {
    await expect(socketModule.proposeAgreedPosition('chat-1', 'statement')).rejects.toThrow('Not connected')
  })

  it('respondToAgreedPosition throws when not connected', async () => {
    await expect(socketModule.respondToAgreedPosition('chat-1', 'p1', 'accept')).rejects.toThrow('Not connected')
  })
})

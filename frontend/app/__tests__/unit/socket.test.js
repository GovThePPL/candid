// Mock socket.io-client
const mockOn = jest.fn()
const mockOff = jest.fn()
const mockEmit = jest.fn()
const mockConnect = jest.fn()
const mockDisconnect = jest.fn()

const mockSocket = {
  on: mockOn,
  off: mockOff,
  emit: mockEmit,
  connect: mockConnect,
  disconnect: mockDisconnect,
  connected: false,
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

jest.mock('../../lib/api', () => ({
  getToken: jest.fn(() => Promise.resolve('test-token')),
}))

// Reset module state between tests to clear the internal `socket` variable
let socketModule

beforeEach(() => {
  jest.clearAllMocks()
  mockSocket.connected = false
  mockOn.mockReset()
  mockOff.mockReset()
  mockEmit.mockReset()
  mockConnect.mockReset()
  mockDisconnect.mockReset()

  jest.resetModules()
  // Re-mock after resetModules
  jest.mock('socket.io-client', () => ({
    io: jest.fn(() => mockSocket),
  }))
  jest.mock('../../lib/api', () => ({
    getToken: jest.fn(() => Promise.resolve('test-token')),
  }))
  socketModule = require('../../lib/socket')
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
    // Call the auth callback and verify it provides the token
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    AsyncStorage.getItem.mockResolvedValueOnce('fresh-token')
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
    const { getToken } = require('../../lib/api')
    getToken.mockResolvedValueOnce(null)

    await expect(socketModule.connectSocket()).rejects.toThrow('No authentication token available')
  })

  it('rejects after max connect_error attempts', async () => {
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect_error') {
        // Simulate 5 consecutive failures (auth rejection at handshake)
        setTimeout(() => {
          for (let i = 0; i < 5; i++) {
            handler(new Error('invalid or expired token'))
          }
        }, 0)
      }
    })

    mockConnect.mockImplementation(() => {
      const errorHandler = mockOn.mock.calls.find(c => c[0] === 'connect_error')?.[1]
      if (errorHandler) {
        for (let i = 0; i < 5; i++) {
          errorHandler(new Error('invalid or expired token'))
        }
      }
    })

    await expect(socketModule.connectSocket()).rejects.toThrow('invalid or expired token')
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

  it('proposeAgreedPosition throws when not connected', async () => {
    await expect(socketModule.proposeAgreedPosition('chat-1', 'statement')).rejects.toThrow('Not connected')
  })

  it('respondToAgreedPosition throws when not connected', async () => {
    await expect(socketModule.respondToAgreedPosition('chat-1', 'p1', 'accept')).rejects.toThrow('Not connected')
  })
})

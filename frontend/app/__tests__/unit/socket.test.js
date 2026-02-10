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
  it('gets token from api and creates socket', async () => {
    // Simulate connect event -> authenticate success
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect') {
        // Call connect handler after socket.connect()
        setTimeout(() => handler(), 0)
      }
    })
    mockEmit.mockImplementation((event, data, callback) => {
      if (event === 'authenticate') {
        callback({ status: 'authenticated', userId: 'u1' })
      }
    })
    mockConnect.mockImplementation(() => {
      // Trigger connect event
      const connectHandler = mockOn.mock.calls.find(c => c[0] === 'connect')?.[1]
      if (connectHandler) connectHandler()
    })

    const result = await socketModule.connectSocket()
    expect(result).toBe(mockSocket)
  })

  it('reuses existing connected socket', async () => {
    // First simulate an existing connected socket
    mockSocket.connected = true
    // Set internal socket by calling connectSocket with connected mock
    // Actually, getSocket returns internal socket. Let's test differently.
    // Use connectSocket first, then call again
    const { io } = require('socket.io-client')

    // On second call, socket.connected is true so it should return immediately
    mockSocket.connected = true
    // Need to set the internal socket variable - do a successful connect first
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect') setTimeout(() => handler(), 0)
    })
    mockEmit.mockImplementation((event, data, callback) => {
      if (event === 'authenticate') callback({ status: 'authenticated', userId: 'u1' })
    })
    mockConnect.mockImplementation(() => {
      const connectHandler = mockOn.mock.calls.find(c => c[0] === 'connect')?.[1]
      if (connectHandler) connectHandler()
    })

    await socketModule.connectSocket()
    mockSocket.connected = true

    // Second call should return immediately
    const result = await socketModule.connectSocket()
    expect(result).toBe(mockSocket)
    // io should only be called once (from first connect)
    expect(io).toHaveBeenCalledTimes(1)
  })

  it('throws when no token available', async () => {
    const { getToken } = require('../../lib/api')
    getToken.mockResolvedValueOnce(null)

    await expect(socketModule.connectSocket()).rejects.toThrow('No authentication token available')
  })

  it('rejects on authentication failure', async () => {
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect') setTimeout(() => handler(), 0)
    })
    mockEmit.mockImplementation((event, data, callback) => {
      if (event === 'authenticate') callback({ status: 'error', message: 'Invalid token' })
    })
    mockConnect.mockImplementation(() => {
      const connectHandler = mockOn.mock.calls.find(c => c[0] === 'connect')?.[1]
      if (connectHandler) connectHandler()
    })

    await expect(socketModule.connectSocket()).rejects.toThrow('Invalid token')
  })
})

describe('disconnectSocket', () => {
  it('disconnects and clears socket', async () => {
    // First connect
    mockOn.mockImplementation((event, handler) => {
      if (event === 'connect') setTimeout(() => handler(), 0)
    })
    mockEmit.mockImplementation((event, data, callback) => {
      if (event === 'authenticate') callback({ status: 'authenticated', userId: 'u1' })
    })
    mockConnect.mockImplementation(() => {
      const connectHandler = mockOn.mock.calls.find(c => c[0] === 'connect')?.[1]
      if (connectHandler) connectHandler()
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

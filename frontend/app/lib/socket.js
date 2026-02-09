import { io } from 'socket.io-client'
import { getToken } from './api'

// Socket.IO configuration
const CHAT_SERVER_URL = process.env.EXPO_PUBLIC_CHAT_URL
  || (__DEV__ ? 'http://localhost:8002' : 'https://chat.candid.app')

let socket = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

/**
 * Connect to the chat server with authentication.
 * @param {string} token - JWT token for authentication
 * @returns {Promise<Socket>} - Connected and authenticated socket
 */
export async function connectSocket(token = null) {
  if (socket?.connected) {
    return socket
  }

  // Get token if not provided
  const authToken = token || await getToken()
  if (!authToken) {
    throw new Error('No authentication token available')
  }

  return new Promise((resolve, reject) => {
    socket = io(CHAT_SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    // Handle connection
    socket.on('connect', () => {
      console.log('[Socket] Connected, authenticating...')
      reconnectAttempts = 0
      socket.emit('authenticate', { token: authToken }, (response) => {
        if (response?.status === 'authenticated') {
          console.log('[Socket] Authenticated as user:', response.userId)
          resolve(socket)
        } else {
          console.error('[Socket] Authentication failed:', response)
          socket.disconnect()
          reject(new Error(response?.message || 'Authentication failed'))
        }
      })
    })

    // Handle connection errors
    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message)
      reconnectAttempts++
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        reject(new Error('Failed to connect to chat server'))
      }
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })

    // Connect
    socket.connect()
  })
}

/**
 * Disconnect from the chat server.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    reconnectAttempts = 0
    console.log('[Socket] Disconnected and cleaned up')
  }
}

/**
 * Get the current socket instance.
 * @returns {Socket|null} - Current socket or null if not connected
 */
export function getSocket() {
  return socket
}

/**
 * Check if socket is connected and authenticated.
 * @returns {boolean}
 */
export function isConnected() {
  return socket?.connected ?? false
}

/**
 * Set up event listeners for chat request responses.
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onAccepted - Called when request is accepted
 * @param {Function} handlers.onDeclined - Called when request is declined
 * @returns {Function} - Cleanup function to remove listeners
 */
export function onChatRequestResponse(handlers) {
  if (!socket) {
    console.warn('[Socket] Cannot set up listeners - not connected')
    return () => {}
  }

  const { onAccepted, onDeclined } = handlers

  if (onAccepted) {
    socket.on('chat_request_accepted', onAccepted)
  }
  if (onDeclined) {
    socket.on('chat_request_declined', onDeclined)
  }

  // Return cleanup function
  return () => {
    if (socket) {
      if (onAccepted) socket.off('chat_request_accepted', onAccepted)
      if (onDeclined) socket.off('chat_request_declined', onDeclined)
    }
  }
}

/**
 * Set up event listener for incoming chat request cards (real-time delivery).
 * @param {Function} handler - Called with chat request card data
 * @returns {Function} - Cleanup function
 */
export function onChatRequestReceived(handler) {
  if (!socket) {
    console.warn('[Socket] Cannot set up listener - not connected')
    return () => {}
  }

  socket.on('chat_request_received', handler)
  return () => {
    if (socket) socket.off('chat_request_received', handler)
  }
}

/**
 * Set up event listener for chat started events.
 * @param {Function} handler - Called when a chat is started
 * @returns {Function} - Cleanup function
 */
export function onChatStarted(handler) {
  if (!socket) {
    console.warn('[Socket] Cannot set up listener - not connected')
    return () => {}
  }

  socket.on('chat_started', handler)
  return () => {
    if (socket) socket.off('chat_started', handler)
  }
}

/**
 * Join a chat room.
 * @param {string} chatId - Chat log ID
 * @returns {Promise<Object>} - Join response with messages and agreed positions
 */
export async function joinChat(chatId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    socket.emit('join_chat', { chatId }, (response) => {
      if (response?.status === 'joined') {
        resolve(response)
      } else {
        reject(new Error(response?.message || 'Failed to join chat'))
      }
    })
  })
}

/**
 * Send a message in a chat.
 * @param {string} chatId - Chat log ID
 * @param {string} content - Message content
 * @param {string} type - Message type ('text', 'position_proposal', etc.)
 * @returns {Promise<Object>} - Message send response
 */
export async function sendMessage(chatId, content, type = 'text') {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    socket.emit('message', { chatId, content, type }, (response) => {
      if (response?.status === 'sent' || response?.id) {
        resolve(response)
      } else {
        reject(new Error(response?.message || 'Failed to send message'))
      }
    })
  })
}

/**
 * Set up listener for incoming messages.
 * @param {Function} handler - Called with message data
 * @returns {Function} - Cleanup function
 */
export function onMessage(handler) {
  if (!socket) {
    console.warn('[Socket] Cannot set up listener - not connected')
    return () => {}
  }

  socket.on('message', handler)
  return () => {
    if (socket) socket.off('message', handler)
  }
}

/**
 * Send typing indicator.
 * @param {string} chatId - Chat log ID
 * @param {boolean} isTyping - Whether user is typing
 */
export function sendTyping(chatId, isTyping) {
  if (socket?.connected) {
    socket.emit('typing', { chatId, isTyping })
  }
}

/**
 * Set up listener for typing indicators.
 * @param {Function} handler - Called with typing data
 * @returns {Function} - Cleanup function
 */
export function onTyping(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('typing', handler)
  return () => {
    if (socket) socket.off('typing', handler)
  }
}

/**
 * Exit a chat.
 * @param {string} chatId - Chat log ID
 * @param {string} exitType - Exit type ('left', 'mutual_exit', etc.)
 * @returns {Promise<Object>} - Exit response
 */
export async function exitChat(chatId, exitType = 'left') {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    socket.emit('exit_chat', { chatId, exitType }, (response) => {
      if (response?.status === 'exited' || response?.status === 'ok') {
        resolve(response)
      } else {
        reject(new Error(response?.message || 'Failed to exit chat'))
      }
    })
  })
}

/**
 * Set up listener for chat status changes.
 * @param {Function} handler - Called with status data
 * @returns {Function} - Cleanup function
 */
export function onChatStatus(handler) {
  if (!socket) {
    return () => {}
  }

  // Backend emits 'status' events for chat lifecycle changes
  socket.on('status', handler)
  socket.on('chat_status', handler)
  socket.on('chat_ended', handler)
  return () => {
    if (socket) {
      socket.off('status', handler)
      socket.off('chat_status', handler)
      socket.off('chat_ended', handler)
    }
  }
}

/**
 * Send a read receipt for a message.
 * @param {string} chatId - Chat log ID
 * @param {string} messageId - ID of the last read message
 */
export function sendReadReceipt(chatId, messageId) {
  if (socket?.connected) {
    socket.emit('mark_read', { chatId, messageId })
  }
}

/**
 * Set up listener for read receipts.
 * @param {Function} handler - Called with read receipt data { chatId, userId, messageId }
 * @returns {Function} - Cleanup function
 */
export function onReadReceipt(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('read_receipt', handler)
  return () => {
    if (socket) socket.off('read_receipt', handler)
  }
}

/**
 * Propose an agreed position or closure.
 * @param {string} chatId - Chat log ID
 * @param {string} content - The proposed statement text
 * @param {boolean} isClosure - Whether this is a closure proposal
 * @returns {Promise<Object>} - Proposal response with proposalId
 */
export async function proposeAgreedPosition(chatId, content, isClosure = false) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    socket.emit('agreed_position', {
      chatId,
      action: 'propose',
      content,
      isClosure,
    }, (response) => {
      if (response?.status === 'proposed') {
        resolve(response)
      } else {
        reject(new Error(response?.message || 'Failed to propose position'))
      }
    })
  })
}

/**
 * Respond to an agreed position proposal.
 * @param {string} chatId - Chat log ID
 * @param {string} proposalId - The proposal ID to respond to
 * @param {string} action - 'accept', 'reject', or 'modify'
 * @param {string} content - New content (required for 'modify' action)
 * @returns {Promise<Object>} - Response
 */
export async function respondToAgreedPosition(chatId, proposalId, action, content = null) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    const data = {
      chatId,
      action,
      proposalId,
    }
    if (content) {
      data.content = content
    }

    socket.emit('agreed_position', data, (response) => {
      if (response?.status === action + 'ed' || response?.status === 'ended') {
        resolve(response)
      } else {
        reject(new Error(response?.message || `Failed to ${action} proposal`))
      }
    })
  })
}

/**
 * Set up listener for agreed position events.
 * @param {Function} handler - Called with agreed position data
 * @returns {Function} - Cleanup function
 */
export function onAgreedPosition(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('agreed_position', handler)
  return () => {
    if (socket) socket.off('agreed_position', handler)
  }
}

export default {
  connect: connectSocket,
  disconnect: disconnectSocket,
  getSocket,
  isConnected,
  onChatRequestResponse,
  onChatRequestReceived,
  onChatStarted,
  joinChat,
  sendMessage,
  onMessage,
  sendTyping,
  onTyping,
  exitChat,
  onChatStatus,
  sendReadReceipt,
  onReadReceipt,
  proposeAgreedPosition,
  respondToAgreedPosition,
  onAgreedPosition,
}

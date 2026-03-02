import { io } from 'socket.io-client'
import { getToken, getOrRefreshToken } from './api'
import { recordDebug } from './errorCollector'

// Socket.IO configuration
const CHAT_SERVER_URL = process.env.EXPO_PUBLIC_CHAT_URL
  || (__DEV__ ? 'http://localhost:8002' : 'https://chat.candid.app')

let socket = null
let keepaliveInterval = null
const KEEPALIVE_INTERVAL_MS = 60000 // 60s (server timeout is 120s)

// Custom reconnect state (replaces Socket.IO's built-in reconnection)
let _intentionalDisconnect = false
let _reconnectTimer = null
let _reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 30000
let _reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 15
let _onReconnectExhausted = null
let _reconnecting = false

export function setOnReconnectExhausted(cb) {
  _onReconnectExhausted = cb
}

/**
 * Schedule a reconnect attempt with exponential backoff.
 * Stops after MAX_RECONNECT_ATTEMPTS and calls _onReconnectExhausted.
 */
function _scheduleReconnect() {
  if (_intentionalDisconnect || !socket) return

  clearTimeout(_reconnectTimer)

  _reconnectAttempts++
  if (_reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.warn('[Socket] Max reconnect attempts reached, giving up')
    _reconnecting = false
    _onReconnectExhausted?.()
    return
  }

  const delay = _reconnectDelay
  console.debug(`[Socket] Scheduling reconnect in ${delay}ms (attempt ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

  _reconnectTimer = setTimeout(async () => {
    if (_intentionalDisconnect || !socket) return
    if (_reconnecting) return
    _reconnecting = true

    try {
      const freshToken = await getOrRefreshToken()
      if (!freshToken) {
        console.warn('[Socket] No token for reconnect, retrying later')
        _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY)
        _reconnecting = false
        _scheduleReconnect()
        return
      }
    } catch (err) {
      console.warn('[Socket] Token refresh failed before reconnect:', err?.message)
      _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY)
      _reconnecting = false
      _scheduleReconnect()
      return
    }

    if (!_intentionalDisconnect && socket) {
      console.debug('[Socket] Attempting reconnect')
      _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY)
      socket.connect()
    }
    _reconnecting = false
  }, delay)
}

/**
 * Connect to the chat server with authentication.
 * @param {string} token - JWT token for authentication
 * @param {Object} [options]
 * @param {Function} [options.preConnectHook] - Called after socket is created but
 *   before socket.connect(). Use this to register event listeners that must exist
 *   before the server emits pending data during the connection handshake.
 * @returns {Promise<Socket>} - Connected and authenticated socket
 */
export async function connectSocket(token = null, { preConnectHook } = {}) {
  if (socket?.connected) {
    return socket
  }

  // Clean up any existing disconnected socket before creating a new one
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }

  // Get token if not provided
  const authToken = token || await getOrRefreshToken() || await getToken()
  if (!authToken) {
    throw new Error('No authentication token available')
  }

  _intentionalDisconnect = false
  _reconnectDelay = 1000
  _reconnectAttempts = 0
  clearTimeout(_reconnectTimer)

  return new Promise((resolve, reject) => {
    let initialResolved = false

    socket = io(CHAT_SERVER_URL, {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: false, // We handle reconnection ourselves
      timeout: 10000,
      auth: (cb) => {
        // Dynamic callback: fetches fresh token on each reconnect attempt
        getOrRefreshToken()
          .then(t => {
            if (t) {
              cb({ token: t })
            } else {
              console.warn('[Socket] auth callback: no fresh token available')
              cb({ token: null })
            }
          })
          .catch(err => {
            console.warn('[Socket] auth callback: token refresh failed', err?.message)
            cb({ token: null })
          })
      },
    })

    // Persistent lifecycle listeners (survive across reconnects)
    socket.on('authenticated', (data) => {
      console.debug('[Socket] Authenticated as user:', data.userId)
      recordDebug('socket', 'Authenticated', { userId: data.userId })
      _reconnectDelay = 1000 // Reset backoff on success
      _reconnectAttempts = 0
      _reconnecting = false
      clearTimeout(_reconnectTimer)
      _startKeepalive()
      if (!initialResolved) {
        initialResolved = true
        resolve(socket)
      }
    })

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message)
      recordDebug('socket', 'Connection error', { error: error.message })
      _reconnecting = false
      if (!initialResolved) {
        initialResolved = true
        reject(new Error(error.message || 'Failed to connect to chat server'))
      } else {
        // Ongoing reconnect failure — schedule another attempt
        _scheduleReconnect()
      }
    })

    socket.on('disconnect', (reason) => {
      console.debug('[Socket] Disconnected:', reason)
      recordDebug('socket', 'Disconnected', { reason })
      _stopKeepalive()
      if (!_intentionalDisconnect) {
        _scheduleReconnect()
      }
    })

    // Call preConnectHook after socket is assigned but before connect().
    // This lets callers register listeners that will exist before the server
    // emits pending data (e.g., chat requests) during the handshake.
    if (preConnectHook) {
      preConnectHook()
    }

    // Connect
    socket.connect()
  })
}

function _startKeepalive() {
  _stopKeepalive()
  keepaliveInterval = setInterval(() => {
    if (socket?.connected) {
      socket.emit('ping', {})
    }
  }, KEEPALIVE_INTERVAL_MS)
}

function _stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval)
    keepaliveInterval = null
  }
}

/**
 * Immediately reconnect an existing disconnected socket.
 * Unlike initializeSocket → connectSocket, this reuses the same socket instance,
 * preserving all registered listeners (e.g., chat screen message/typing handlers).
 * No-op if socket is already connected, doesn't exist, or was intentionally disconnected.
 */
export async function reconnectNow() {
  if (!socket || socket.connected || _intentionalDisconnect) return
  if (_reconnecting) return
  _reconnecting = true
  clearTimeout(_reconnectTimer)
  _reconnectDelay = 1000
  _reconnectAttempts = 0
  _intentionalDisconnect = false

  try {
    const freshToken = await getOrRefreshToken()
    if (!freshToken) {
      console.warn('[Socket] reconnectNow: no token, scheduling retry')
      _reconnecting = false
      _scheduleReconnect()
      return
    }
  } catch (err) {
    console.warn('[Socket] reconnectNow: token refresh failed', err?.message)
    _reconnecting = false
    _scheduleReconnect()
    return
  }

  if (!_intentionalDisconnect && socket && !socket.connected) {
    console.debug('[Socket] reconnectNow: connecting with fresh token')
    socket.connect()
  }
  _reconnecting = false
}

/**
 * Disconnect from the chat server.
 */
export function disconnectSocket() {
  _intentionalDisconnect = true
  clearTimeout(_reconnectTimer)
  _stopKeepalive()
  if (socket) {
    socket.disconnect()
    socket = null
    console.debug('[Socket] Disconnected and cleaned up')
    recordDebug('socket', 'Intentional disconnect')
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

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Chat request received', { requestId: data?.data?.id, requester: data?.data?.requester?.username })
    handler(data)
  }
  socket.on('chat_request_received', wrappedHandler)
  return () => {
    if (socket) socket.off('chat_request_received', wrappedHandler)
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

  recordDebug('chat', 'Joining chat', { chatId })
  return new Promise((resolve, reject) => {
    socket.emit('join_chat', { chatId }, (response) => {
      if (response?.status === 'joined') {
        recordDebug('chat', 'Joined chat', { chatId, messageCount: response.messages?.length })
        resolve(response)
      } else {
        recordDebug('chat', 'Join failed', { chatId, error: response?.message })
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
export async function sendMessage(chatId, content, type = 'text', { wasFlaggedToxic } = {}) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  const payload = { chatId, content, type }
  if (wasFlaggedToxic) payload.wasFlaggedToxic = true

  recordDebug('chat:send', 'Sending message', { chatId, type, wasFlaggedToxic: !!wasFlaggedToxic })
  return new Promise((resolve, reject) => {
    socket.emit('message', payload, (response) => {
      if (response?.status === 'sent' || response?.id) {
        recordDebug('chat:send', 'Message sent', { chatId, type, id: response?.id })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Send failed', { chatId, type, error: response?.message })
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

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Message received', { chatId: data?.chatId, type: data?.type, sender: data?.sender_id || data?.sender })
    handler(data)
  }
  socket.on('message', wrappedHandler)
  return () => {
    if (socket) socket.off('message', wrappedHandler)
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
 * Leave a chat screen (starts abandonment timer on server).
 * Fired from useEffect cleanup when the chat screen unmounts.
 * @param {string} chatId - Chat log ID
 */
export function leaveChat(chatId) {
  if (!socket?.connected) return
  recordDebug('chat', 'Leaving chat', { chatId })
  socket.emit('leave_chat', { chatId })
}

/**
 * Set up listener for partner disconnected events.
 * @param {Function} handler - Called with { chatId, userId }
 * @returns {Function} - Cleanup function
 */
export function onPartnerDisconnected(handler) {
  if (!socket) {
    return () => {}
  }

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Partner disconnected', { chatId: data?.chatId, userId: data?.userId })
    handler(data)
  }
  socket.on('partner_disconnected', wrappedHandler)
  return () => {
    if (socket) socket.off('partner_disconnected', wrappedHandler)
  }
}

/**
 * Set up listener for partner reconnected events.
 * @param {Function} handler - Called with { chatId, userId }
 * @returns {Function} - Cleanup function
 */
export function onPartnerReconnected(handler) {
  if (!socket) {
    return () => {}
  }

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Partner reconnected', { chatId: data?.chatId, userId: data?.userId })
    handler(data)
  }
  socket.on('partner_reconnected', wrappedHandler)
  return () => {
    if (socket) socket.off('partner_reconnected', wrappedHandler)
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

  recordDebug('chat', 'Exiting chat', { chatId, exitType })
  return new Promise((resolve, reject) => {
    socket.emit('exit_chat', { chatId, exitType }, (response) => {
      if (response?.status === 'exited' || response?.status === 'ok' || response?.status === 'ended') {
        recordDebug('chat', 'Exited chat', { chatId, exitType, status: response?.status })
        resolve(response)
      } else {
        recordDebug('chat', 'Exit failed', { chatId, exitType, error: response?.message })
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

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Status event', { chatId: data?.chatId, status: data?.status, endType: data?.endType })
    handler(data)
  }
  socket.on('status', wrappedHandler)
  socket.on('chat_ended', wrappedHandler)
  return () => {
    if (socket) {
      socket.off('status', wrappedHandler)
      socket.off('chat_ended', wrappedHandler)
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

  recordDebug('chat:send', 'Proposing position', { chatId, isClosure })
  return new Promise((resolve, reject) => {
    socket.emit('agreed_position', {
      chatId,
      action: 'propose',
      content,
      isClosure,
    }, (response) => {
      if (response?.status === 'proposed') {
        recordDebug('chat:send', 'Position proposed', { chatId, proposalId: response?.proposalId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Propose failed', { chatId, error: response?.message })
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

  recordDebug('chat:send', `Responding to proposal: ${action}`, { chatId, proposalId, action })
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
      if (response?.status === 'error') {
        recordDebug('chat:send', `Proposal ${action} failed`, { chatId, proposalId, error: response.message })
        reject(new Error(response.message || `Failed to ${action} proposal`))
      } else {
        recordDebug('chat:send', `Proposal ${action} OK`, { chatId, proposalId, status: response?.status })
        resolve(response)
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

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Agreed position event', { chatId: data?.chatId, action: data?.action, proposalId: data?.proposal?.proposalId || data?.proposalId })
    handler(data)
  }
  socket.on('agreed_position', wrappedHandler)
  return () => {
    if (socket) socket.off('agreed_position', wrappedHandler)
  }
}

/**
 * Join a post room to receive real-time comment/vote events.
 * @param {string} postId - Post ID
 * @returns {Promise<Object>} - Join response
 */
export async function joinPost(postId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  return new Promise((resolve, reject) => {
    socket.emit('join_post', { postId }, (response) => {
      if (response?.status === 'joined') {
        resolve(response)
      } else {
        reject(new Error(response?.message || 'Failed to join post room'))
      }
    })
  })
}

/**
 * Leave a post room.
 * @param {string} postId - Post ID
 */
export function leavePost(postId) {
  if (socket?.connected) {
    socket.emit('leave_post', { postId })
  }
}

/**
 * Set up listener for new comment events on a post.
 * @param {Function} handler - Called with comment data
 * @returns {Function} - Cleanup function
 */
export function onNewComment(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('new_comment', handler)
  return () => {
    if (socket) socket.off('new_comment', handler)
  }
}

/**
 * Set up listener for vote update events on a post.
 * @param {Function} handler - Called with { commentId, upvoteCount, downvoteCount, score }
 * @returns {Function} - Cleanup function
 */
export function onVoteUpdate(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('vote_update', handler)
  return () => {
    if (socket) socket.off('vote_update', handler)
  }
}

/**
 * Send a reaction on a chat message.
 * @param {string} chatId - Chat log ID
 * @param {string} messageId - Message ID to react to
 * @param {string|null} emoji - Reaction key ('agree','appreciate', etc.) or null to remove
 * @returns {Promise<Object>} - Reaction response
 */
export async function sendReaction(chatId, messageId, emoji) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Sending reaction', { chatId, messageId, emoji })
  return new Promise((resolve, reject) => {
    socket.emit('reaction', { chatId, messageId, emoji }, (response) => {
      if (response?.status === 'ok') resolve(response)
      else reject(new Error(response?.message || 'Failed to send reaction'))
    })
  })
}

/**
 * Set up listener for reaction events.
 * @param {Function} handler - Called with { chatId, messageId, userId, emoji, timestamp }
 * @returns {Function} - Cleanup function
 */
export function onReaction(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('reaction', handler)
  return () => {
    if (socket) socket.off('reaction', handler)
  }
}

/**
 * Request a definition for a term.
 * @param {string} chatId - Chat log ID
 * @param {string} term - The word/phrase to define
 * @returns {Promise<Object>} - Response with requestId
 */
export async function requestDefinition(chatId, term) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Requesting definition', { chatId })
  return new Promise((resolve, reject) => {
    socket.emit('definition', {
      chatId,
      action: 'request',
      term,
    }, (response) => {
      if (response?.status === 'requested') {
        recordDebug('chat:send', 'Definition requested', { chatId, requestId: response?.requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Definition request failed', { chatId, error: response?.message })
        reject(new Error(response?.message || 'Failed to request definition'))
      }
    })
  })
}

/**
 * Respond to a definition request with a definition.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The definition request ID
 * @param {string} definition - The definition text
 * @returns {Promise<Object>} - Response with requestId
 */
export async function respondDefinition(chatId, requestId, definition) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Responding to definition', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('definition', {
      chatId,
      action: 'define',
      requestId,
      definition,
    }, (response) => {
      if (response?.status === 'defined') {
        recordDebug('chat:send', 'Definition responded', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Definition respond failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to respond to definition'))
      }
    })
  })
}

/**
 * Accept a definition.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The definition request ID
 * @returns {Promise<Object>} - Response with requestId
 */
export async function acceptDefinition(chatId, requestId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Accepting definition', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('definition', {
      chatId,
      action: 'accept',
      requestId,
    }, (response) => {
      if (response?.status === 'accepted') {
        recordDebug('chat:send', 'Definition accepted', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Definition accept failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to accept definition'))
      }
    })
  })
}

/**
 * Provide a counter-definition.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The definition request ID
 * @param {string} definition - The counter-definition text
 * @returns {Promise<Object>} - Response with requestId
 */
export async function counterDefine(chatId, requestId, definition) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Counter-defining', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('definition', {
      chatId,
      action: 'counter_define',
      requestId,
      definition,
    }, (response) => {
      if (response?.status === 'both_defined') {
        recordDebug('chat:send', 'Counter-defined', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Counter-define failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to counter-define'))
      }
    })
  })
}

/**
 * Set up listener for definition events.
 * @param {Function} handler - Called with definition data
 * @returns {Function} - Cleanup function
 */
export function onDefinition(handler) {
  if (!socket) {
    return () => {}
  }

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Definition event', { chatId: data?.chatId, action: data?.action, requestId: data?.request?.id || data?.requestId })
    handler(data)
  }
  socket.on('definition', wrappedHandler)
  return () => {
    if (socket) socket.off('definition', wrappedHandler)
  }
}

/**
 * Request an explanation of your position.
 * @param {string} chatId - Chat log ID
 * @param {string} position - Free text describing the position
 * @returns {Promise<Object>} - Response with requestId
 */
export async function requestExplanation(chatId, position) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Requesting explanation', { chatId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'request',
      position,
    }, (response) => {
      if (response?.status === 'requested') {
        recordDebug('chat:send', 'Explanation requested', { chatId, requestId: response?.requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Explanation request failed', { chatId, error: response?.message })
        reject(new Error(response?.message || 'Failed to request explanation'))
      }
    })
  })
}

/**
 * Respond to an explanation request with an explanation.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The explain request ID
 * @param {string} explanation - The explanation text
 * @returns {Promise<Object>} - Response with requestId
 */
export async function respondExplanation(chatId, requestId, explanation) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Responding to explanation', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'explain',
      requestId,
      explanation,
    }, (response) => {
      if (response?.status === 'explained') {
        recordDebug('chat:send', 'Explanation responded', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Explanation respond failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to respond to explanation'))
      }
    })
  })
}

/**
 * Confirm that an explanation was a good faith attempt.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The explain request ID
 * @returns {Promise<Object>} - Response with requestId
 */
export async function confirmGoodFaith(chatId, requestId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Confirming good faith', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'good_faith',
      requestId,
    }, (response) => {
      if (response?.status === 'good_faith') {
        recordDebug('chat:send', 'Good faith confirmed', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Good faith confirm failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to confirm good faith'))
      }
    })
  })
}

/**
 * Reject an explanation (bad faith, let them try again).
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The explain request ID
 * @returns {Promise<Object>} - Response with requestId
 */
export async function rejectExplanation(chatId, requestId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Rejecting explanation', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'reject',
      requestId,
    }, (response) => {
      if (response?.status === 'rejected') {
        recordDebug('chat:send', 'Explanation rejected', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Explanation reject failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to reject explanation'))
      }
    })
  })
}

/**
 * Accept an explanation.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The explain request ID
 * @returns {Promise<Object>} - Response with requestId
 */
export async function acceptExplanation(chatId, requestId) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Accepting explanation', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'accept',
      requestId,
    }, (response) => {
      if (response?.status === 'completed') {
        recordDebug('chat:send', 'Explanation accepted', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Explanation accept failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to accept explanation'))
      }
    })
  })
}

/**
 * Correct an explanation with your own version.
 * @param {string} chatId - Chat log ID
 * @param {string} requestId - The explain request ID
 * @param {string} correction - The corrected explanation text
 * @returns {Promise<Object>} - Response with requestId
 */
export async function correctExplanation(chatId, requestId, correction) {
  if (!socket?.connected) {
    throw new Error('Not connected to chat server')
  }

  recordDebug('chat:send', 'Correcting explanation', { chatId, requestId })
  return new Promise((resolve, reject) => {
    socket.emit('explain_position', {
      chatId,
      action: 'correct',
      requestId,
      correction,
    }, (response) => {
      if (response?.status === 'corrected') {
        recordDebug('chat:send', 'Explanation corrected', { chatId, requestId })
        resolve(response)
      } else {
        recordDebug('chat:send', 'Explanation correct failed', { chatId, requestId, error: response?.message })
        reject(new Error(response?.message || 'Failed to correct explanation'))
      }
    })
  })
}

/**
 * Set up listener for explain position events.
 * @param {Function} handler - Called with explain position data
 * @returns {Function} - Cleanup function
 */
export function onExplainPosition(handler) {
  if (!socket) {
    return () => {}
  }

  const wrappedHandler = (data) => {
    recordDebug('chat:recv', 'Explain position event', { chatId: data?.chatId, action: data?.action, requestId: data?.request?.id || data?.requestId })
    handler(data)
  }
  socket.on('explain_position', wrappedHandler)
  return () => {
    if (socket) socket.off('explain_position', wrappedHandler)
  }
}

/**
 * Set up listener for notification events (real-time inbox delivery).
 * @param {Function} handler - Called with notification data
 * @returns {Function} - Cleanup function
 */
export function onNotification(handler) {
  if (!socket) {
    return () => {}
  }

  socket.on('notification', handler)
  return () => {
    if (socket) socket.off('notification', handler)
  }
}

export default {
  connect: connectSocket,
  disconnect: disconnectSocket,
  reconnectNow,
  setOnReconnectExhausted,
  getSocket,
  isConnected,
  onChatRequestResponse,
  onChatRequestReceived,
  onChatStarted,
  joinChat,
  leaveChat,
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
  onPartnerDisconnected,
  onPartnerReconnected,
  joinPost,
  leavePost,
  onNewComment,
  onVoteUpdate,
  onNotification,
  sendReaction,
  onReaction,
  requestDefinition,
  respondDefinition,
  acceptDefinition,
  counterDefine,
  onDefinition,
  requestExplanation,
  respondExplanation,
  confirmGoodFaith,
  rejectExplanation,
  acceptExplanation,
  correctExplanation,
  onExplainPosition,
}

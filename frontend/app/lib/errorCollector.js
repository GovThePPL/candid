/**
 * Error collector for automatic diagnostics reporting.
 *
 * Collects JS errors, unhandled promise rejections, and API errors in memory.
 * Periodically drained and sent to the backend by UserContext when the user
 * has opted in to diagnostics.
 */

const MAX_BUFFER_SIZE = 100
const MAX_DEBUG_BUFFER_SIZE = 200
const DEDUP_WINDOW_MS = 5000 // Ignore identical errors within 5 seconds

let _buffer = []
let _lastErrorKey = null
let _lastErrorTime = 0
let _debugBuffer = []
let _installed = false

/**
 * Record an error into the buffer.
 * Deduplicates identical consecutive errors within a short window.
 *
 * @param {string} type - Error category: 'js', 'promise', 'api'
 * @param {string} message - Error message
 * @param {object} [meta] - Additional context (stack, status, endpoint, etc.)
 */
export function recordError(type, message, meta = {}) {
  const key = `${type}:${message}`
  const now = Date.now()

  // Deduplicate rapid-fire identical errors
  if (key === _lastErrorKey && now - _lastErrorTime < DEDUP_WINDOW_MS) {
    // Increment count on the most recent entry instead
    const last = _buffer[_buffer.length - 1]
    if (last && last._key === key) {
      last.count = (last.count || 1) + 1
      return
    }
  }

  _lastErrorKey = key
  _lastErrorTime = now

  _buffer.push({
    _key: key,
    type,
    message: String(message).slice(0, 500),
    meta,
    count: 1,
    timestamp: new Date(now).toISOString(),
  })

  // Evict oldest entries if over the cap
  if (_buffer.length > MAX_BUFFER_SIZE) {
    _buffer = _buffer.slice(-MAX_BUFFER_SIZE)
  }
}

/**
 * Record an API error with endpoint and status context.
 *
 * @param {string} endpoint - API path that failed (e.g. '/bug-reports')
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 */
export function recordApiError(endpoint, status, message) {
  recordError('api', message, { endpoint, status })
}

/**
 * Record a debug log entry for diagnostics.
 * These are sent alongside errors in the periodic diagnostics payload.
 * Do NOT include user content (message text, etc.) — only metadata.
 *
 * @param {string} category - Log category (e.g. 'socket', 'chat', 'chat:send')
 * @param {string} message - Short description of the event
 * @param {object} [meta] - Metadata (chatId, event, status, etc.)
 */
export function recordDebug(category, message, meta = {}) {
  _debugBuffer.push({
    category,
    message: String(message).slice(0, 300),
    meta,
    timestamp: new Date().toISOString(),
  })

  if (_debugBuffer.length > MAX_DEBUG_BUFFER_SIZE) {
    _debugBuffer = _debugBuffer.slice(-MAX_DEBUG_BUFFER_SIZE)
  }
}

/**
 * Drain the buffer and return all collected errors and debug logs, clearing both.
 * Returns null if both are empty (nothing to send).
 *
 * @returns {object|null} - { errors: [...], debugLogs: [...] } or null
 */
export function drain() {
  if (_buffer.length === 0 && _debugBuffer.length === 0) return null

  const result = {}

  if (_buffer.length > 0) {
    result.errors = _buffer.map(({ _key, ...rest }) => rest)
    _buffer = []
    _lastErrorKey = null
    _lastErrorTime = 0
  }

  if (_debugBuffer.length > 0) {
    result.debugLogs = _debugBuffer
    _debugBuffer = []
  }

  return result
}

/**
 * Return current buffer sizes (for testing/debugging).
 * @returns {number} - Total entries across both buffers
 */
export function size() {
  return _buffer.length + _debugBuffer.length
}

/**
 * Install global error handlers (ErrorUtils for React Native, window for web).
 * Safe to call multiple times — installs only once.
 */
export function install() {
  if (_installed) return
  _installed = true

  // React Native global error handler
  if (typeof global !== 'undefined' && global.ErrorUtils) {
    const prev = global.ErrorUtils.getGlobalHandler()
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      recordError(
        isFatal ? 'crash' : 'js',
        error?.message || String(error),
        { stack: String(error?.stack || '').slice(0, 1000), isFatal }
      )
      if (prev) prev(error, isFatal)
    })
  }

  // Unhandled promise rejections (works in both RN and web)
  if (typeof global !== 'undefined') {
    const handler = (event) => {
      const reason = event?.reason || event
      recordError('promise', reason?.message || String(reason), {
        stack: String(reason?.stack || '').slice(0, 1000),
      })
    }

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('unhandledrejection', handler)
    }
  }
}

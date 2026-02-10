import { recordError, recordApiError, drain, size, install } from '../../lib/errorCollector'

beforeEach(() => {
  // Drain resets internal state
  drain()
})

describe('recordError', () => {
  it('adds an entry to the buffer', () => {
    recordError('js', 'test error')
    expect(size()).toBe(1)
  })

  it('truncates message to 500 characters', () => {
    const longMsg = 'x'.repeat(600)
    recordError('js', longMsg)
    const result = drain()
    expect(result.errors[0].message.length).toBe(500)
  })

  it('includes timestamp as ISO string', () => {
    recordError('js', 'test')
    const result = drain()
    expect(result.errors[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sets count to 1 for new entries', () => {
    recordError('js', 'test')
    const result = drain()
    expect(result.errors[0].count).toBe(1)
  })

  it('includes type and meta', () => {
    recordError('js', 'err', { stack: 'trace' })
    const result = drain()
    expect(result.errors[0].type).toBe('js')
    expect(result.errors[0].meta).toEqual({ stack: 'trace' })
  })
})

describe('deduplication', () => {
  it('increments count for same error within 5s', () => {
    recordError('js', 'same error')
    recordError('js', 'same error')
    recordError('js', 'same error')
    expect(size()).toBe(1)
    const result = drain()
    expect(result.errors[0].count).toBe(3)
  })

  it('does not deduplicate different error types', () => {
    recordError('js', 'error')
    recordError('api', 'error')
    expect(size()).toBe(2)
  })

  it('does not deduplicate different messages', () => {
    recordError('js', 'error1')
    recordError('js', 'error2')
    expect(size()).toBe(2)
  })

  it('creates new entry after dedup window passes', () => {
    const realDateNow = Date.now
    let time = 1000000
    Date.now = jest.fn(() => time)

    recordError('js', 'error')
    // Advance past 5s window
    time += 6000
    recordError('js', 'error')

    expect(size()).toBe(2)
    Date.now = realDateNow
  })
})

describe('recordApiError', () => {
  it('creates entry with type "api" and meta fields', () => {
    recordApiError('/users', 500, 'Server Error')
    const result = drain()
    expect(result.errors[0].type).toBe('api')
    expect(result.errors[0].meta.endpoint).toBe('/users')
    expect(result.errors[0].meta.status).toBe(500)
  })
})

describe('drain', () => {
  it('returns null when buffer is empty', () => {
    expect(drain()).toBeNull()
  })

  it('returns errors array and clears buffer', () => {
    recordError('js', 'e1')
    recordError('api', 'e2')
    const result = drain()
    expect(result.errors).toHaveLength(2)
    expect(size()).toBe(0)
  })

  it('strips internal _key from entries', () => {
    recordError('js', 'test')
    const result = drain()
    expect(result.errors[0]._key).toBeUndefined()
  })
})

describe('size', () => {
  it('returns 0 when empty', () => {
    expect(size()).toBe(0)
  })

  it('reflects buffer length', () => {
    recordError('js', 'a')
    recordError('js', 'b')
    expect(size()).toBe(2)
  })
})

describe('buffer eviction', () => {
  it('evicts oldest entries when over 100', () => {
    for (let i = 0; i < 110; i++) {
      recordError('js', `error-${i}`)
    }
    expect(size()).toBe(100)
    const result = drain()
    // First entry should be error-10 (oldest 10 evicted)
    expect(result.errors[0].message).toBe('error-10')
  })
})

describe('install', () => {
  it('is safe to call multiple times (idempotent)', () => {
    // Should not throw
    install()
    install()
    install()
  })
})

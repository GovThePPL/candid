import AsyncStorage from '@react-native-async-storage/async-storage'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'

beforeEach(async () => {
  jest.clearAllMocks()
  AsyncStorage.getAllKeys.mockResolvedValue([])
  AsyncStorage.multiRemove.mockResolvedValue()
  AsyncStorage.setItem.mockResolvedValue()
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.removeItem.mockResolvedValue()
  // Clear both memory and storage caches
  await CacheManager.clearAll()
  jest.clearAllMocks()
  // Re-setup default mocks after clearAll
  AsyncStorage.getAllKeys.mockResolvedValue([])
  AsyncStorage.multiRemove.mockResolvedValue()
  AsyncStorage.setItem.mockResolvedValue()
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.removeItem.mockResolvedValue()
})

describe('CacheManager.get', () => {
  it('returns null on cache miss', async () => {
    const result = await CacheManager.get('nonexistent')
    expect(result).toBeNull()
  })

  it('returns data from memory cache on hit', async () => {
    await CacheManager.set('key1', { value: 42 })
    const result = await CacheManager.get('key1')
    expect(result.data).toEqual({ value: 42 })
  })

  it('falls back to AsyncStorage when not in memory', async () => {
    const stored = JSON.stringify({ data: 'stored', cachedAt: Date.now() })
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === '@cache:key2') return Promise.resolve(stored)
      return Promise.resolve(null)
    })
    // Directly call get without prior set — memory cache is empty
    const result = await CacheManager.get('key2')
    expect(result.data).toBe('stored')
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@cache:key2')
  })

  it('handles AsyncStorage errors gracefully', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('storage fail'))
    const result = await CacheManager.get('broken')
    expect(result).toBeNull()
  })
})

describe('CacheManager.set', () => {
  it('stores in both memory and AsyncStorage', async () => {
    await CacheManager.set('k', { val: 1 })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@cache:k',
      expect.any(String)
    )
    // Memory cache hit (no AsyncStorage needed)
    const result = await CacheManager.get('k')
    expect(result.data).toEqual({ val: 1 })
  })

  it('includes cachedAt timestamp', async () => {
    const before = Date.now()
    await CacheManager.set('k', 'data')
    const result = await CacheManager.get('k')
    expect(result.cachedAt).toBeGreaterThanOrEqual(before)
    expect(result.cachedAt).toBeLessThanOrEqual(Date.now())
  })

  it('merges metadata into entry', async () => {
    await CacheManager.set('k', 'data', { etag: '"abc"', lastModified: 'Mon' })
    const result = await CacheManager.get('k')
    expect(result.etag).toBe('"abc"')
    expect(result.lastModified).toBe('Mon')
  })
})

describe('CacheManager.invalidate', () => {
  it('marks entry as stale in memory', async () => {
    await CacheManager.set('k', 'data')
    await CacheManager.invalidate('k')
    const result = await CacheManager.get('k')
    expect(result.stale).toBe(true)
  })
})

describe('CacheManager.invalidateByPrefix', () => {
  it('marks all matching entries as stale', async () => {
    await CacheManager.set('stats:1:2', 'a')
    await CacheManager.set('stats:1:3', 'b')
    await CacheManager.set('other:1', 'c')

    AsyncStorage.getAllKeys.mockResolvedValueOnce(['@cache:stats:1:2', '@cache:stats:1:3', '@cache:other:1'])
    // Mock getItem for the AsyncStorage path of invalidateByPrefix
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key.startsWith('@cache:stats:')) return Promise.resolve(JSON.stringify({ data: 'x', cachedAt: 1 }))
      return Promise.resolve(null)
    })

    await CacheManager.invalidateByPrefix('stats:')

    const a = await CacheManager.get('stats:1:2')
    const b = await CacheManager.get('stats:1:3')
    const c = await CacheManager.get('other:1')
    expect(a.stale).toBe(true)
    expect(b.stale).toBe(true)
    expect(c.stale).toBeUndefined()
  })
})

describe('CacheManager.remove', () => {
  it('removes entry from memory and AsyncStorage', async () => {
    await CacheManager.set('k', 'data')
    await CacheManager.remove('k')
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@cache:k')
    // After remove, memory is cleared — get falls back to AsyncStorage (null)
    const result = await CacheManager.get('k')
    expect(result).toBeNull()
  })
})

describe('CacheManager.isStale', () => {
  it('returns true for null entry', () => {
    expect(CacheManager.isStale(null, 5000)).toBe(true)
  })

  it('returns true when entry is flagged stale', () => {
    expect(CacheManager.isStale({ stale: true, cachedAt: Date.now() }, 999999)).toBe(true)
  })

  it('returns true when maxAge exceeded', () => {
    const old = { cachedAt: Date.now() - 10000 }
    expect(CacheManager.isStale(old, 5000)).toBe(true)
  })

  it('returns false when entry is fresh', () => {
    const fresh = { cachedAt: Date.now() }
    expect(CacheManager.isStale(fresh, 60000)).toBe(false)
  })
})

describe('CacheManager.fetchWithCache', () => {
  it('returns fresh cached data without fetching', async () => {
    await CacheManager.set('k', { items: [1] })
    const fetchFn = jest.fn()

    const result = await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    expect(result.data).toEqual({ items: [1] })
    expect(result.fromCache).toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches when cache is stale', async () => {
    await CacheManager.set('k', { old: true })
    await CacheManager.invalidate('k')

    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ new: true }),
      headers: { get: () => null },
    })

    const result = await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    expect(result.data).toEqual({ new: true })
    expect(result.fromCache).toBe(false)
    expect(fetchFn).toHaveBeenCalled()
  })

  it('sends conditional headers when cached with etag', async () => {
    await CacheManager.set('k', { data: 1 }, { etag: '"v1"', lastModified: 'Mon' })
    await CacheManager.invalidate('k')

    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 2 }),
      headers: { get: () => null },
    })

    await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    const headers = fetchFn.mock.calls[0][0]
    expect(headers['If-None-Match']).toBe('"v1"')
    expect(headers['If-Modified-Since']).toBe('Mon')
  })

  it('handles 304 Not Modified by using cached data', async () => {
    await CacheManager.set('k', { cached: true }, { etag: '"v1"' })
    await CacheManager.invalidate('k')

    const fetchFn = jest.fn().mockResolvedValue({ status: 304 })

    const result = await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    expect(result.data).toEqual({ cached: true })
    expect(result.fromCache).toBe(true)
  })

  it('falls back to cache on error response when cached data exists', async () => {
    await CacheManager.set('k', { fallback: true })
    await CacheManager.invalidate('k')

    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const result = await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    expect(result.data).toEqual({ fallback: true })
    expect(result.fromCache).toBe(true)
  })

  it('throws on error response when no cached data', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(
      CacheManager.fetchWithCache('missing', fetchFn, { maxAge: 60000 })
    ).rejects.toThrow('Fetch failed: 500')
  })

  it('falls back to cache on network error', async () => {
    await CacheManager.set('k', { fallback: true })
    await CacheManager.invalidate('k')

    const fetchFn = jest.fn().mockRejectedValue(new Error('Network error'))

    const result = await CacheManager.fetchWithCache('k', fetchFn, { maxAge: 60000 })
    expect(result.data).toEqual({ fallback: true })
    expect(result.fromCache).toBe(true)
  })

  it('throws on network error when no cached data', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('Network error'))

    await expect(
      CacheManager.fetchWithCache('missing', fetchFn, { maxAge: 60000 })
    ).rejects.toThrow('Network error')
  })

  it('force refresh bypasses fresh cache', async () => {
    await CacheManager.set('k', { old: true })

    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ new: true }),
      headers: { get: () => null },
    })

    const result = await CacheManager.fetchWithCache('k', fetchFn, {
      maxAge: 60000,
      forceRefresh: true,
    })
    expect(result.data).toEqual({ new: true })
    expect(fetchFn).toHaveBeenCalled()
  })
})

describe('CacheManager.fetchWithMetadataCheck', () => {
  it('fetches full data when no cache exists', async () => {
    const metaFn = jest.fn()
    const fullFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ full: true }),
      headers: { get: () => null },
    })
    const shouldRefresh = jest.fn()

    const result = await CacheManager.fetchWithMetadataCheck('k', metaFn, fullFn, shouldRefresh)
    expect(result.data).toEqual({ full: true })
    expect(result.fromCache).toBe(false)
    expect(metaFn).not.toHaveBeenCalled()
  })

  it('returns cached data when metadata says fresh', async () => {
    await CacheManager.set('k', { cached: true })

    const metaFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 5 }),
    })
    const fullFn = jest.fn()
    const shouldRefresh = jest.fn().mockReturnValue(false)

    const result = await CacheManager.fetchWithMetadataCheck('k', metaFn, fullFn, shouldRefresh)
    expect(result.data).toEqual({ cached: true })
    expect(result.fromCache).toBe(true)
    expect(fullFn).not.toHaveBeenCalled()
  })

  it('fetches full data when metadata says refresh', async () => {
    await CacheManager.set('k', { old: true })

    const metaFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 10 }),
    })
    const fullFn = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ new: true }),
      headers: { get: () => null },
    })
    const shouldRefresh = jest.fn().mockReturnValue(true)

    const result = await CacheManager.fetchWithMetadataCheck('k', metaFn, fullFn, shouldRefresh)
    expect(result.data).toEqual({ new: true })
    expect(result.fromCache).toBe(false)
  })

  it('falls back to cached data when metadata check fails', async () => {
    await CacheManager.set('k', { cached: true })

    const metaFn = jest.fn().mockRejectedValue(new Error('fail'))
    const fullFn = jest.fn()
    const shouldRefresh = jest.fn()

    const result = await CacheManager.fetchWithMetadataCheck('k', metaFn, fullFn, shouldRefresh)
    expect(result.data).toEqual({ cached: true })
    expect(result.fromCache).toBe(true)
  })
})

describe('CacheManager.clearAll', () => {
  it('clears memory and AsyncStorage cache entries', async () => {
    await CacheManager.set('a', 1)
    await CacheManager.set('b', 2)

    AsyncStorage.getAllKeys.mockResolvedValueOnce(['@cache:a', '@cache:b', 'other_key'])

    await CacheManager.clearAll()
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['@cache:a', '@cache:b'])
  })
})

describe('CacheManager.getStats', () => {
  it('returns memory and storage entry counts', async () => {
    await CacheManager.set('a', 1)
    AsyncStorage.getAllKeys.mockResolvedValueOnce(['@cache:a'])
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === '@cache:a') return Promise.resolve('{"data":1}')
      return Promise.resolve(null)
    })

    const stats = await CacheManager.getStats()
    expect(stats.memoryEntries).toBe(1)
    expect(stats.storageEntries).toBe(1)
    expect(stats.estimatedSizeBytes).toBeGreaterThan(0)
  })
})

describe('CacheKeys', () => {
  it('generates expected key formats', () => {
    expect(CacheKeys.chatLog('abc')).toBe('chatlog:v2:abc')
    expect(CacheKeys.userChats('u1')).toBe('chats:v2:user:u1')
    expect(CacheKeys.stats('loc1', 'cat1')).toBe('stats:loc1:cat1')
    expect(CacheKeys.userPositions('u1')).toBe('positions:user:u1')
    expect(CacheKeys.profile('u1')).toBe('profile:user:u1')
    expect(CacheKeys.demographics('u1')).toBe('demographics:user:u1')
    expect(CacheKeys.settings('u1')).toBe('settings:user:u1')
    expect(CacheKeys.categories()).toBe('categories')
    expect(CacheKeys.chattingList('u1')).toBe('chattinglist:user:u1')
  })
})

describe('CacheDurations', () => {
  it('has expected duration values', () => {
    expect(CacheDurations.CHAT_LOG_ENDED).toBe(Infinity)
    expect(CacheDurations.CHAT_LOG_ACTIVE).toBe(0)
    expect(CacheDurations.CHAT_LIST).toBe(5 * 60 * 1000)
    expect(CacheDurations.STATS).toBe(5 * 60 * 1000)
    expect(CacheDurations.PROFILE).toBe(60 * 60 * 1000)
    expect(CacheDurations.CATEGORIES).toBe(Infinity)
  })
})

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@cache:';
const memoryCache = new Map();

/**
 * CacheManager - Hybrid caching utility for React Native
 *
 * Provides:
 * - In-memory caching for fast access
 * - AsyncStorage persistence for offline support
 * - HTTP conditional request support (ETag, Last-Modified)
 * - Stale-while-revalidate pattern
 */
export const CacheManager = {
  /**
   * Get cached data by key
   * Checks memory first, then AsyncStorage
   * @param {string} key - Cache key
   * @returns {Promise<object|null>} - Cached entry or null
   */
  async get(key) {
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch (error) {
      console.warn('CacheManager.get error:', error);
    }
    return null;
  },

  /**
   * Store data in both memory and AsyncStorage
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {object} metadata - Optional metadata (etag, lastModified)
   */
  async set(key, data, metadata = {}) {
    const entry = {
      data,
      ...metadata,
      cachedAt: Date.now(),
    };
    memoryCache.set(key, entry);
    try {
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
      console.warn('CacheManager.set error:', error);
    }
  },

  /**
   * Mark cache entry as stale (will revalidate on next access)
   * @param {string} key - Cache key
   */
  async invalidate(key) {
    const entry = memoryCache.get(key);
    if (entry) {
      entry.stale = true;
      memoryCache.set(key, entry);
    }
    // Also mark as stale in AsyncStorage
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.stale = true;
        await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(parsed));
      }
    } catch (error) {
      console.warn('CacheManager.invalidate error:', error);
    }
  },

  /**
   * Invalidate multiple cache entries by prefix
   * @param {string} prefix - Key prefix to match
   */
  async invalidateByPrefix(prefix) {
    // Clear from memory cache
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        const entry = memoryCache.get(key);
        if (entry) {
          entry.stale = true;
          memoryCache.set(key, entry);
        }
      }
    }
    // Clear from AsyncStorage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchingKeys = keys.filter(
        (k) => k.startsWith(CACHE_PREFIX + prefix)
      );
      for (const key of matchingKeys) {
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.stale = true;
          await AsyncStorage.setItem(key, JSON.stringify(parsed));
        }
      }
    } catch (error) {
      console.warn('CacheManager.invalidateByPrefix error:', error);
    }
  },

  /**
   * Remove a cache entry completely
   * @param {string} key - Cache key
   */
  async remove(key) {
    memoryCache.delete(key);
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn('CacheManager.remove error:', error);
    }
  },

  /**
   * Check if cache entry is stale
   * @param {object} entry - Cache entry
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {boolean}
   */
  isStale(entry, maxAgeMs) {
    if (!entry || entry.stale) return true;
    return Date.now() - entry.cachedAt > maxAgeMs;
  },

  /**
   * Fetch with caching and conditional request support
   * @param {string} key - Cache key
   * @param {function} fetchFn - Function that returns fetch promise, receives headers object
   * @param {object} options - Options
   * @param {number} options.maxAge - Max cache age in ms (default 5 min)
   * @param {boolean} options.forceRefresh - Force fetch even if cached
   * @returns {Promise<{data: any, fromCache: boolean}>}
   */
  async fetchWithCache(key, fetchFn, options = {}) {
    const { maxAge = 5 * 60 * 1000, forceRefresh = false } = options;
    const cached = await this.get(key);

    // Return cached if fresh and not forcing refresh
    if (cached && !forceRefresh && !this.isStale(cached, maxAge)) {
      return { data: cached.data, fromCache: true };
    }

    // Build conditional request headers
    const headers = {};
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }
    if (cached?.lastModified) {
      headers['If-Modified-Since'] = cached.lastModified;
    }

    try {
      const response = await fetchFn(headers);

      // 304 Not Modified - use cached data
      if (response.status === 304) {
        // Update cachedAt to extend freshness
        await this.set(key, cached.data, {
          etag: cached.etag,
          lastModified: cached.lastModified,
        });
        return { data: cached.data, fromCache: true };
      }

      // Handle error responses
      if (!response.ok) {
        // If we have cached data and fetch failed, return cached
        if (cached) {
          console.warn(
            `Fetch failed (${response.status}), using cached data for ${key}`
          );
          return { data: cached.data, fromCache: true };
        }
        throw new Error(`Fetch failed: ${response.status}`);
      }

      // New data - cache it
      const newData = await response.json();
      await this.set(key, newData, {
        etag: response.headers.get('ETag'),
        lastModified: response.headers.get('Last-Modified'),
      });
      return { data: newData, fromCache: false };
    } catch (error) {
      // Network error - return cached if available
      if (cached) {
        console.warn(`Network error, using cached data for ${key}:`, error);
        return { data: cached.data, fromCache: true };
      }
      throw error;
    }
  },

  /**
   * Fetch with metadata check first (lightweight validation)
   * @param {string} key - Cache key
   * @param {function} metadataFetchFn - Function to fetch metadata
   * @param {function} fullFetchFn - Function to fetch full data
   * @param {function} shouldRefresh - Function(metadata, cached) that returns true if refresh needed
   * @returns {Promise<{data: any, fromCache: boolean}>}
   */
  async fetchWithMetadataCheck(
    key,
    metadataFetchFn,
    fullFetchFn,
    shouldRefresh
  ) {
    const cached = await this.get(key);

    // If no cache, fetch full data
    if (!cached) {
      const response = await fullFetchFn();
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      const data = await response.json();
      const metadata = {
        etag: response.headers.get('ETag'),
        lastModified: response.headers.get('Last-Modified'),
      };
      await this.set(key, data, metadata);
      return { data, fromCache: false };
    }

    // Check metadata to see if we need to refresh
    try {
      const metadataResponse = await metadataFetchFn();
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        if (!shouldRefresh(metadata, cached)) {
          // Metadata says we're up to date
          return { data: cached.data, fromCache: true };
        }
      }
    } catch (error) {
      // If metadata check fails, return cached
      console.warn(`Metadata check failed for ${key}:`, error);
      return { data: cached.data, fromCache: true };
    }

    // Metadata indicates refresh needed - fetch full data
    try {
      const response = await fullFetchFn();
      if (!response.ok) {
        return { data: cached.data, fromCache: true };
      }
      const data = await response.json();
      const responseMetadata = {
        etag: response.headers.get('ETag'),
        lastModified: response.headers.get('Last-Modified'),
      };
      await this.set(key, data, responseMetadata);
      return { data, fromCache: false };
    } catch (error) {
      console.warn(`Full fetch failed for ${key}:`, error);
      return { data: cached.data, fromCache: true };
    }
  },

  /**
   * Clear all caches (e.g., on logout)
   */
  async clearAll() {
    memoryCache.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (error) {
      console.warn('CacheManager.clearAll error:', error);
    }
  },

  /**
   * Get cache statistics (for debugging)
   * @returns {Promise<object>}
   */
  async getStats() {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    let totalSize = 0;
    for (const key of cacheKeys) {
      const item = await AsyncStorage.getItem(key);
      if (item) {
        totalSize += item.length;
      }
    }
    return {
      memoryEntries: memoryCache.size,
      storageEntries: cacheKeys.length,
      estimatedSizeBytes: totalSize,
    };
  },
};

// Cache key generators for consistency
export const CacheKeys = {
  chatLog: (chatId) => `chatlog:v2:${chatId}`,
  userChats: (userId) => `chats:v2:user:${userId}`,
  stats: (locationId, categoryId) => `stats:${locationId}:${categoryId}`,
  userPositions: (userId) => `positions:user:${userId}`,
  profile: (userId) => `profile:user:${userId}`,
  demographics: (userId) => `demographics:user:${userId}`,
  settings: (userId) => `settings:user:${userId}`,
  categories: () => 'categories',
  chattingList: (userId) => `chattinglist:user:${userId}`,
};

// Default cache durations (in milliseconds)
export const CacheDurations = {
  CHAT_LOG_ENDED: Infinity, // Ended chats never change (except kudos)
  CHAT_LOG_ACTIVE: 0, // Active chats use socket, no caching
  CHAT_LIST: 5 * 60 * 1000, // 5 minutes
  STATS: 5 * 60 * 1000, // 5 minutes (matches backend Polis cache)
  POSITIONS: 5 * 60 * 1000, // 5 minutes
  PROFILE: 30 * 60 * 1000, // 30 minutes (rarely changes)
  DEMOGRAPHICS: 30 * 60 * 1000, // 30 minutes (rarely changes)
  SETTINGS: 30 * 60 * 1000, // 30 minutes (rarely changes)
  CATEGORIES: Infinity, // Static data, never expires
  CHATTING_LIST: 5 * 60 * 1000, // 5 minutes
};

export default CacheManager;

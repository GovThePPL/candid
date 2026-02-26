import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import api from '../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'
import { useLocationSession } from './LocationSessionContext'

const GlossaryContext = createContext()

const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a case-insensitive regex that matches any of the given terms.
 * Terms are sorted by length descending so longer terms match first.
 * Returns null if no terms are provided.
 */
function buildMatchPattern(terms) {
  if (!terms || terms.length === 0) return null

  // Collect all matchable strings (term + aliases), sorted longest first
  const allStrings = []
  for (const t of terms) {
    allStrings.push(t.term)
    if (t.aliases) {
      for (const alias of t.aliases) {
        allStrings.push(alias)
      }
    }
  }

  if (allStrings.length === 0) return null

  allStrings.sort((a, b) => b.length - a.length)
  const escaped = allStrings.map(escapeRegex)
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
}

/**
 * Build a Map from lowercase term/alias → term info for O(1) lookup.
 */
function buildTermMap(terms) {
  const map = new Map()
  if (!terms) return map

  for (const t of terms) {
    const info = {
      slug: t.slug,
      term: t.term,
      sessionIds: t.sessionIds || [],
      locationIds: t.locationIds || [],
      scopeCombine: t.scopeCombine || 'or',
    }
    map.set(t.term.toLowerCase(), info)
    if (t.aliases) {
      for (const alias of t.aliases) {
        map.set(alias.toLowerCase(), info)
      }
    }
  }
  return map
}

export function GlossaryProvider({ children }) {
  const [terms, setTerms] = useState([])
  const { selectedLocation } = useLocationSession()
  const intervalRef = useRef(null)

  const fetchTerms = useCallback(async () => {
    try {
      const cacheKey = CacheKeys.glossaryTerms(selectedLocation)
      const cached = await CacheManager.get(cacheKey)
      if (cached && !CacheManager.isStale(cached, CacheDurations.GLOSSARY_TERMS)) {
        // CacheManager.get returns { data, cachedAt, ... } — extract .data
        const cachedTerms = Array.isArray(cached.data) ? cached.data : []
        setTerms(cachedTerms)
        return
      }

      const opts = {}
      if (selectedLocation) opts.locationId = selectedLocation
      const data = await api.glossary.getTerms(opts)
      const termList = Array.isArray(data) ? data : []
      setTerms(termList)
      await CacheManager.set(cacheKey, termList)
    } catch (err) {
      console.warn('[GlossaryContext] Failed to fetch terms:', err?.message || err)
    }
  }, [selectedLocation])

  // Fetch on mount and when location changes
  useEffect(() => {
    fetchTerms()
  }, [fetchTerms])

  // Refresh on interval
  useEffect(() => {
    intervalRef.current = setInterval(fetchTerms, REFRESH_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [fetchTerms])

  const matchPattern = useMemo(() => buildMatchPattern(terms), [terms])
  const termMap = useMemo(() => buildTermMap(terms), [terms])

  // Memoized filtered patterns per sessionId
  const filteredPatternCache = useRef(new Map())

  // Reset cache when terms change
  useEffect(() => {
    filteredPatternCache.current = new Map()
  }, [terms])

  const getFilteredPattern = useCallback((sessionId) => {
    if (!sessionId) return matchPattern
    if (!terms || terms.length === 0) return null

    const cached = filteredPatternCache.current.get(sessionId)
    if (cached !== undefined) return cached

    // Filter terms visible in this session context
    const filtered = terms.filter((t) => {
      const hasSessions = t.sessionIds && t.sessionIds.length > 0
      const hasLocs = t.locationIds && t.locationIds.length > 0
      const isGlobal = !hasSessions && !hasLocs

      // Global terms always show
      if (isGlobal) return true

      const sessMatch = hasSessions && t.sessionIds.includes(sessionId)

      if (t.scopeCombine === 'and') {
        // AND: must match session if session tags exist
        return !hasSessions || sessMatch
      }
      // OR: included if session matches, or if term has no session tags (location-only)
      return sessMatch || !hasSessions
    })

    const pattern = buildMatchPattern(filtered)
    filteredPatternCache.current.set(sessionId, pattern)
    return pattern
  }, [terms, matchPattern])

  const value = useMemo(() => ({
    terms,
    matchPattern,
    termMap,
    fetchTerms,
    getFilteredPattern,
  }), [terms, matchPattern, termMap, fetchTerms, getFilteredPattern])

  return (
    <GlossaryContext.Provider value={value}>
      {children}
    </GlossaryContext.Provider>
  )
}

export function useGlossary() {
  const ctx = useContext(GlossaryContext)
  if (!ctx) {
    throw new Error('useGlossary must be used within a GlossaryProvider')
  }
  return ctx
}

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/UserContext'
import { canModerate, canModerateAtScope } from '../lib/roles'
import api from '../lib/api'
import { CacheManager } from '../lib/cache'

const LOCATIONS_CACHE_KEY = 'all-locations'
const LOCATIONS_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Hook that returns a per-item moderation checker.
 * Fetches the location tree once (cached) and returns a callback
 * `(locationId, sessionId) => boolean` that checks scope-based authority.
 *
 * Only fetches locations if the user has any facilitator+ role.
 */
export default function useModerateChecker() {
  const { user } = useAuth()
  const hasModerationRole = canModerate(user)
  const [locations, setLocations] = useState([])

  useEffect(() => {
    if (!hasModerationRole) return
    let cancelled = false

    const load = async () => {
      // Try cache first
      const cached = await CacheManager.get(LOCATIONS_CACHE_KEY)
      if (cached?.data && !CacheManager.isStale(cached, LOCATIONS_TTL)) {
        if (!cancelled) setLocations(cached.data)
        return
      }
      try {
        const locs = await api.users.getAllLocations()
        if (!cancelled) {
          setLocations(locs || [])
          await CacheManager.set(LOCATIONS_CACHE_KEY, locs || [])
        }
      } catch {
        // Fall back to cached if available
        if (!cancelled && cached?.data) setLocations(cached.data)
      }
    }
    load()

    return () => { cancelled = true }
  }, [hasModerationRole])

  return useCallback((locationId, sessionId) => {
    if (!hasModerationRole) return false
    return canModerateAtScope(user, locationId, sessionId, locations)
  }, [user, hasModerationRole, locations])
}

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LOCATION_KEY = '@candid:selectedLocation'
const CATEGORY_KEY = '@candid:selectedCategory'

const LocationCategoryContext = createContext()

export function LocationCategoryProvider({ children }) {
  const [selectedLocation, setSelectedLocationRaw] = useState(null)
  const [selectedCategory, setSelectedCategoryRaw] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Load persisted selection on mount
  useEffect(() => {
    AsyncStorage.multiGet([LOCATION_KEY, CATEGORY_KEY])
      .then(([loc, cat]) => {
        if (loc[1]) setSelectedLocationRaw(loc[1])
        if (cat[1]) setSelectedCategoryRaw(cat[1])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const setSelectedLocation = useCallback((id) => {
    setSelectedLocationRaw(id)
    if (id) {
      AsyncStorage.setItem(LOCATION_KEY, id).catch(() => {})
    } else {
      AsyncStorage.removeItem(LOCATION_KEY).catch(() => {})
    }
  }, [])

  const setSelectedCategory = useCallback((id) => {
    setSelectedCategoryRaw(id)
    if (id) {
      AsyncStorage.setItem(CATEGORY_KEY, id).catch(() => {})
    } else {
      AsyncStorage.removeItem(CATEGORY_KEY).catch(() => {})
    }
  }, [])

  const value = useMemo(() => ({
    selectedLocation,
    selectedCategory,
    setSelectedLocation,
    setSelectedCategory,
    loaded,
  }), [selectedLocation, selectedCategory, setSelectedLocation, setSelectedCategory, loaded])

  return (
    <LocationCategoryContext.Provider value={value}>
      {children}
    </LocationCategoryContext.Provider>
  )
}

export function useLocationCategory() {
  const ctx = useContext(LocationCategoryContext)
  if (!ctx) {
    throw new Error('useLocationCategory must be used within a LocationCategoryProvider')
  }
  return ctx
}

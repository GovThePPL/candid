import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LightTheme, DarkTheme } from '../constants/Colors'

const THEME_PREFERENCE_KEY = '@candid_theme_preference'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const [themePreference, setThemePreferenceState] = useState('light')
  const [loaded, setLoaded] = useState(false)

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemePreferenceState(stored)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const setThemePreference = useCallback((pref) => {
    setThemePreferenceState(pref)
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, pref).catch(() => {})
  }, [])

  const effectiveTheme =
    themePreference === 'system'
      ? (systemScheme || 'light')
      : themePreference

  const isDark = effectiveTheme === 'dark'
  const colors = isDark ? DarkTheme : LightTheme

  const providerValue = useMemo(() => ({
    colors, themePreference, setThemePreference, isDark,
  }), [colors, themePreference, setThemePreference, isDark])

  // Don't render until preference is loaded to avoid flash
  if (!loaded) return null

  return (
    <ThemeContext.Provider value={providerValue}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import i18n from '../i18n'

const LANGUAGE_PREFERENCE_KEY = '@candid_language_preference'
const SUPPORTED_LANGUAGES = ['en', 'es']

/** Whether the device reports a usable locale (on web, getLocales() returns []) */
function systemLanguageAvailable() {
  const locales = getLocales()
  return (
    Array.isArray(locales) &&
    locales.length > 0 &&
    SUPPORTED_LANGUAGES.includes(locales[0]?.languageCode)
  )
}

const I18nContext = createContext()

function getDeviceLanguage() {
  const locales = getLocales()
  if (locales?.length > 0) {
    const code = locales[0].languageCode
    if (SUPPORTED_LANGUAGES.includes(code)) return code
  }
  return 'en'
}

export function I18nProvider({ children }) {
  const [languagePreference, setLanguagePreferenceState] = useState('system')
  const [loaded, setLoaded] = useState(false)

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)
      .then((stored) => {
        if (stored && (SUPPORTED_LANGUAGES.includes(stored) || stored === 'system')) {
          setLanguagePreferenceState(stored)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Sync i18next language when preference changes
  useEffect(() => {
    if (!loaded) return
    const effective = languagePreference === 'system'
      ? getDeviceLanguage()
      : languagePreference
    if (i18n.language !== effective) {
      i18n.changeLanguage(effective)
    }
  }, [languagePreference, loaded])

  const setLanguagePreference = useCallback((pref) => {
    setLanguagePreferenceState(pref)
    AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, pref).catch(() => {})
  }, [])

  const language = languagePreference === 'system'
    ? getDeviceLanguage()
    : languagePreference

  const providerValue = useMemo(() => ({
    language, languagePreference, setLanguagePreference,
  }), [language, languagePreference, setLanguagePreference])

  // Don't render until preference is loaded to avoid flash
  if (!loaded) return null

  return (
    <I18nContext.Provider value={providerValue}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return ctx
}

export { SUPPORTED_LANGUAGES, systemLanguageAvailable }

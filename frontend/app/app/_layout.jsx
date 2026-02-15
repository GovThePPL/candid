import { useEffect, useMemo } from "react"
import { Stack } from "expo-router"
import { Platform, Text } from "react-native"
import { StatusBar } from "expo-status-bar"
import { useFonts, Pacifico_400Regular } from "@expo-google-fonts/pacifico"

// Global font scaling safety net — caps all Text at 2x even without a variant
Text.defaultProps = Text.defaultProps || {}
Text.defaultProps.maxFontSizeMultiplier = 2.0
import { GestureHandlerRootView } from "react-native-gesture-handler"
// KeyboardProvider enables react-native-keyboard-controller's KeyboardAvoidingView
// (native only — tracks actual keyboard frame for smooth height transitions)
const KeyboardProvider = Platform.OS === 'web'
  ? ({ children }) => children
  : require('react-native-keyboard-controller').KeyboardProvider
import { ThemeProvider as NavigationThemeProvider, DefaultTheme as NavDefaultTheme, DarkTheme as NavDarkTheme } from "@react-navigation/native"
import { UserProvider } from "../contexts/UserContext"
import { ThemeProvider, useTheme } from "../contexts/ThemeContext"
import { useTranslation } from "react-i18next"
import { I18nProvider } from "../contexts/I18nContext"
import { LocationCategoryProvider } from "../contexts/LocationCategoryContext"
import { CacheManager } from "../lib/cache"


// Clear application cache on hard reload (Ctrl+Shift+R) so stale data doesn't persist
function useClearCacheOnReload() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const navEntry = performance.getEntriesByType?.('navigation')?.[0]
      if (navEntry?.type === 'reload') {
        CacheManager.clearAll()
      }
    }
  }, [])
}

// Suppress harmless "Invalid pointer id" errors from react-native-gesture-handler on web.
// RNGH's PointerEventManager calls releasePointerCapture without try-catch; when the
// mouse leaves the browser window mid-swipe, the pointer ID is already released by the
// browser and the call throws an uncaught DOMException.
function useSuppressPointerCaptureError() {
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (event) => {
      if (event.message?.includes('releasePointerCapture')) {
        event.preventDefault()
      }
    }
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])
}

// Inject Google Font for web
function useGoogleFont() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check if already loaded
      if (document.getElementById('google-font-pacifico')) return

      // Create link element for Google Font
      const link = document.createElement('link')
      link.id = 'google-font-pacifico'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap'
      document.head.appendChild(link)

      // Also add preconnect for faster loading
      const preconnect1 = document.createElement('link')
      preconnect1.rel = 'preconnect'
      preconnect1.href = 'https://fonts.googleapis.com'
      document.head.appendChild(preconnect1)

      const preconnect2 = document.createElement('link')
      preconnect2.rel = 'preconnect'
      preconnect2.href = 'https://fonts.gstatic.com'
      preconnect2.crossOrigin = 'anonymous'
      document.head.appendChild(preconnect2)
    }
  }, [])
}

function InnerLayout() {
  const { colors, isDark } = useTheme()
  const { t } = useTranslation()

  // Map our theme colors to React Navigation's theme shape so all navigation
  // surfaces (screen backgrounds during transitions, headers, cards) use
  // the correct theme color instead of defaulting to white.
  const navTheme = useMemo(() => ({
    ...(isDark ? NavDarkTheme : NavDefaultTheme),
    colors: {
      ...(isDark ? NavDarkTheme : NavDefaultTheme).colors,
      background: colors.background,
      card: colors.navBackground,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  }), [isDark, colors])

  return (
    <NavigationThemeProvider value={navTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack screenOptions={{
            headerStyle: { backgroundColor: colors.navBackground },
            headerTintColor: colors.title,
            contentStyle: { backgroundColor: colors.background },
          }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
            <Stack.Screen name="index" options={{ title: t('home') }} />
          </Stack>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  // Load Pacifico font on native
  useFonts({ Pacifico_400Regular })

  // Load Google Font for web
  useGoogleFont()

  // Clear application cache on hard reload
  useClearCacheOnReload()

  // Suppress harmless RNGH pointer capture errors on web
  useSuppressPointerCaptureError()

  return (
    <UserProvider>
      <I18nProvider>
        <ThemeProvider>
          <LocationCategoryProvider>
            <InnerLayout />
          </LocationCategoryProvider>
        </ThemeProvider>
      </I18nProvider>
    </UserProvider>
  )
}

import { useEffect } from "react"
import { Stack } from "expo-router"
import { Platform, Text } from "react-native"
import { StatusBar } from "expo-status-bar"
import { useFonts, Pacifico_400Regular } from "@expo-google-fonts/pacifico"

// Global font scaling safety net — caps all Text at 2x even without a variant
Text.defaultProps = Text.defaultProps || {}
Text.defaultProps.maxFontSizeMultiplier = 2.0
import { GestureHandlerRootView } from "react-native-gesture-handler"
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

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: colors.navBackground },
        headerTintColor: colors.title,
      }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: t('home') }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  // Load Pacifico font on native
  useFonts({ Pacifico_400Regular })

  // Load Google Font for web
  useGoogleFont()

  // Clear application cache on hard reload
  useClearCacheOnReload()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <I18nProvider>
          <ThemeProvider>
            <LocationCategoryProvider>
              <InnerLayout />
            </LocationCategoryProvider>
          </ThemeProvider>
        </I18nProvider>
      </UserProvider>
    </GestureHandlerRootView>
  )
}

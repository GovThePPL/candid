import { useEffect, useContext, useMemo, useState, useCallback } from "react"
import { Tabs, useRouter } from "expo-router"
import { Platform, View, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"

import { getFocusedRouteNameFromRoute } from "@react-navigation/core"
import UserOnly from "../../components/auth/UserOnly"
import { UserContext } from "../../contexts/UserContext"
import { NotificationProvider } from "../../contexts/NotificationContext"
import { ToastProvider } from "../../components/Toast"
import { useTranslation } from "react-i18next"
import { useThemeColors } from "../../hooks/useThemeColors"
import { canModerate } from "../../lib/roles"
import api from "../../lib/api"

export default function DashboardLayout() {
  const router = useRouter()
  const { user, activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat, pendingDeepLink, clearPendingDeepLink } = useContext(UserContext)
  const isModerator = canModerate(user)
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [modQueueCount, setModQueueCount] = useState(0)

  // Fetch mod queue count for badge
  const fetchModQueueCount = useCallback(() => {
    if (!isModerator) return
    api.moderation.getQueue()
      .then(data => setModQueueCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {})
  }, [isModerator])

  useEffect(() => {
    fetchModQueueCount()
  }, [fetchModQueueCount])

  // Handle navigation when a chat starts (via socket event) - works from any tab
  useEffect(() => {
    if (activeChatNavigation?.chatId) {
      console.debug('[DashboardLayout] Navigating to chat:', activeChatNavigation.chatId)
      router.push(`/chat/${activeChatNavigation.chatId}`)
      clearActiveChatNavigation()
    }
  }, [activeChatNavigation, router, clearActiveChatNavigation])

  // Handle navigation to existing active chat on app load
  useEffect(() => {
    if (activeChat?.id) {
      console.debug('[DashboardLayout] Navigating to active chat:', activeChat.id)
      router.push(`/chat/${activeChat.id}`)
      clearActiveChat()
    }
  }, [activeChat, router, clearActiveChat])

  // Handle deep link navigation from push notification taps
  useEffect(() => {
    if (pendingDeepLink) {
      router.push(pendingDeepLink)
      clearPendingDeepLink()
    }
  }, [pendingDeepLink, router, clearPendingDeepLink])

  const renderTabIcon = (IconComponent, iconName, focusedIconName) => {
    return ({ focused, color }) => (
      <View style={styles.tabItem}>
        <IconComponent
          size={26}
          name={focused ? focusedIconName : iconName}
          color={color}
        />
      </View>
    )
  }

  return (
    <UserOnly>
      <NotificationProvider>
      <ToastProvider>
      <Tabs
        screenListeners={{
          focus: () => {
            // On web, blur the previously focused element so React Navigation can
            // set aria-hidden on the inactive tab without the browser blocking it
            if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) {
              document.activeElement.blur()
            }
          },
        }}
        sceneStyle={{ backgroundColor: colors.background }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.navBackground,
            paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
            borderTopWidth: 0,
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
              android: { elevation: 8 },
              default: { boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.1)' },
            }),
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarShowLabel: true,
        }}
      >
        <Tabs.Screen
          name="cards"
          options={{
            title: t('tabCards'),
            tabBarIcon: renderTabIcon(MaterialCommunityIcons, 'cards-outline', 'cards'),
          }}
        />
        <Tabs.Screen
          name="discuss"
          options={({ route }) => {
            const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'index'
            return {
              title: t('discuss:tabDiscuss'),
              tabBarIcon: renderTabIcon(Ionicons, 'chatbubbles-outline', 'chatbubbles'),
              ...(focusedRoute !== 'index' ? { tabBarStyle: { display: 'none' } } : {}),
            }
          }}
        />
        {/* Create and Chats - hidden from tab bar, redirect to /profile */}
        <Tabs.Screen
          name="create"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="chats"
          options={{ href: null }}
        />
        {/* Profile - accessed via header avatar */}
        <Tabs.Screen
          name="profile"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: t('tabStats'),
            tabBarIcon: renderTabIcon(Ionicons, 'stats-chart-outline', 'stats-chart'),
          }}
        />
        {/* Moderation queue - only visible to moderators, facilitators, and admins */}
        <Tabs.Screen
          name="moderation"
          options={isModerator ? {
            title: t('tabMod'),
            tabBarIcon: renderTabIcon(Ionicons, 'shield-outline', 'shield'),
            tabBarBadge: modQueueCount > 0 ? modQueueCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 11 },
          } : { href: null }}
        />
        {/* Hide chat folder - requires chat ID, accessed via direct navigation */}
        <Tabs.Screen
          name="chat"
          options={{ href: null }}
        />
        {/* Hidden screens - accessed via header bell icon and user menu */}
        <Tabs.Screen
          name="notifications"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="admin"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="settings"
          options={{ href: null }}
        />
        {/* Position closures - accessed from stats page */}
        <Tabs.Screen
          name="position-closures"
          options={{ href: null }}
        />
        {/* Profile setup - shown after registration */}
        <Tabs.Screen
          name="setup-profile"
          options={{ href: null }}
        />
      </Tabs>
      </ToastProvider>
      </NotificationProvider>
    </UserOnly>
  )
}

const createStyles = (colors) => StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})

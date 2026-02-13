import { useEffect, useContext, useMemo, useState, useCallback } from "react"
import { Tabs, useRouter } from "expo-router"
import { Platform, useWindowDimensions, View, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"

import UserOnly from "../../components/auth/UserOnly"
import { UserContext } from "../../contexts/UserContext"
import { ToastProvider } from "../../components/Toast"
import { useTranslation } from "react-i18next"
import { useThemeColors } from "../../hooks/useThemeColors"
import ThemedText from "../../components/ThemedText"
import { canModerate } from "../../lib/roles"
import api from "../../lib/api"

// Screen width threshold for showing labels beside icons
const WIDE_SCREEN_THRESHOLD = 768

export default function DashboardLayout() {
  const { width } = useWindowDimensions()
  const isWideScreen = width >= WIDE_SCREEN_THRESHOLD
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

  const renderTabIcon = (IconComponent, iconName, focusedIconName, label) => {
    return ({ focused, color }) => (
      <View style={[styles.tabItem, isWideScreen && styles.tabItemWide]}>
        <IconComponent
          size={26}
          name={focused ? focusedIconName : iconName}
          color={color}
        />
        {isWideScreen && (
          <ThemedText variant="bodySmall" style={[styles.tabLabel, { color }]}>{label}</ThemedText>
        )}
      </View>
    )
  }

  return (
    <UserOnly>
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
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.navBackground,
            paddingTop: 8,
            paddingBottom: 8 + (Platform.OS === 'web' ? 0 : insets.bottom),
            height: isWideScreen ? 56 : 50 + (Platform.OS === 'web' ? 0 : insets.bottom),
            borderTopWidth: 0,
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
              android: { elevation: 8 },
              default: { boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.1)' },
            }),
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="cards"
          options={{
            title: t('tabCards'),
            tabBarIcon: renderTabIcon(MaterialCommunityIcons, 'cards-outline', 'cards', t('tabCards')),
          }}
        />
        <Tabs.Screen
          name="discuss"
          options={{
            title: t('discuss:tabDiscuss'),
            tabBarIcon: renderTabIcon(Ionicons, 'chatbubbles-outline', 'chatbubbles', t('discuss:tabDiscuss')),
          }}
        />
        {/* Create and Chats - hidden from tab bar, accessed via FAB and Sidebar */}
        <Tabs.Screen
          name="create"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="chats"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: t('tabStats'),
            tabBarIcon: renderTabIcon(Ionicons, 'stats-chart-outline', 'stats-chart', t('tabStats')),
          }}
        />
        {/* Moderation queue - only visible to moderators, facilitators, and admins */}
        <Tabs.Screen
          name="moderation"
          options={isModerator ? {
            title: t('tabMod'),
            tabBarIcon: renderTabIcon(Ionicons, 'shield-outline', 'shield', t('tabMod')),
            tabBarBadge: modQueueCount > 0 ? modQueueCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 11 },
          } : { href: null }}
        />
        {/* Hide chat folder - requires chat ID, accessed via direct navigation */}
        <Tabs.Screen
          name="chat"
          options={{ href: null }}
        />
        {/* Hidden screens - accessed via user menu */}
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
    </UserOnly>
  )
}

const createStyles = (colors) => StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemWide: {
    flexDirection: 'row',
    gap: 8,
  },
  tabLabel: {
    fontWeight: '500',
  },
})

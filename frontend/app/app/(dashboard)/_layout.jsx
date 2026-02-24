import { useEffect } from "react"
import { View } from "react-native"
import { Stack, useRouter, usePathname } from "expo-router"
import { useThemeColors } from "../../hooks/useThemeColors"
import useIsDesktop from "../../hooks/useIsDesktop"

import UserOnly from "../../components/auth/UserOnly"
import { useChatContext, useNavigationContext } from "../../contexts/UserContext"
import { NotificationProvider } from "../../contexts/NotificationContext"
import { ToastProvider } from "../../components/Toast"
import { GlossaryProvider } from "../../contexts/GlossaryContext"
import DesktopNav from "../../components/DesktopNav"
import DesktopRightPanel from "../../components/DesktopRightPanel"
import CardQueueContent from "../../components/CardQueueContent"
import ModerationQueueContent from "../../components/ModerationQueueContent"

export default function DashboardLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const { activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat } = useChatContext()
  const { pendingDeepLink, clearPendingDeepLink } = useNavigationContext()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()

  const isChatRoute = pathname.startsWith('/chat/')

  // Handle navigation when a chat starts (via socket event) - works from any tab
  useEffect(() => {
    if (activeChatNavigation?.chatId) {
      console.debug('[DashboardLayout] Navigating to chat:', activeChatNavigation.chatId)
      router.push(`/chat/${activeChatNavigation.chatId}`)
      clearActiveChatNavigation()
    }
  }, [activeChatNavigation, router, clearActiveChatNavigation])

  // Handle navigation to existing active chat on app load or foreground
  useEffect(() => {
    if (activeChat?.id) {
      // Guard against double navigation if already on this chat route
      if (!pathname.includes(activeChat.id)) {
        console.debug('[DashboardLayout] Navigating to active chat:', activeChat.id)
        router.push(`/chat/${activeChat.id}`)
      }
      clearActiveChat()
    }
  }, [activeChat, router, clearActiveChat, pathname])

  // Handle deep link navigation from push notification taps
  useEffect(() => {
    if (pendingDeepLink) {
      router.navigate(pendingDeepLink)
      clearPendingDeepLink()
    }
  }, [pendingDeepLink, router, clearPendingDeepLink])

  const stackNavigator = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="user" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="post" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="position-closures" />
      <Stack.Screen name="setup-profile" />
    </Stack>
  )

  if (isDesktop) {
    return (
      <UserOnly>
        <NotificationProvider>
        <GlossaryProvider>
        <ToastProvider>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <DesktopNav />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flex: 1, flexDirection: 'row', width: '100%', maxWidth: isChatRoute ? 720 : 1100 }}>
                <View style={{ flex: 1 }}>
                  {stackNavigator}
                </View>
                {!isChatRoute && (
                  <DesktopRightPanel
                    renderCards={() => <CardQueueContent />}
                    renderModeration={() => <ModerationQueueContent />}
                  />
                )}
              </View>
            </View>
          </View>
        </ToastProvider>
        </GlossaryProvider>
        </NotificationProvider>
      </UserOnly>
    )
  }

  return (
    <UserOnly>
      <NotificationProvider>
      <GlossaryProvider>
      <ToastProvider>
        {stackNavigator}
      </ToastProvider>
      </GlossaryProvider>
      </NotificationProvider>
    </UserOnly>
  )
}

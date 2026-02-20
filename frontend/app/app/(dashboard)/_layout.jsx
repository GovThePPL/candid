import { useEffect } from "react"
import { Stack, useRouter } from "expo-router"
import { useThemeColors } from "../../hooks/useThemeColors"

import UserOnly from "../../components/auth/UserOnly"
import { useChatContext, useNavigationContext } from "../../contexts/UserContext"
import { NotificationProvider } from "../../contexts/NotificationContext"
import { ToastProvider } from "../../components/Toast"

export default function DashboardLayout() {
  const router = useRouter()
  const { activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat } = useChatContext()
  const { pendingDeepLink, clearPendingDeepLink } = useNavigationContext()
  const colors = useThemeColors()

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
      router.navigate(pendingDeepLink)
      clearPendingDeepLink()
    }
  }, [pendingDeepLink, router, clearPendingDeepLink])

  return (
    <UserOnly>
      <NotificationProvider>
      <ToastProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="post" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="position-closures" />
        <Stack.Screen name="setup-profile" />
      </Stack>
      </ToastProvider>
      </NotificationProvider>
    </UserOnly>
  )
}

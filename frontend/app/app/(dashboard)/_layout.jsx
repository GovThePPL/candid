import { useEffect, useRef } from "react"
import { View, Platform } from "react-native"
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
import SessionSelectorModal from "../../components/SessionSelectorModal"
import AcceptedProposalModal from "../../components/AcceptedProposalModal"
import SessionOverviewModal from "../../components/SessionOverviewModal"
import { useLocationSession } from "../../contexts/LocationSessionContext"

export default function DashboardLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const { activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat } = useChatContext()
  const { pendingDeepLink, clearPendingDeepLink } = useNavigationContext()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const {
    selectedSession, selectedLocation, viewingStage,
    sessionSelectorVisible, closeSessionSelector,
    sessionOverviewVisible, closeSessionOverview,
    acceptedProposal, proposalModalVisible, closeProposalModal,
  } = useLocationSession()

  const isChatRoute = pathname.startsWith('/chat/')
  const isAdminRoute = pathname.startsWith('/admin')

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

  // Navigate to tab root when session, location, or viewing stage changes
  // (avoids showing stale subpage content for the previous selection)
  const prevSessionRef = useRef({ selectedSession, selectedLocation, viewingStage })
  useEffect(() => {
    const prev = prevSessionRef.current
    const changed = (
      prev.selectedSession !== selectedSession ||
      prev.selectedLocation !== selectedLocation ||
      prev.viewingStage !== viewingStage
    )
    prevSessionRef.current = { selectedSession, selectedLocation, viewingStage }

    if (!changed) return

    // Tab roots — don't navigate if already at root
    const TAB_ROOTS = ['/discuss', '/stats', '/cards', '/moderation', '/wiki']
    const isAtTabRoot = TAB_ROOTS.some(root => pathname === root || pathname === root + '/')
    const isOnTabSubpage = !isAtTabRoot && TAB_ROOTS.some(root => pathname.startsWith(root + '/'))

    if (isOnTabSubpage) {
      const tabRoot = TAB_ROOTS.find(root => pathname.startsWith(root + '/'))
      if (tabRoot) {
        router.replace(tabRoot)
      }
    }
  }, [selectedSession, selectedLocation, viewingStage, pathname, router])

  const stackNavigator = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
      screenListeners={{
        focus: () => {
          // On web, blur the previously focused element so React Navigation can
          // set aria-hidden on the inactive screen without the browser blocking it
          if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        },
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
              <View style={{ flex: 1, flexDirection: 'column', width: '100%', maxWidth: isChatRoute ? 720 : 1100 }}>
              <View style={{ flex: 1, flexDirection: 'row' }}>
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
          </View>
          <SessionSelectorModal visible={sessionSelectorVisible} onClose={closeSessionSelector} />
          <AcceptedProposalModal visible={proposalModalVisible} onClose={closeProposalModal} proposal={acceptedProposal} />
          <SessionOverviewModal />
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
        <SessionSelectorModal visible={sessionSelectorVisible} onClose={closeSessionSelector} />
        <AcceptedProposalModal visible={proposalModalVisible} onClose={closeProposalModal} proposal={acceptedProposal} />
        <SessionOverviewModal />
      </ToastProvider>
      </GlossaryProvider>
      </NotificationProvider>
    </UserOnly>
  )
}

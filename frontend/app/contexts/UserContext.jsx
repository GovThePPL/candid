import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react"
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api, { getStoredUser, initializeAuth, getToken, setToken, setStoredUser, bugReportsApiWrapper } from "../lib/api"
import * as keycloak from "../lib/keycloak"
import socket, { connectSocket, disconnectSocket, isConnected, getSocket, onChatRequestResponse, onChatRequestReceived, onChatStarted } from "../lib/socket"
import { setupNotificationHandler, addNotificationResponseListener } from "../lib/notifications"
import { install as installErrorCollector, drain as drainErrors } from "../lib/errorCollector"

const PENDING_CHAT_REQUEST_KEY = 'candid_pending_chat_request'
const DIAGNOSTICS_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Split contexts for granular subscriptions
export const AuthContext = createContext()
export const ChatContext = createContext()
export const NavigationContext = createContext()

// Backward-compatible combined context (deprecated — use useAuth/useChatContext/useNavigationContext instead)
export const UserContext = createContext()

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [positionsVersion, setPositionsVersion] = useState(0)
  const [isNewUser, setIsNewUser] = useState(false)

  // Pending chat request state
  // Shape: { id, createdTime, expiresAt, positionStatement, status: 'pending'|'accepted'|'declined' }
  const [pendingChatRequest, setPendingChatRequestState] = useState(null)
  const socketCleanupRef = useRef(null)
  const notifCleanupRef = useRef(null)
  const diagnosticsTimerRef = useRef(null)

  // Incoming chat request card delivered via socket (real-time push)
  // Shape: { type: 'chat_request', data: { id, requester, position, ... } }
  const [incomingChatRequest, setIncomingChatRequest] = useState(null)

  // Clear incoming chat request (called after card queue consumes it)
  const clearIncomingChatRequest = useCallback(() => {
    setIncomingChatRequest(null)
  }, [])

  // Active chat navigation state - when a chat starts, this triggers navigation
  // Shape: { chatId, otherUserId, positionStatement, role }
  const [activeChatNavigation, setActiveChatNavigation] = useState(null)

  // Deep link navigation triggered by push notification tap
  // Shape: string path (e.g., '/admin/request-log')
  const [pendingDeepLink, setPendingDeepLink] = useState(null)
  const clearPendingDeepLink = useCallback(() => setPendingDeepLink(null), [])

  // Existing active chat that user should rejoin on app load
  // Shape: { id, positionStatement, otherUser }
  const [activeChat, setActiveChat] = useState(null)

  // Clear active chat navigation (called after navigation completes)
  const clearActiveChatNavigation = useCallback(() => {
    setActiveChatNavigation(null)
  }, [])

  // Clear active chat (called after user navigates to the chat)
  const clearActiveChat = useCallback(() => {
    setActiveChat(null)
  }, [])

  // Check for active chats when user is authenticated
  const checkForActiveChat = useCallback(async (userId) => {
    console.debug('[UserContext] Checking for active chat for user:', userId)
    try {
      const chat = await api.chat.getActiveChat(userId)
      console.debug('[UserContext] getActiveChat result:', chat?.id || 'none')
      if (chat) {
        console.debug('[UserContext] Setting activeChat:', chat.id)
        setActiveChat(chat)
      }
    } catch (error) {
      console.error('[UserContext] Failed to check for active chat:', error)
    }
  }, [])

  // Call this when positions change (adopt, create, delete, etc.)
  const invalidatePositions = useCallback(() => {
    setPositionsVersion(v => v + 1)
  }, [])

  // Set a new pending chat request (persisted to storage)
  const setPendingChatRequest = useCallback((request) => {
    setPendingChatRequestState(request)
    if (request) {
      AsyncStorage.setItem(PENDING_CHAT_REQUEST_KEY, JSON.stringify(request)).catch(() => {})
    } else {
      AsyncStorage.removeItem(PENDING_CHAT_REQUEST_KEY).catch(() => {})
    }
  }, [])

  // Clear pending chat request
  const clearPendingChatRequest = useCallback(() => {
    setPendingChatRequestState(null)
    AsyncStorage.removeItem(PENDING_CHAT_REQUEST_KEY).catch(() => {})
  }, [])

  // Update pending chat request status (for accept/decline feedback)
  const updateChatRequestStatus = useCallback((status) => {
    setPendingChatRequestState(prev => prev ? { ...prev, status } : null)
  }, [])

  // Initialize socket connection and set up event listeners
  const initializeSocket = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      await connectSocket(token)

      // Set up listeners for chat request responses
      const requestCleanup = onChatRequestResponse({
        onAccepted: (data) => {
          console.debug('[UserContext] Chat request accepted:', data)
          updateChatRequestStatus('accepted')
          // Navigate using chatLogId from the accepted event
          // This is more reliable than waiting for chat_started since it comes via REST API pub/sub
          if (data.chatLogId) {
            console.debug('[UserContext] Navigating to chat via chat_request_accepted:', data.chatLogId)
            setActiveChatNavigation({
              chatId: data.chatLogId,
              otherUserId: null, // Will be populated when joining chat
              positionStatement: null,
              role: 'initiator',
            })
          }
          // Clear after a brief moment to allow UI to show acceptance
          setTimeout(() => clearPendingChatRequest(), 500)
        },
        onDeclined: (data) => {
          console.debug('[UserContext] Chat request declined:', data)
          updateChatRequestStatus('declined')
          // Keep declined state visible for 5 seconds
          setTimeout(() => clearPendingChatRequest(), 5000)
        },
      })

      // Set up listener for incoming chat request cards (real-time delivery to recipient)
      const chatRequestReceivedCleanup = onChatRequestReceived((cardData) => {
        console.debug('[UserContext] Chat request received:', cardData?.data?.id)
        setIncomingChatRequest(cardData)
      })

      // Set up listener for chat started events (triggers navigation for both users)
      // For initiators, this may arrive after chat_request_accepted already triggered navigation
      // For responders, this is the primary navigation trigger (though they also navigate via REST response)
      const chatStartedCleanup = onChatStarted((data) => {
        console.debug('[UserContext] Chat started:', data)
        // Set navigation state - the component will handle actual navigation
        // This will update with full details even if already set by chat_request_accepted
        setActiveChatNavigation((prev) => {
          // If already navigating to this chat, just update with full details
          if (prev?.chatId === data.chatId) {
            console.debug('[UserContext] Updating existing navigation with full details')
            return {
              ...prev,
              otherUserId: data.otherUserId,
              positionStatement: data.positionStatement,
              role: data.role,
            }
          }
          // New navigation
          return {
            chatId: data.chatId,
            otherUserId: data.otherUserId,
            positionStatement: data.positionStatement,
            role: data.role,
          }
        })
        // Clear pending request since we're entering the chat
        clearPendingChatRequest()
      })

      // Listen for socket reconnections to re-check for active chats
      // (handles app restart within the 2-minute abandonment window)
      const sock = getSocket()
      const onReconnect = () => {
        console.debug('[UserContext] Socket reconnected, checking for active chat')
        const storedUser = getStoredUser()
        if (storedUser?.then) {
          storedUser.then(u => { if (u?.id) checkForActiveChat(u.id) })
        }
      }
      if (sock) {
        sock.on('connect', onReconnect)
      }

      socketCleanupRef.current = () => {
        requestCleanup()
        chatRequestReceivedCleanup()
        chatStartedCleanup()
        if (sock) sock.off('connect', onReconnect)
      }

      // Set up push notification handling
      setupNotificationHandler()
      notifCleanupRef.current = addNotificationResponseListener((data) => {
        if (data?.action === 'open_cards') {
          // Navigate to cards page when user taps a chat request notification
          setActiveChatNavigation(null) // Clear any stale navigation
        } else if (data?.action === 'open_organization') {
          setPendingDeepLink('/admin/organization')
        } else if (data?.action === 'open_admin_pending') {
          setPendingDeepLink('/admin')
        } else if (data?.action === 'open_admin_request_log') {
          setPendingDeepLink('/admin/request-log?tab=mine')
        } else if (data?.action === 'open_admin_roles') {
          setPendingDeepLink('/admin/organization')
        } else if (data?.action === 'open_admin') {
          setPendingDeepLink('/admin')
        } else if (data?.action === 'open_post' && data?.postId) {
          if (data.commentId) {
            setPendingDeepLink({ pathname: '/discuss/[id]', params: { id: data.postId, threadRoot: data.commentId, focus: data.commentId } })
          } else {
            setPendingDeepLink(`/discuss/${data.postId}`)
          }
        }
      })
    } catch (error) {
      console.error('[UserContext] Socket connection failed:', error)
    }
  }, [updateChatRequestStatus, clearPendingChatRequest])

  // Clean up socket and notifications on logout
  const cleanupSocket = useCallback(() => {
    if (socketCleanupRef.current) {
      socketCleanupRef.current()
      socketCleanupRef.current = null
    }
    if (notifCleanupRef.current) {
      notifCleanupRef.current()
      notifCleanupRef.current = null
    }
    disconnectSocket()
    clearPendingChatRequest()
  }, [clearPendingChatRequest])

  // Auto-send collected error diagnostics if user has opted in
  const startDiagnosticsTimer = useCallback(() => {
    if (diagnosticsTimerRef.current) return // Already running
    diagnosticsTimerRef.current = setInterval(async () => {
      try {
        // Re-read user from state (closure captures current ref)
        const currentUser = await getStoredUser()
        if (!__DEV__ && !currentUser?.diagnosticsConsent) return
        const errorMetrics = drainErrors()
        if (!errorMetrics) return
        await bugReportsApiWrapper.createReport({
          source: 'auto',
          errorMetrics,
          clientContext: { appVersion: '1.0.0' },
        })
      } catch {
        // Silently fail — diagnostics are best-effort
      }
    }, DIAGNOSTICS_INTERVAL_MS)
  }, [])

  const stopDiagnosticsTimer = useCallback(() => {
    if (diagnosticsTimerRef.current) {
      clearInterval(diagnosticsTimerRef.current)
      diagnosticsTimerRef.current = null
    }
  }, [])

  const login = useCallback(async (username, password) => {
    try {
      const { accessToken } = await keycloak.loginWithCredentials(username, password)
      await setToken(accessToken)
      const currentUser = await api.auth.getCurrentUser()
      await setStoredUser(currentUser)
      setUser(currentUser)
      // Initialize socket before checking for active chats (socket must be ready first)
      await initializeSocket()
      startDiagnosticsTimer()
      // Check for any active chats to rejoin
      checkForActiveChat(currentUser.id)
      return currentUser
    } catch (error) {
      throw Error(error.message || 'Login failed')
    }
  }, [initializeSocket, startDiagnosticsTimer, checkForActiveChat])

  const register = useCallback(async ({ username, email, password }) => {
    try {
      // Create account via backend API (Keycloak Admin REST API)
      await api.auth.registerAccount({ username, email, password })
      // Log in via ROPC to get tokens
      const { accessToken } = await keycloak.loginWithCredentials(username, password)
      await setToken(accessToken)
      // Brief delay to allow backend JWKS cache to populate for new tokens
      await new Promise(resolve => setTimeout(resolve, 300))
      const currentUser = await api.auth.getCurrentUser()
      await setStoredUser(currentUser)
      setUser(currentUser)
      setIsNewUser(true)
      // Initialize socket after successful registration
      initializeSocket()
      startDiagnosticsTimer()
      return currentUser
    } catch (error) {
      throw Error(error.message || 'Registration failed')
    }
  }, [initializeSocket, startDiagnosticsTimer])

  const clearNewUser = useCallback(() => {
    setIsNewUser(false)
  }, [])

  const logout = useCallback(async () => {
    stopDiagnosticsTimer()
    cleanupSocket()
    await keycloak.logout()
    await api.auth.logout()
    setUser(null)
  }, [stopDiagnosticsTimer, cleanupSocket])

  // Refresh user data from API (used after profile updates)
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.auth.getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch (error) {
      console.error('[UserContext] Failed to refresh user:', error)
      throw error
    }
  }, [])

  async function getInitialUserValue() {
    try {
      // Initialize auth (restore token from storage)
      await initializeAuth()

      // Try to get the stored user first
      const storedUser = await getStoredUser()
      if (storedUser) {
        setUser(storedUser)
        // Verify the token is still valid
        try {
          const currentUser = await api.auth.getCurrentUser()
          setUser(currentUser)
          // Initialize socket before checking for active chats (socket must be ready first)
          await initializeSocket()
          startDiagnosticsTimer()
          // Check for any active chats to rejoin
          checkForActiveChat(currentUser.id)
          // Restore pending chat request if not expired
          try {
            const stored = await AsyncStorage.getItem(PENDING_CHAT_REQUEST_KEY)
            if (stored) {
              const request = JSON.parse(stored)
              if (request.expiresAt && new Date(request.expiresAt).getTime() > Date.now()) {
                setPendingChatRequestState(request)
              } else {
                AsyncStorage.removeItem(PENDING_CHAT_REQUEST_KEY).catch(() => {})
              }
            }
          } catch {}
        } catch {
          // Token expired - try refresh via Keycloak
          const tokens = await keycloak.refreshToken()
          if (tokens) {
            await setToken(tokens.accessToken)
            try {
              const currentUser = await api.auth.getCurrentUser()
              setUser(currentUser)
              await initializeSocket()
              startDiagnosticsTimer()
              checkForActiveChat(currentUser.id)
            } catch {
              await api.auth.logout()
              setUser(null)
            }
          } else {
            await api.auth.logout()
            setUser(null)
          }
        }
      }
    } catch (error) {
      setUser(null)
    } finally {
      setAuthChecked(true)
    }
  }

  useEffect(() => {
    installErrorCollector()
    getInitialUserValue()

    // Reconnect socket when app returns to foreground
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && !isConnected()) {
        getToken().then(token => {
          if (token) {
            console.debug('[UserContext] App foregrounded, reconnecting socket')
            initializeSocket()
          }
        })
      }
    })

    return () => {
      stopDiagnosticsTimer()
      appStateSubscription.remove()
    }
  }, [])

  const isBanned = user?.status === 'banned'

  const authValue = useMemo(() => ({
    user, login, logout, register, authChecked, refreshUser,
    isBanned,
    isNewUser, clearNewUser,
  }), [
    user, login, logout, register, authChecked, refreshUser,
    isBanned,
    isNewUser, clearNewUser,
  ])

  const chatValue = useMemo(() => ({
    pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
    incomingChatRequest, clearIncomingChatRequest,
    activeChatNavigation, clearActiveChatNavigation,
    activeChat, clearActiveChat,
  }), [
    pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
    incomingChatRequest, clearIncomingChatRequest,
    activeChatNavigation, clearActiveChatNavigation,
    activeChat, clearActiveChat,
  ])

  const navigationValue = useMemo(() => ({
    pendingDeepLink, clearPendingDeepLink,
    positionsVersion, invalidatePositions,
  }), [
    pendingDeepLink, clearPendingDeepLink,
    positionsVersion, invalidatePositions,
  ])

  // Combined value for backward-compatible UserContext
  const combinedValue = useMemo(() => ({
    ...authValue,
    ...chatValue,
    ...navigationValue,
  }), [authValue, chatValue, navigationValue])

  return (
    <UserContext.Provider value={combinedValue}>
      <AuthContext.Provider value={authValue}>
        <ChatContext.Provider value={chatValue}>
          <NavigationContext.Provider value={navigationValue}>
            {children}
          </NavigationContext.Provider>
        </ChatContext.Provider>
      </AuthContext.Provider>
    </UserContext.Provider>
  )
}

// Hooks for granular context subscriptions
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within a UserProvider')
  }
  return context
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within a UserProvider')
  }
  return context
}

export function useNavigationContext() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigationContext must be used within a UserProvider')
  }
  return context
}

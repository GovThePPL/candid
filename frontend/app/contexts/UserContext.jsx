import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react"
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api, { getStoredUser, initializeAuth, getToken, setToken, setStoredUser, bugReportsApiWrapper } from "../lib/api"
import * as keycloak from "../lib/keycloak"
import { completeSocialRegistration } from "../lib/keycloak"
import socket, { connectSocket, disconnectSocket, isConnected, getSocket, reconnectNow, onChatRequestResponse, onChatRequestReceived, onChatStarted } from "../lib/socket"
import { setupNotificationHandler, registerForPushNotifications, addNotificationResponseListener } from "../lib/notifications"
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

  // Pending social login requiring phone verification
  // Shape: { pendingToken: string } — set when social login returns 202
  const [pendingSocialLogin, setPendingSocialLogin] = useState(null)

  // Pending chat request state
  // Shape: { id, createdTime, expiresAt, positionStatement, status: 'pending'|'accepted'|'declined' }
  const [pendingChatRequest, setPendingChatRequestState] = useState(null)
  const socketCleanupRef = useRef(null)
  const notifCleanupRef = useRef(null)
  const diagnosticsTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)

  // Incoming chat request card delivered via socket (real-time push)
  // Shape: { type: 'chat_request', data: { id, requester, position, ... } }
  const [incomingChatRequest, setIncomingChatRequest] = useState(null)

  // Clear incoming chat request (called after card queue consumes it)
  const clearIncomingChatRequest = useCallback(() => {
    setIncomingChatRequest(null)
  }, [])

  // Restore an unconsumed chat request back to context (called on CardQueueContent unmount)
  const restoreIncomingChatRequest = useCallback((cardData) => {
    setIncomingChatRequest(cardData)
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

  // App-wide heartbeat: keeps REST API presence alive while app is active
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) return
    // Fire immediately, then every 30s
    api.users.heartbeat().catch(() => {})
    heartbeatTimerRef.current = setInterval(() => {
      api.users.heartbeat().catch(() => {})
    }, 30000)
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  // Initialize socket connection and set up event listeners
  const initializeSocket = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      // Use preConnectHook to register listeners BEFORE socket.connect().
      // This ensures they exist before the server emits pending chat requests
      // during the connection handshake.
      let requestCleanup
      let chatRequestReceivedCleanup
      let chatStartedCleanup
      let sock
      let onReconnect

      await connectSocket(token, {
        preConnectHook: () => {
          // Set up listeners for chat request responses
          requestCleanup = onChatRequestResponse({
            onAccepted: (data) => {
              console.debug('[UserContext] Chat request accepted:', data)
              updateChatRequestStatus('accepted')
              if (data.chatLogId) {
                console.debug('[UserContext] Navigating to chat via chat_request_accepted:', data.chatLogId)
                setActiveChatNavigation({
                  chatId: data.chatLogId,
                  otherUserId: null,
                  positionStatement: null,
                  role: 'initiator',
                })
              }
              setTimeout(() => clearPendingChatRequest(), 500)
            },
            onDeclined: (data) => {
              console.debug('[UserContext] Chat request declined:', data)
              updateChatRequestStatus('declined')
              setTimeout(() => clearPendingChatRequest(), 5000)
            },
          })

          // Set up listener for incoming chat request cards (real-time delivery to recipient)
          chatRequestReceivedCleanup = onChatRequestReceived((cardData) => {
            console.debug('[UserContext] Chat request received:', cardData?.data?.id)
            setIncomingChatRequest(cardData)
          })

          // Set up listener for chat started events
          chatStartedCleanup = onChatStarted((data) => {
            console.debug('[UserContext] Chat started:', data)
            setActiveChatNavigation((prev) => {
              if (prev?.chatId === data.chatId) {
                console.debug('[UserContext] Updating existing navigation with full details')
                return {
                  ...prev,
                  otherUserId: data.otherUserId,
                  positionStatement: data.positionStatement,
                  role: data.role,
                }
              }
              return {
                chatId: data.chatId,
                otherUserId: data.otherUserId,
                positionStatement: data.positionStatement,
                role: data.role,
              }
            })
            clearPendingChatRequest()
          })

          // Listen for socket reconnections to re-check for active chats
          sock = getSocket()
          onReconnect = () => {
            console.debug('[UserContext] Socket reconnected, checking for active chat')
            const storedUser = getStoredUser()
            if (storedUser?.then) {
              storedUser.then(u => { if (u?.id) checkForActiveChat(u.id) })
            }
          }
          if (sock) {
            sock.on('connect', onReconnect)
          }
        },
      })

      socketCleanupRef.current = () => {
        if (requestCleanup) requestCleanup()
        if (chatRequestReceivedCleanup) chatRequestReceivedCleanup()
        if (chatStartedCleanup) chatStartedCleanup()
        if (sock) sock.off('connect', onReconnect)
      }

      // Start app-wide heartbeat after successful socket connection
      startHeartbeat()

      // Set up push notification handling
      setupNotificationHandler()
      registerForPushNotifications().catch(err =>
        console.warn('[UserContext] Push token registration failed:', err)
      )
      notifCleanupRef.current = addNotificationResponseListener((data) => {
        if (data?.action === 'open_organization') {
          setPendingDeepLink('/admin/organization')
        } else if (data?.action === 'open_admin_pending') {
          setPendingDeepLink('/admin')
        } else if (data?.action === 'open_admin_request_log') {
          setPendingDeepLink('/admin/request-log?tab=mine')
        } else if (data?.action === 'open_admin_roles') {
          setPendingDeepLink('/admin/organization')
        } else if (data?.action === 'open_admin') {
          setPendingDeepLink('/admin')
        } else if (data?.action === 'open_wiki_suggestions') {
          setPendingDeepLink('/wiki/suggestions')
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
  }, [updateChatRequestStatus, clearPendingChatRequest, startHeartbeat])

  // Clean up socket and notifications on logout
  const cleanupSocket = useCallback(() => {
    stopHeartbeat()
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
  }, [clearPendingChatRequest, stopHeartbeat])

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

  const socialLogin = useCallback(async (provider, identityToken, userInfo) => {
    try {
      const result = await keycloak.loginWithSocialToken(provider, identityToken, userInfo)

      // 202: new user, phone verification required
      if (result.phoneVerificationRequired) {
        setPendingSocialLogin({ pendingToken: result.pendingToken })
        return { phoneVerificationRequired: true }
      }

      await setToken(result.accessToken)
      const currentUser = await api.auth.getCurrentUser()
      await setStoredUser(currentUser)
      setUser(currentUser)
      await initializeSocket()
      startDiagnosticsTimer()
      checkForActiveChat(currentUser.id)
      return currentUser
    } catch (error) {
      throw Error(error.message || 'Social login failed')
    }
  }, [initializeSocket, startDiagnosticsTimer, checkForActiveChat])

  const completeSocialSignup = useCallback(async (phoneNumber, phoneVerifyToken) => {
    if (!pendingSocialLogin) throw Error('No pending social login')
    try {
      const { accessToken } = await completeSocialRegistration(
        pendingSocialLogin.pendingToken, phoneNumber, phoneVerifyToken,
      )
      setPendingSocialLogin(null)
      await setToken(accessToken)
      const currentUser = await api.auth.getCurrentUser()
      await setStoredUser(currentUser)
      setUser(currentUser)
      setIsNewUser(true)
      await initializeSocket()
      startDiagnosticsTimer()
      return currentUser
    } catch (error) {
      throw Error(error.message || 'Registration failed')
    }
  }, [pendingSocialLogin, initializeSocket, startDiagnosticsTimer])

  const clearPendingSocialLogin = useCallback(() => {
    setPendingSocialLogin(null)
  }, [])

  const register = useCallback(async ({ username, email, password, phoneNumber, phoneVerifyToken }) => {
    try {
      // Create account via backend API (Keycloak Admin REST API)
      await api.auth.registerAccount({ username, email, password, phoneNumber, phoneVerifyToken })
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

    // Reconnect socket and manage heartbeat when app state changes
    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        // Restart heartbeat when foregrounded
        let token = await getToken()
        if (!token) return

        // Token may have expired while backgrounded — refresh it
        try {
          const tokens = await keycloak.refreshToken()
          if (tokens) {
            await setToken(tokens.accessToken)
            token = tokens.accessToken
          } else {
            // Refresh token also expired — user must re-login
            await api.auth.logout()
            setUser(null)
            return
          }
        } catch {
          // Refresh failed — continue with existing token (may still be valid)
        }

        startHeartbeat()
        if (!isConnected()) {
          if (getSocket()) {
            // Socket exists but disconnected — reconnect it in-place.
            // This preserves listeners registered by the chat screen and
            // other components (message, typing, status, etc.).
            console.debug('[UserContext] App foregrounded, reconnecting existing socket')
            reconnectNow()
          } else {
            // No socket at all (first connection or after logout)
            console.debug('[UserContext] App foregrounded, initializing new socket')
            initializeSocket()
          }
        }
        // Always check for active chat on foreground — catches accepted
        // requests whose socket events were missed while backgrounded
        // (e.g., zombie connection, iOS JS suspension, network blip)
        const u = await getStoredUser()
        if (u?.id) checkForActiveChat(u.id)
      } else {
        // Stop heartbeat when backgrounded/inactive
        stopHeartbeat()
      }
    })

    return () => {
      stopDiagnosticsTimer()
      appStateSubscription.remove()
    }
  }, [])

  const isBanned = user?.status === 'banned'

  const authValue = useMemo(() => ({
    user, login, socialLogin, logout, register, authChecked, refreshUser,
    isBanned,
    isNewUser, clearNewUser,
    pendingSocialLogin, completeSocialSignup, clearPendingSocialLogin,
  }), [
    user, login, socialLogin, logout, register, authChecked, refreshUser,
    isBanned,
    isNewUser, clearNewUser,
    pendingSocialLogin, completeSocialSignup, clearPendingSocialLogin,
  ])

  const chatValue = useMemo(() => ({
    pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
    incomingChatRequest, clearIncomingChatRequest, restoreIncomingChatRequest,
    activeChatNavigation, clearActiveChatNavigation,
    activeChat, clearActiveChat,
  }), [
    pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
    incomingChatRequest, clearIncomingChatRequest, restoreIncomingChatRequest,
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

import { createContext, useEffect, useState, useCallback, useRef } from "react"
import AsyncStorage from '@react-native-async-storage/async-storage'
import api, { getStoredUser, initializeAuth, getToken, setToken, setStoredUser, bugReportsApiWrapper } from "../lib/api"
import * as keycloak from "../lib/keycloak"
import socket, { connectSocket, disconnectSocket, onChatRequestResponse, onChatRequestReceived, onChatStarted } from "../lib/socket"
import { setupNotificationHandler, addNotificationResponseListener } from "../lib/notifications"
import { install as installErrorCollector, drain as drainErrors } from "../lib/errorCollector"

const PENDING_CHAT_REQUEST_KEY = 'candid_pending_chat_request'
const DIAGNOSTICS_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

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
    console.log('[UserContext] Checking for active chat for user:', userId)
    try {
      const chat = await api.chat.getActiveChat(userId)
      console.log('[UserContext] getActiveChat result:', chat?.id || 'none')
      if (chat) {
        console.log('[UserContext] Setting activeChat:', chat.id)
        setActiveChat(chat)
      }
    } catch (error) {
      console.error('[UserContext] Failed to check for active chat:', error)
    }
  }, [])

  // Call this when positions change (adopt, create, delete, etc.)
  function invalidatePositions() {
    setPositionsVersion(v => v + 1)
  }

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
          console.log('[UserContext] Chat request accepted:', data)
          updateChatRequestStatus('accepted')
          // Navigate using chatLogId from the accepted event
          // This is more reliable than waiting for chat_started since it comes via REST API pub/sub
          if (data.chatLogId) {
            console.log('[UserContext] Navigating to chat via chat_request_accepted:', data.chatLogId)
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
          console.log('[UserContext] Chat request declined:', data)
          updateChatRequestStatus('declined')
          // Keep declined state visible for 5 seconds
          setTimeout(() => clearPendingChatRequest(), 5000)
        },
      })

      // Set up listener for incoming chat request cards (real-time delivery to recipient)
      const chatRequestReceivedCleanup = onChatRequestReceived((cardData) => {
        console.log('[UserContext] Chat request received:', cardData?.data?.id)
        setIncomingChatRequest(cardData)
      })

      // Set up listener for chat started events (triggers navigation for both users)
      // For initiators, this may arrive after chat_request_accepted already triggered navigation
      // For responders, this is the primary navigation trigger (though they also navigate via REST response)
      const chatStartedCleanup = onChatStarted((data) => {
        console.log('[UserContext] Chat started:', data)
        // Set navigation state - the component will handle actual navigation
        // This will update with full details even if already set by chat_request_accepted
        setActiveChatNavigation((prev) => {
          // If already navigating to this chat, just update with full details
          if (prev?.chatId === data.chatId) {
            console.log('[UserContext] Updating existing navigation with full details')
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

      socketCleanupRef.current = () => {
        requestCleanup()
        chatRequestReceivedCleanup()
        chatStartedCleanup()
      }

      // Set up push notification handling
      setupNotificationHandler()
      notifCleanupRef.current = addNotificationResponseListener((data) => {
        if (data?.action === 'open_cards') {
          // Navigate to cards page when user taps a chat request notification
          setActiveChatNavigation(null) // Clear any stale navigation
        } else if (data?.action === 'open_admin_pending') {
          setPendingDeepLink('/admin/request-log')
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

  async function login(username, password) {
    try {
      const { accessToken } = await keycloak.loginWithCredentials(username, password)
      await setToken(accessToken)
      const currentUser = await api.auth.getCurrentUser()
      await setStoredUser(currentUser)
      setUser(currentUser)
      // Initialize socket after successful login
      initializeSocket()
      startDiagnosticsTimer()
      // Check for any active chats to rejoin
      checkForActiveChat(currentUser.id)
      return currentUser
    } catch (error) {
      throw Error(error.message || 'Login failed')
    }
  }

  async function register({ username, email, password }) {
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
  }

  function clearNewUser() {
    setIsNewUser(false)
  }

  async function logout() {
    stopDiagnosticsTimer()
    cleanupSocket()
    await keycloak.logout()
    await api.auth.logout()
    setUser(null)
  }

  // Refresh user data from API (used after profile updates)
  async function refreshUser() {
    try {
      const currentUser = await api.auth.getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch (error) {
      console.error('[UserContext] Failed to refresh user:', error)
      throw error
    }
  }

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
          // Initialize socket for authenticated user
          initializeSocket()
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
              initializeSocket()
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
    return () => stopDiagnosticsTimer()
  }, [])

  return (
    <UserContext.Provider value={{
      user, login, logout, register, authChecked, refreshUser,
      isBanned: user?.status === 'banned',
      isNewUser, clearNewUser,
      positionsVersion, invalidatePositions,
      pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
      incomingChatRequest, clearIncomingChatRequest,
      activeChatNavigation, clearActiveChatNavigation,
      activeChat, clearActiveChat,
      pendingDeepLink, clearPendingDeepLink,
    }}>
      {children}
    </UserContext.Provider>
  )
}

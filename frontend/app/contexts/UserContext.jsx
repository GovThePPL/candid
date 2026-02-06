import { createContext, useEffect, useState, useCallback, useRef } from "react"
import AsyncStorage from '@react-native-async-storage/async-storage'
import api, { getStoredUser, initializeAuth, getToken } from "../lib/api"
import socket, { connectSocket, disconnectSocket, onChatRequestResponse, onChatStarted } from "../lib/socket"

const PENDING_CHAT_REQUEST_KEY = 'candid_pending_chat_request'

export const UserContext = createContext()

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [positionsVersion, setPositionsVersion] = useState(0)

  // Pending chat request state
  // Shape: { id, createdTime, expiresAt, positionStatement, status: 'pending'|'accepted'|'declined' }
  const [pendingChatRequest, setPendingChatRequestState] = useState(null)
  const socketCleanupRef = useRef(null)

  // Active chat navigation state - when a chat starts, this triggers navigation
  // Shape: { chatId, otherUserId, positionStatement, role }
  const [activeChatNavigation, setActiveChatNavigation] = useState(null)

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
        chatStartedCleanup()
      }
    } catch (error) {
      console.error('[UserContext] Socket connection failed:', error)
    }
  }, [updateChatRequestStatus, clearPendingChatRequest])

  // Clean up socket on logout
  const cleanupSocket = useCallback(() => {
    if (socketCleanupRef.current) {
      socketCleanupRef.current()
      socketCleanupRef.current = null
    }
    disconnectSocket()
    clearPendingChatRequest()
  }, [clearPendingChatRequest])

  async function login(username, password) {
    try {
      const response = await api.auth.login(username, password)
      setUser(response.user)
      // Initialize socket after successful login
      initializeSocket()
      // Check for any active chats to rejoin
      checkForActiveChat(response.user.id)
      return response
    } catch (error) {
      throw Error(error.message || 'Login failed')
    }
  }

  async function register(username, displayName, password, email = null) {
    try {
      const response = await api.auth.register(username, displayName, password, email)
      // Registration doesn't auto-login, so we need to login after
      await login(username, password)
      return response
    } catch (error) {
      throw Error(error.message || 'Registration failed')
    }
  }

  async function logout() {
    cleanupSocket()
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
        // Optionally verify the token is still valid
        try {
          const currentUser = await api.auth.getCurrentUser()
          setUser(currentUser)
          // Initialize socket for authenticated user
          initializeSocket()
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
          // Token expired or invalid, clear the user
          await api.auth.logout()
          setUser(null)
        }
      }
    } catch (error) {
      setUser(null)
    } finally {
      setAuthChecked(true)
    }
  }

  useEffect(() => {
    getInitialUserValue()
  }, [])

  return (
    <UserContext.Provider value={{
      user, login, logout, register, authChecked, refreshUser,
      positionsVersion, invalidatePositions,
      pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
      activeChatNavigation, clearActiveChatNavigation,
      activeChat, clearActiveChat,
    }}>
      {children}
    </UserContext.Provider>
  )
}

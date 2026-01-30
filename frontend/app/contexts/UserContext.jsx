import { createContext, useEffect, useState, useCallback, useRef } from "react"
import api, { getStoredUser, initializeAuth, getToken } from "../lib/api"
import socket, { connectSocket, disconnectSocket, onChatRequestResponse, onChatStarted } from "../lib/socket"

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

  // Set a new pending chat request
  const setPendingChatRequest = useCallback((request) => {
    setPendingChatRequestState(request)
  }, [])

  // Clear pending chat request
  const clearPendingChatRequest = useCallback(() => {
    setPendingChatRequestState(null)
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
      const chatStartedCleanup = onChatStarted((data) => {
        console.log('[UserContext] Chat started:', data)
        // Set navigation state - the component will handle actual navigation
        setActiveChatNavigation({
          chatId: data.chatId,
          otherUserId: data.otherUserId,
          positionStatement: data.positionStatement,
          role: data.role,
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
      user, login, logout, register, authChecked,
      positionsVersion, invalidatePositions,
      pendingChatRequest, setPendingChatRequest, clearPendingChatRequest, updateChatRequestStatus,
      activeChatNavigation, clearActiveChatNavigation,
      activeChat, clearActiveChat,
    }}>
      {children}
    </UserContext.Provider>
  )
}

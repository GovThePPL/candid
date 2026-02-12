import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from 'react-native'

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../../../constants/Colors'
import { Shadows } from '../../../constants/Theme'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { UserContext } from '../../../contexts/UserContext'
import Header from '../../../components/Header'
import api, { translateError } from '../../../lib/api'
import {
  joinChat,
  sendMessage,
  onMessage,
  sendTyping,
  onTyping,
  exitChat,
  onChatStatus,
  isConnected,
  sendReadReceipt,
  onReadReceipt,
  proposeAgreedPosition,
  respondToAgreedPosition,
  onAgreedPosition,
} from '../../../lib/socket'
import { playTypingSound, playMessageSound } from '../../../lib/sounds'
import { getTrustBadgeColor } from '../../../lib/avatarUtils'
import Avatar from '../../../components/Avatar'
import ThemedText from '../../../components/ThemedText'
import PositionInfoCard from '../../../components/PositionInfoCard'
import ReportModal from '../../../components/ReportModal'
import { useTranslation } from 'react-i18next'

export default function ChatScreen() {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { id: chatId, from, reporterId } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useContext(UserContext)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const { t } = useTranslation('chat')

  // Proposal card dimensions relative to screen width
  const proposalCardWidth = Math.min(Math.max(screenWidth * 0.7, 200), 400)
  // Offset constrained so card never goes off-screen
  const maxOffset = (screenWidth - proposalCardWidth) / 2
  const proposalOffset = Math.min(screenWidth * 0.1, maxOffset - 8) // 8px padding from edge
  const insets = useSafeAreaInsets()

  // Max input height is 40% of screen
  const maxInputHeight = screenHeight * 0.4

  // Header is approximately 64px + top inset
  const keyboardOffset = Platform.OS === 'ios' ? 64 + insets.top : 0

  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chatInfo, setChatInfo] = useState(null)
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  const [chatEnded, setChatEnded] = useState(false)
  const [chatEndedWithClosure, setChatEndedWithClosure] = useState(false)
  const [otherUserLeft, setOtherUserLeft] = useState(false)
  const [isHistoricalView, setIsHistoricalView] = useState(false) // True when viewing archived chat from history
  const [isModerationView, setIsModerationView] = useState(false) // True when moderator is viewing a reported chat
  const [participants, setParticipants] = useState(null) // Both participants when in moderation view
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [inputHeight, setInputHeight] = useState(40)
  const [otherUserLastRead, setOtherUserLastRead] = useState(null) // Message ID other user has read up to
  const [showSpecialMenu, setShowSpecialMenu] = useState(false) // Show menu for special message types
  const [messageType, setMessageType] = useState('text') // 'text', 'position_proposal', 'closure_proposal'
  const [modifyingProposal, setModifyingProposal] = useState(null) // Proposal being modified
  const [modifyText, setModifyText] = useState('') // Text for modified proposal
  const [expandedProposalStack, setExpandedProposalStack] = useState(null) // ID of expanded proposal stack
  const [proposalHeights, setProposalHeights] = useState({}) // Track heights of proposal cards for stacking
  const [kudosStatus, setKudosStatus] = useState(null) // null = show prompt, 'sent' = kudos sent, 'dismissed' = dismissed
  const [reportModalVisible, setReportModalVisible] = useState(false)

  const flatListRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const isNearBottomRef = useRef(true) // Track if user is near bottom of chat
  const otherTypingTimeoutRef = useRef(null) // Delay before hiding other user's typing indicator
  const lastSentReadReceiptRef = useRef(null) // Track last read receipt we sent to avoid duplicates
  const visibleMessageIdsRef = useRef(new Set()) // Track which messages are currently visible on screen

  // Animated values for typing dots
  const dot1Anim = useRef(new Animated.Value(0)).current
  const dot2Anim = useRef(new Animated.Value(0)).current
  const dot3Anim = useRef(new Animated.Value(0)).current

  // Get other user from chat info
  const otherUser = chatInfo?.otherUser

  // Hide tab bar when chat screen is active
  useEffect(() => {
    const parent = navigation.getParent()
    parent?.setOptions({ tabBarStyle: { display: 'none' } })

    return () => {
      // Restore tab bar when leaving
      parent?.setOptions({ tabBarStyle: undefined })
    }
  }, [navigation])

  // Animate typing dots and play sound when other user is typing
  useEffect(() => {
    if (otherUserTyping) {
      // Play subtle typing sound
      playTypingSound()

      const animateDots = () => {
        Animated.loop(
          Animated.sequence([
            Animated.stagger(150, [
              Animated.sequence([
                Animated.timing(dot1Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot1Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(dot2Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot2Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(dot3Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot3Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
            ]),
          ])
        ).start()
      }
      animateDots()
    } else {
      dot1Anim.setValue(0)
      dot2Anim.setValue(0)
      dot3Anim.setValue(0)
    }
  }, [otherUserTyping, dot1Anim, dot2Anim, dot3Anim])

  // Scroll to bottom when new messages arrive (if near bottom)
  const prevMessageLengthRef = useRef(0)
  useEffect(() => {
    if (messages.length > prevMessageLengthRef.current && isNearBottomRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
    prevMessageLengthRef.current = messages.length
  }, [messages.length])

  // Ref to hold the current send read receipt function (to keep onViewableItemsChanged stable)
  const sendReadReceiptRef = useRef(null)

  // Send read receipts only for messages that are visible on screen
  sendReadReceiptRef.current = () => {
    if (!user?.id || messages.length === 0 || loading) return

    // Find the latest visible message from the other user
    let latestVisibleOtherUserMessage = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const senderId = msg.sender_id || msg.sender || msg.senderId
      const isFromOtherUser = senderId && senderId !== user.id
      const isVisible = visibleMessageIdsRef.current.has(msg.id)

      if (isFromOtherUser && isVisible) {
        latestVisibleOtherUserMessage = msg
        break
      }
    }

    // Send read receipt if we have a visible message to mark as read
    if (latestVisibleOtherUserMessage && latestVisibleOtherUserMessage.id !== lastSentReadReceiptRef.current) {
      lastSentReadReceiptRef.current = latestVisibleOtherUserMessage.id
      sendReadReceipt(chatId, latestVisibleOtherUserMessage.id)
    }
  }

  // Handle viewable items change - track which messages are visible
  // These must be stable refs since FlatList doesn't allow changing them
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50, // Item must be 50% visible to count
  }).current

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    // Update the set of visible message IDs
    visibleMessageIdsRef.current = new Set(
      viewableItems.map(item => item.item?.id).filter(Boolean)
    )
    // Check if we should send a read receipt for newly visible messages
    sendReadReceiptRef.current?.()
  }).current

  // Scroll when typing indicator appears (if near bottom)
  useEffect(() => {
    if (otherUserTyping && isNearBottomRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [otherUserTyping])

  // Handle scroll to track if user is near bottom
  const handleScroll = useCallback((event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
    const paddingToBottom = 100 // Consider "near bottom" if within 100px
    isNearBottomRef.current =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom
  }, [])

  // Join chat and set up listeners
  useEffect(() => {
    let cleanupMessage = null
    let cleanupTyping = null
    let cleanupStatus = null
    let cleanupReadReceipt = null
    let cleanupAgreedPosition = null

    async function initChat() {
      try {
        setLoading(true)
        setError(null)

        // If viewing from chat history or moderation, load directly from API (no WebSocket needed)
        if (from === 'chats' || from === 'moderation') {
          try {
            const chatLog = await api.chat.getChatLog(chatId)
            setChatInfo(chatLog)
            setChatEnded(true)
            setIsHistoricalView(true)

            // If moderator view, capture participants for message attribution
            if (from === 'moderation') {
              setIsModerationView(true)
              const chatParticipants = chatLog.participants
                || [chatLog.otherUser, chatLog.position?.creator].filter(Boolean)
              if (chatParticipants.length >= 2) {
                // Order so reporter is participants[0] (right/own side), non-reporter is participants[1] (left/other side)
                if (reporterId && String(chatParticipants[1]?.id) === String(reporterId)) {
                  chatParticipants.reverse()
                }
                setParticipants(chatParticipants)
              }
            }

            // Load messages and proposals from the chat log
            const historicalMessages = []

            // Load regular messages
            if (chatLog.log?.messages && Array.isArray(chatLog.log.messages)) {
              for (const msg of chatLog.log.messages) {
                historicalMessages.push({
                  id: msg.id || `msg-${msg.timestamp || Date.now()}`,
                  content: msg.content,
                  sender_id: msg.sender_id || msg.senderId,
                  timestamp: msg.timestamp || msg.sendTime,
                  type: msg.type || 'text',
                  isProposal: msg.isProposal || ['proposed', 'accepted', 'rejected', 'modified'].includes(msg.type),
                  proposalId: msg.proposalId || msg.proposal_id,
                  isClosure: msg.isClosure || msg.is_closure,
                  parentId: msg.parentId || msg.parent_id,
                })
              }
            }

            // Load agreed positions as proposal messages
            const positions = chatLog.log?.agreedPositions || []
            if (Array.isArray(positions)) {
              for (const pos of positions) {
                // Map status to display type
                let displayType = pos.status || 'proposed'
                if (displayType === 'pending') displayType = 'proposed'

                historicalMessages.push({
                  id: pos.id || `proposal-${pos.timestamp || Date.now()}`,
                  content: pos.content,
                  sender_id: pos.proposer_id || pos.proposerId,
                  timestamp: pos.timestamp,
                  type: displayType,
                  isProposal: true,
                  proposalId: pos.id,
                  isClosure: pos.is_closure || pos.isClosure || false,
                  parentId: pos.parent_id || pos.parentId || null,
                })
              }
            }

            // Load accepted closure if present and not already in positions
            const closureData = chatLog.log?.agreedClosure
            if (closureData && chatLog.endType === 'agreed_closure' && closureData.content) {
              const alreadyHasClosure = positions.some(p => (p.isClosure) && p.status === 'accepted')

              if (!alreadyHasClosure) {
                historicalMessages.push({
                  id: closureData.id,
                  content: closureData.content,
                  sender_id: closureData.proposerId,
                  timestamp: closureData.timestamp || chatLog.endTime,
                  type: 'accepted',
                  isProposal: true,
                  proposalId: closureData.id,
                  isClosure: true,
                  parentId: null,
                })
              }
            }

            // Sort by timestamp
            historicalMessages.sort((a, b) => {
              const timeA = new Date(a.timestamp || 0).getTime()
              const timeB = new Date(b.timestamp || 0).getTime()
              return timeA - timeB
            })

            setMessages(historicalMessages)
            setLoading(false)
            return
          } catch (err) {
            console.error('Failed to load chat history:', err)
            setError(translateError(err.message, t) || t('failedLoadChat'))
            setLoading(false)
            return
          }
        }

        // For active chats, use WebSocket
        // Check socket connection
        if (!isConnected()) {
          setError(t('notConnected'))
          setLoading(false)
          return
        }

        // Join the chat room
        let joinResponse
        try {
          joinResponse = await joinChat(chatId)
          // Process messages to detect and properly format proposal messages
          const rawMessages = joinResponse.messages || []
          const processedMessages = rawMessages.map(msg => {
            // Check if this is a proposal message by its type
            const isProposalType = ['proposed', 'accepted', 'rejected', 'modified'].includes(msg.type)
            if (isProposalType) {
              return {
                ...msg,
                isProposal: true,
                // Ensure we have all necessary proposal fields with snake_case fallbacks
                proposalId: msg.proposal_id || msg.proposalId || msg.id,
                isClosure: msg.is_closure || msg.isClosure || false,
                parentId: msg.parent_id || msg.parentId || null,
              }
            }
            return msg
          })

          // Also check if agreedPositions are returned separately and need to be merged
          const agreedPositions = joinResponse.agreedPositions || []
          const proposalMessages = agreedPositions.map(pos => ({
            id: pos.id || `proposal-${pos.proposal_id || Date.now()}`,
            content: pos.content,
            type: pos.status || 'proposed', // status could be 'proposed', 'accepted', 'rejected', 'modified'
            sender_id: pos.proposer_id,
            timestamp: pos.created_at || pos.updated_at,
            isProposal: true,
            isClosure: pos.is_closure || false,
            proposalId: pos.id || pos.proposal_id,
            parentId: pos.parent_id || null,
          }))

          // Merge messages and proposals, sorted by timestamp
          const allMessages = [...processedMessages, ...proposalMessages].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.sendTime || 0).getTime()
            const timeB = new Date(b.timestamp || b.sendTime || 0).getTime()
            return timeA - timeB
          })

          setMessages(allMessages)
        } catch (joinErr) {
          // If join fails (e.g., chat already ended), check if it's archived in PostgreSQL
          console.log('Join failed, checking if chat is archived:', joinErr.message)
          try {
            const chatLog = await api.chat.getChatLog(chatId)
            if (chatLog.status === 'ended' || chatLog.status === 'archived') {
              // Chat has ended, show it as a historical view
              setChatInfo(chatLog)
              setChatEnded(true)
              setIsHistoricalView(true)

              // Load messages and proposals from the chat log
              const historicalMessages = []

              // Load regular messages
              if (chatLog.log?.messages && Array.isArray(chatLog.log.messages)) {
                for (const msg of chatLog.log.messages) {
                  historicalMessages.push({
                    id: msg.id || `msg-${msg.timestamp || Date.now()}`,
                    content: msg.content,
                    sender_id: msg.sender_id || msg.senderId,
                    timestamp: msg.timestamp || msg.sendTime,
                    type: msg.type || 'text',
                    isProposal: msg.isProposal || ['proposed', 'accepted', 'rejected', 'modified'].includes(msg.type),
                    proposalId: msg.proposalId || msg.proposal_id,
                    isClosure: msg.isClosure || msg.is_closure,
                    parentId: msg.parentId || msg.parent_id,
                  })
                }
              }

              // Load agreed positions as proposal messages
              if (chatLog.log?.agreedPositions && Array.isArray(chatLog.log.agreedPositions)) {
                for (const pos of chatLog.log.agreedPositions) {
                  historicalMessages.push({
                    id: pos.id || `proposal-${pos.timestamp || Date.now()}`,
                    content: pos.content,
                    sender_id: pos.proposer_id || pos.proposerId,
                    timestamp: pos.timestamp,
                    type: pos.status || 'proposed',
                    isProposal: true,
                    proposalId: pos.id,
                    isClosure: pos.is_closure || pos.isClosure || false,
                    parentId: pos.parent_id || pos.parentId || null,
                  })
                }
              }

              // Sort by timestamp
              historicalMessages.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime()
                const timeB = new Date(b.timestamp || 0).getTime()
                return timeA - timeB
              })

              setMessages(historicalMessages)

              setLoading(false)
              return
            }
          } catch (apiErr) {
            // API also failed, show original error
          }
          throw joinErr
        }

        // Get chat log info from API for position statement
        try {
          const chatLog = await api.chat.getChatLog(chatId)
          setChatInfo(chatLog)
          if (chatLog.status === 'ended' || chatLog.status === 'archived') {
            setChatEnded(true)
            setIsHistoricalView(true)

            // For historical chats, load messages and proposals from the database log
            // (WebSocket might return empty for archived chats)
            setMessages(prevMessages => {
              // Only replace if current messages are empty
              if (prevMessages.length > 0) return prevMessages

              const historicalMessages = []

              // Load regular messages
              if (chatLog.log?.messages && Array.isArray(chatLog.log.messages)) {
                for (const msg of chatLog.log.messages) {
                  historicalMessages.push({
                    id: msg.id || `msg-${msg.timestamp || Date.now()}`,
                    content: msg.content,
                    sender_id: msg.sender_id || msg.senderId,
                    timestamp: msg.timestamp || msg.sendTime,
                    type: msg.type || 'text',
                    isProposal: msg.isProposal || ['proposed', 'accepted', 'rejected', 'modified'].includes(msg.type),
                    proposalId: msg.proposalId || msg.proposal_id,
                    isClosure: msg.isClosure || msg.is_closure,
                    parentId: msg.parentId || msg.parent_id,
                  })
                }
              }

              // Load agreed positions as proposal messages
              if (chatLog.log?.agreedPositions && Array.isArray(chatLog.log.agreedPositions)) {
                for (const pos of chatLog.log.agreedPositions) {
                  historicalMessages.push({
                    id: pos.id || `proposal-${pos.timestamp || Date.now()}`,
                    content: pos.content,
                    sender_id: pos.proposer_id || pos.proposerId,
                    timestamp: pos.timestamp,
                    type: pos.status || 'proposed', // 'pending', 'accepted', 'rejected', 'modified'
                    isProposal: true,
                    proposalId: pos.id,
                    isClosure: pos.is_closure || pos.isClosure || false,
                    parentId: pos.parent_id || pos.parentId || null,
                  })
                }
              }

              // Sort by timestamp
              historicalMessages.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime()
                const timeB = new Date(b.timestamp || 0).getTime()
                return timeA - timeB
              })

              return historicalMessages
            })
          }
        } catch (err) {
          console.error('Failed to get chat log:', err)
        }

        // Set up message listener
        cleanupMessage = onMessage((message) => {
          // Handle messages from the other user
          const senderId = message.sender_id || message.sender || message.senderId
          const isFromOther = senderId && senderId !== user?.id

          if (isFromOther) {
            playMessageSound()
            // Clear any pending typing timeout
            if (otherTypingTimeoutRef.current) {
              clearTimeout(otherTypingTimeoutRef.current)
              otherTypingTimeoutRef.current = null
            }
            // Hide typing indicator immediately when message arrives
            setOtherUserTyping(false)
          }

          // Add message
          setMessages(prev => [...prev, message])
        })

        // Set up typing listener with delay before hiding
        cleanupTyping = onTyping((data) => {
          if (data.userId !== user?.id) {
            // Clear any pending hide timeout
            if (otherTypingTimeoutRef.current) {
              clearTimeout(otherTypingTimeoutRef.current)
              otherTypingTimeoutRef.current = null
            }

            if (data.isTyping) {
              // Show typing indicator immediately
              setOtherUserTyping(true)
            } else {
              // Delay hiding typing indicator to allow message to arrive first
              // If they start typing again, this timeout will be cleared
              otherTypingTimeoutRef.current = setTimeout(() => {
                setOtherUserTyping(false)
              }, 2000)
            }
          }
        })

        // Set up chat status listener
        cleanupStatus = onChatStatus((data) => {
          console.log('[Chat] Status event:', data)
          if (data.chatId === chatId || String(data.chatId) === String(chatId)) {
            if (data.status === 'user_left') {
              // Other user left the chat
              setOtherUserLeft(true)
              setChatEnded(true)
            } else if (data.status === 'ended' || data.type === 'chat_ended') {
              setChatEnded(true)
              // If ended with agreed closure, mark all pending closure proposals as accepted
              if (data.endType === 'agreed_closure' || data.agreedClosure) {
                setChatEndedWithClosure(true)
                setMessages(prev => prev.map(msg => {
                  if (msg.isProposal && msg.isClosure && msg.type === 'proposed') {
                    return { ...msg, type: 'accepted' }
                  }
                  return msg
                }))
              }
            }
          }
        })

        // Set up read receipt listener
        cleanupReadReceipt = onReadReceipt((data) => {
          const eventChatId = String(data.chatId || '')
          const eventUserId = String(data.userId || '')
          const currentChatId = String(chatId || '')
          const currentUserId = String(user?.id || '')
          if (eventChatId === currentChatId && eventUserId !== currentUserId) {
            // Other user has read up to this message
            setOtherUserLastRead(data.messageId)
          }
        })

        // Set up agreed position listener
        cleanupAgreedPosition = onAgreedPosition((data) => {
          console.log('[Chat] Agreed position event:', data)
          const proposal = data.proposal || {}
          const action = data.action
          const proposerId = proposal.proposer_id || data.proposerId

          // Hide typing indicator when we receive a proposal from the other user
          if (proposerId && proposerId !== user?.id) {
            if (otherTypingTimeoutRef.current) {
              clearTimeout(otherTypingTimeoutRef.current)
              otherTypingTimeoutRef.current = null
            }
            setOtherUserTyping(false)
          }

          if (action === 'propose') {
            // Add new proposal as a special message to the chat
            const proposalMessage = {
              id: proposal.id || `proposal-${Date.now()}`,
              content: proposal.content || data.content,
              type: 'proposed',
              sender_id: proposal.proposer_id || data.proposerId,
              timestamp: proposal.created_at || new Date().toISOString(),
              isProposal: true,
              isClosure: proposal.is_closure || data.isClosure,
              proposalId: proposal.id,
              parentId: proposal.parent_id || null,
            }
            setMessages(prev => [...prev, proposalMessage])
          } else if (action === 'accept' || action === 'reject') {
            // Update existing proposal status
            setMessages(prev => prev.map(msg => {
              if (msg.isProposal && msg.proposalId === proposal.id) {
                return {
                  ...msg,
                  type: action === 'accept' ? 'accepted' : 'rejected',
                }
              }
              return msg
            }))

            // If closure was accepted, mark chat as ended
            if (action === 'accept' && (proposal.is_closure || data.isClosure)) {
              setChatEnded(true)
              setChatEndedWithClosure(true)
            }
          } else if (action === 'modify') {
            // Mark old proposal as modified and add new one
            setMessages(prev => {
              const updated = prev.map(msg => {
                if (msg.isProposal && msg.proposalId === data.originalProposalId) {
                  return { ...msg, type: 'modified' }
                }
                return msg
              })
              // Add the new modified proposal
              const newProposalMessage = {
                id: proposal.id || `proposal-${Date.now()}`,
                content: proposal.content || data.content,
                type: 'proposed',
                sender_id: proposal.proposer_id || data.proposerId,
                timestamp: proposal.created_at || new Date().toISOString(),
                isProposal: true,
                isClosure: proposal.is_closure || data.isClosure,
                proposalId: proposal.id,
                parentId: data.originalProposalId, // Link to the original proposal
              }
              return [...updated, newProposalMessage]
            })
          }
        })

        setLoading(false)
      } catch (err) {
        console.error('Failed to join chat:', err)
        setError(translateError(err.message, t) || t('failedJoinChat'))
        setLoading(false)
      }
    }

    initChat()

    return () => {
      if (cleanupMessage) cleanupMessage()
      if (cleanupTyping) cleanupTyping()
      if (cleanupStatus) cleanupStatus()
      if (cleanupReadReceipt) cleanupReadReceipt()
      if (cleanupAgreedPosition) cleanupAgreedPosition()
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (otherTypingTimeoutRef.current) {
        clearTimeout(otherTypingTimeoutRef.current)
      }
    }
  }, [chatId, user?.id, from])

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || chatEnded) return

    const currentMessageType = messageType

    try {
      setInputText('')
      setInputHeight(40) // Reset input height
      setMessageType('text') // Reset to default chat type after sending

      // Stop typing indicator
      if (isTypingRef.current) {
        sendTyping(chatId, false)
        isTypingRef.current = false
      }

      // Send via socket - use proposeAgreedPosition for proposals, sendMessage for regular chat
      if (currentMessageType === 'position_proposal' || currentMessageType === 'closure_proposal') {
        const isClosure = currentMessageType === 'closure_proposal'
        await proposeAgreedPosition(chatId, text, isClosure)
      } else {
        await sendMessage(chatId, text, currentMessageType)
      }
    } catch (err) {
      console.error('Failed to send message:', err)
      // Restore the input text and message type on error
      setInputText(text)
      setMessageType(currentMessageType)
    }
  }, [chatId, inputText, chatEnded, messageType])

  // Handle typing indicator
  const handleTextChange = useCallback((text) => {
    setInputText(text)

    // Send typing indicator
    if (text.length > 0 && !isTypingRef.current) {
      sendTyping(chatId, true)
      isTypingRef.current = true
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        sendTyping(chatId, false)
        isTypingRef.current = false
      }
    }, 2000)
  }, [chatId])

  // Handle input content size change for dynamic height
  const handleContentSizeChange = useCallback((event) => {
    const contentHeight = event.nativeEvent.contentSize.height
    // Clamp between minHeight (40) and maxHeight
    const newHeight = Math.min(Math.max(40, contentHeight), maxInputHeight)
    setInputHeight(newHeight)
  }, [maxInputHeight])

  // Show leave confirmation
  const handleBackPress = useCallback(() => {
    if (chatEnded) {
      // Navigate based on where we came from
      if (from === 'chats') {
        router.replace('/chats')
      } else if (from === 'moderation') {
        router.replace('/moderation')
      } else {
        router.back()
      }
    } else {
      setShowLeaveConfirm(true)
    }
  }, [chatEnded, router, from])

  // Handle confirmed exit chat
  const handleConfirmLeave = useCallback(async () => {
    setShowLeaveConfirm(false)
    // Only try to exit if the chat hasn't already ended (e.g., other user left)
    if (!chatEnded) {
      try {
        await exitChat(chatId, 'left')
      } catch (err) {
        console.error('Failed to exit chat:', err)
      }
    }
    // Navigate based on where we came from
    if (from === 'chats') {
      router.replace('/chats')
    } else if (from === 'moderation') {
      router.replace('/moderation')
    } else {
      router.back()
    }
  }, [chatId, router, chatEnded, from])

  // Cancel leaving
  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false)
  }, [])

  // Send kudos to the other user
  const handleSendKudos = useCallback(async () => {
    try {
      await api.chat.sendKudos(chatId)
      setKudosStatus('sent')
    } catch (err) {
      console.error('Failed to send kudos:', err)
    }
  }, [chatId])

  // Dismiss kudos prompt
  const handleDismissKudos = useCallback(() => {
    setKudosStatus('dismissed')
  }, [])

  const handleSubmitChatReport = useCallback(async (ruleId, comment) => {
    await api.moderation.reportChat(chatId, ruleId, comment)
    setReportModalVisible(false)
  }, [chatId])

  // Toggle special message menu
  const handleToggleSpecialMenu = useCallback(() => {
    setShowSpecialMenu(prev => !prev)
  }, [])

  // Select chat (normal text) message type
  const handleSelectChat = useCallback(() => {
    setMessageType('text')
    setShowSpecialMenu(false)
  }, [])

  // Select propose statement message type
  const handleSelectProposeStatement = useCallback(() => {
    setMessageType('position_proposal')
    setShowSpecialMenu(false)
  }, [])

  // Select propose closure message type
  const handleSelectProposeClosure = useCallback(() => {
    setMessageType('closure_proposal')
    setShowSpecialMenu(false)
  }, [])

  // Handle accepting a proposal
  const handleAcceptProposal = useCallback(async (proposalId) => {
    try {
      await respondToAgreedPosition(chatId, proposalId, 'accept')
    } catch (err) {
      console.error('Failed to accept proposal:', err)
    }
  }, [chatId])

  // Handle rejecting a proposal
  const handleRejectProposal = useCallback(async (proposalId) => {
    try {
      await respondToAgreedPosition(chatId, proposalId, 'reject')
    } catch (err) {
      console.error('Failed to reject proposal:', err)
    }
  }, [chatId])

  // Start modifying a proposal
  const handleStartModify = useCallback((proposal) => {
    setModifyingProposal(proposal)
    setModifyText(proposal.content)
  }, [])

  // Cancel modifying
  const handleCancelModify = useCallback(() => {
    setModifyingProposal(null)
    setModifyText('')
  }, [])

  // Submit modified proposal
  const handleSubmitModify = useCallback(async () => {
    if (!modifyingProposal || !modifyText.trim()) return
    const proposalId = modifyingProposal.proposalId
    const content = modifyText.trim()

    // Close modal immediately for better UX
    setModifyingProposal(null)
    setModifyText('')

    try {
      await respondToAgreedPosition(chatId, proposalId, 'modify', content)
    } catch (err) {
      console.error('Failed to modify proposal:', err)
    }
  }, [chatId, modifyingProposal, modifyText])

  // Render a message bubble
  const renderMessage = useCallback(({ item, index }) => {
    // Handle both snake_case (from join_chat/Redis) and camelCase (from real-time messages)
    // - join_chat returns: sender_id, timestamp (snake_case from Python asdict)
    // - real-time message event: sender, sendTime (manually mapped to camelCase)
    const senderId = String(item.sender_id || item.sender || item.senderId || '')
    const currentUserId = String(user?.id || '')
    // In moderation view, treat first participant as "right" side, second as "left"
    const isOwnMessage = isModerationView && participants
      ? senderId === String(participants[0]?.id || '')
      : senderId === currentUserId

    // In moderation view, determine which participant sent this message
    const moderationSender = isModerationView && participants
      ? participants.find(p => String(p.id) === senderId)
      : null
    // Handle both timestamp formats: sendTime (real-time) and timestamp (from Redis/join_chat)
    const rawTime = item.sendTime || item.timestamp
    const messageTime = rawTime
      ? new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : ''

    // Check if this is a proposal message
    if (item.isProposal) {
      // Check if this proposal has been superseded by a newer one
      const hasBeenSuperseded = messages.some(m => m.isProposal && m.parentId === item.proposalId)

      // If superseded, skip rendering - it will be shown stacked under the latest
      if (hasBeenSuperseded) {
        return null
      }

      // Build the chain of proposals (walk up the parent chain)
      const chain = [item]
      let currentParentId = item.parentId
      while (currentParentId) {
        const parent = messages.find(m => m.isProposal && m.proposalId === currentParentId)
        if (parent) {
          chain.push(parent)
          currentParentId = parent.parentId
        } else {
          break
        }
      }
      // chain is now [newest, ..., oldest]

      const isAccepted = item.type === 'accepted'
      const isRejected = item.type === 'rejected'
      const isPending = item.type === 'proposed'
      const proposalLabel = item.isClosure ? t('proposeClosure') : t('proposeStatement')
      const proposalColor = item.isClosure ? colors.chat : colors.agreeBubble

      // Color for the main (latest) proposal
      const bubbleColor = isAccepted
        ? colors.messageYou
        : (isOwnMessage ? colors.messageYou : colors.agreeBubble)

      // Helper to render a single proposal card
      // skipOffset: when true, offset styles are applied to wrapper instead
      const renderProposalCard = (proposal, isLatest = false, skipOffset = false) => {
        const pSenderId = String(proposal.sender_id || '')
        const pIsOwn = isModerationView && participants
          ? pSenderId === String(participants[0]?.id || '')
          : pSenderId === currentUserId
        const pIsAccepted = proposal.type === 'accepted'
        const pIsRejected = proposal.type === 'rejected'
        const pIsModified = proposal.type === 'modified'
        const pIsPending = proposal.type === 'proposed'
        const pIsInactive = pIsRejected || pIsModified
        const pProposalLabel = proposal.isClosure ? t('proposeClosure') : t('proposeStatement')
        const pProposalColor = proposal.isClosure ? colors.chat : colors.agreeBubble
        const pBubbleColor = pIsAccepted
          ? colors.messageYou
          : (pIsOwn ? colors.messageYou : colors.agreeBubble)

        return (
          <View
            style={[
              styles.proposalCard,
              { backgroundColor: pBubbleColor },
              // Offset inactive proposals toward proposer's side (unless handled by wrapper)
              !skipOffset && pIsInactive && (pIsOwn ? styles.proposalCardOffsetRight : styles.proposalCardOffsetLeft),
            ]}
          >
            {/* White overlay for inactive cards */}
            {pIsInactive && <View style={styles.proposalCardOverlay} />}

            {/* Type badge */}
            <View style={styles.proposalTypeRow}>
              <View style={[styles.proposalTypeBadge, { backgroundColor: pProposalColor }]}>
                <Ionicons
                  name={proposal.isClosure ? 'checkmark-done' : 'document-text'}
                  size={12}
                  color="#fff"
                />
                <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>{pProposalLabel}</ThemedText>
              </View>
              {pIsAccepted && (
                <View style={styles.proposalStatusInline}>
                  <MaterialCommunityIcons name="handshake-outline" size={14} color="#fff" />
                </View>
              )}
              {pIsRejected && (
                <View style={styles.proposalStatusInline}>
                  <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.7)" />
                </View>
              )}
              {pIsModified && (
                <View style={styles.proposalStatusInline}>
                  <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.7)" />
                </View>
              )}
            </View>

            {/* Content */}
            <ThemedText variant="body" color="inverse" style={[
              styles.proposalCardContent,
              pIsInactive && styles.proposalCardContentInactive,
            ]}>
              {proposal.content}
            </ThemedText>

            {/* Closure warning - only on latest pending */}
            {isLatest && proposal.isClosure && pIsPending && (
              <ThemedText variant="caption" color="inverse" style={styles.closureWarningText}>
                {t('acceptEndsChatWarning')}
              </ThemedText>
            )}

            {/* Action buttons for pending proposals from other user - only on latest */}
            {isLatest && pIsPending && !pIsOwn && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={styles.proposalCardButton}
                  onPress={() => handleRejectProposal(proposal.proposalId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rejectProposalA11y')}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.proposalCardButton}
                  onPress={() => handleStartModify(proposal)}
                  accessibilityRole="button"
                  accessibilityLabel={t('modifyProposalA11y')}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.proposalCardButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleAcceptProposal(proposal.proposalId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('acceptProposalA11y')}
                >
                  <Ionicons name="checkmark" size={16} color={SemanticColors.agree} />
                </TouchableOpacity>
              </View>
            )}
            {isLatest && pIsPending && pIsOwn && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {proposal.isClosure ? t('waitingForResponseClosure') : t('waitingForResponse')}
              </ThemedText>
            )}

            {/* Both user avatars for accepted proposals - only on latest */}
            {isLatest && pIsAccepted && (
              <View style={styles.proposalAvatarsRow}>
                <View style={styles.proposalAvatarLeft}>
                  <Avatar user={isModerationView && participants ? participants[1] : otherUser} size={28} showKudosBadge={false} borderStyle={styles.proposalAvatarBorder} />
                  <Ionicons name="checkmark-circle" size={14} color={SemanticColors.agree} style={styles.proposalAvatarCheck} />
                </View>
                <View style={styles.proposalAvatarRight}>
                  <Avatar user={isModerationView && participants ? participants[0] : user} size={28} showKudosBadge={false} borderStyle={styles.proposalAvatarBorder} />
                  <Ionicons name="checkmark-circle" size={14} color={SemanticColors.agree} style={styles.proposalAvatarCheck} />
                </View>
              </View>
            )}
          </View>
        )
      }

      // Render oldest to newest (chain is [newest, ..., oldest], so reverse it)
      const orderedChain = [...chain].reverse()
      const numPreviousCards = orderedChain.length - 1
      const stackId = item.proposalId // Use the latest proposal's ID as the stack identifier
      const isExpanded = expandedProposalStack === stackId
      const hasMultipleCards = orderedChain.length > 1
      const stackOffset = isExpanded ? 85 : 12 // Expanded shows full cards, collapsed shows 12px peek

      // Toggle expansion with animation
      const handleStackPress = () => {
        if (!hasMultipleCards) return
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        setExpandedProposalStack(isExpanded ? null : stackId)
      }

      // Calculate top positions based on measured heights
      const expandedGap = 8
      const collapsedPeek = 12
      const calculateTop = (idx) => {
        if (idx === 0) return 0
        let top = 0
        for (let i = 0; i < idx; i++) {
          const h = proposalHeights[orderedChain[i].proposalId] || 100 // fallback height
          if (isExpanded) {
            top += h + expandedGap
          } else {
            top += collapsedPeek
          }
        }
        return top
      }

      // Calculate total height for paddingTop (container needs space for absolute cards)
      const calculatePaddingTop = () => {
        let total = 0
        for (let i = 0; i < numPreviousCards; i++) {
          const h = proposalHeights[orderedChain[i].proposalId] || 100
          if (isExpanded) {
            total += h + expandedGap
          } else {
            total += collapsedPeek
          }
        }
        return total
      }

      // Handle measuring card height
      const handleCardLayout = (proposalId, event) => {
        const { height } = event.nativeEvent.layout
        setProposalHeights(prev => {
          if (prev[proposalId] === height) return prev
          return { ...prev, [proposalId]: height }
        })
      }

      return (
        <Pressable
          onPress={handleStackPress}
          style={[styles.proposalStackContainer, { paddingTop: calculatePaddingTop() }]}
          disabled={!hasMultipleCards}
        >
          {orderedChain.map((proposal, idx) => {
            const isLatest = idx === orderedChain.length - 1
            const zIndex = idx + 1

            const pSenderId = String(proposal.sender_id || '')
            const pIsOwn = isModerationView && participants
              ? pSenderId === String(participants[0]?.id || '')
              : pSenderId === currentUserId
            const pIsRejected = proposal.type === 'rejected'
            const pIsModified = proposal.type === 'modified'
            const pIsInactive = pIsRejected || pIsModified
            // Only apply horizontal offset if there are multiple cards in the stack
            const horizontalOffset = (hasMultipleCards && pIsInactive) ? (pIsOwn ? proposalOffset : -proposalOffset) : 0

            if (isLatest) {
              return (
                <View
                  key={proposal.proposalId}
                  style={[styles.proposalLatestCardRow, { zIndex }]}
                  onLayout={(e) => handleCardLayout(proposal.proposalId, e)}
                >
                  <View style={{ width: proposalCardWidth, transform: [{ translateX: horizontalOffset }] }}>
                    {renderProposalCard(proposal, isLatest)}
                    {hasMultipleCards && (
                      <View style={styles.stackExpandIndicator}>
                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="rgba(255,255,255,0.7)" />
                        <ThemedText variant="caption" style={styles.stackExpandText}>{isExpanded ? t('collapseProposals') : t('moreProposals', { count: numPreviousCards })}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              )
            } else {
              return (
                <View
                  key={proposal.proposalId}
                  style={[
                    styles.proposalStackedAbsolute,
                    { top: calculateTop(idx), zIndex },
                  ]}
                  onLayout={(e) => handleCardLayout(proposal.proposalId, e)}
                >
                  <View style={{ width: proposalCardWidth, transform: [{ translateX: horizontalOffset }] }}>
                    {renderProposalCard(proposal, isLatest, true)}
                  </View>
                </View>
              )
            }
          })}
        </Pressable>
      )
    }

    if (isOwnMessage) {
      // Check if this is the last message the other user has read
      const isLastRead = item.id === otherUserLastRead

      // In moderation view, check if this is the first message in a group from this sender
      const isVisible = (msg) => !msg.isProposal || !messages.some(m => m.isProposal && m.parentId === msg.proposalId)
      let prevMessage = null
      for (let i = index - 1; i >= 0; i--) {
        if (isVisible(messages[i])) { prevMessage = messages[i]; break }
      }
      const prevSenderId = prevMessage ? String(prevMessage.sender_id || prevMessage.sender || prevMessage.senderId || '') : null
      const isFirstInGroup = !prevMessage || prevSenderId !== senderId || prevMessage.isProposal

      return (
        <View style={styles.ownMessageRow}>
          <View style={styles.ownMessageContainer}>
            <View style={[styles.messageBubble, styles.ownMessage]}>
              <ThemedText variant="body" color="inverse" style={styles.messageText}>
                {item.content}
              </ThemedText>
              {messageTime && (
                <ThemedText variant="badge" style={[styles.messageTime, styles.ownMessageTime]}>
                  {messageTime}
                </ThemedText>
              )}
            </View>
            {/* Read indicator - small avatar bubble */}
            {isLastRead && otherUser && (
              <View style={styles.readIndicator}>
                <Avatar user={otherUser} size={16} showKudosBadge={false} borderStyle={styles.readIndicatorBorder} />
              </View>
            )}
          </View>
        </View>
      )
    }

    // Find next/prev visible message (skip superseded proposals that render as null)
    const isVisible = (msg) => !msg.isProposal || !messages.some(m => m.isProposal && m.parentId === msg.proposalId)
    let nextMessage = null
    for (let i = index + 1; i < messages.length; i++) {
      if (isVisible(messages[i])) { nextMessage = messages[i]; break }
    }
    let prevMessage = null
    for (let i = index - 1; i >= 0; i--) {
      if (isVisible(messages[i])) { prevMessage = messages[i]; break }
    }

    // Check if this is the last message in a group from the other user
    // Avatar shows only on the last consecutive message from the other user
    // Proposals (agreed statements, etc.) break the chain since they render as separate cards
    const nextSenderId = nextMessage ? String(nextMessage.sender_id || nextMessage.sender || nextMessage.senderId || '') : null
    const isLastInGroup = !nextMessage || nextSenderId !== senderId || nextMessage.isProposal

    // In moderation view, check if first in group to show name label
    const prevSenderId = prevMessage ? String(prevMessage.sender_id || prevMessage.sender || prevMessage.senderId || '') : null
    const isFirstInGroup = !prevMessage || prevSenderId !== senderId || prevMessage.isProposal

    // Use correct user for avatar: in moderation view, use the sender participant
    const messageUser = isModerationView ? moderationSender : otherUser

    // Other user's message
    return (
      <View style={styles.otherMessageRow}>
        {isLastInGroup ? (
          <Avatar user={messageUser} size={28} showKudosBadge={false} />
        ) : (
          <View style={styles.messageAvatarSpacer} />
        )}
        <View style={styles.otherMessageContainer}>
          <View style={[styles.messageBubble, styles.otherMessage]}>
            <ThemedText variant="body" color="inverse" style={styles.messageText}>
              {item.content}
            </ThemedText>
            {messageTime && (
              <ThemedText variant="badge" style={[styles.messageTime, styles.otherMessageTime]}>
                {messageTime}
              </ThemedText>
            )}
          </View>
        </View>
      </View>
    )
  }, [user, otherUser, otherUserLastRead, messages, chatEnded, expandedProposalStack, proposalHeights, proposalCardWidth, proposalOffset, handleAcceptProposal, handleRejectProposal, handleStartModify, isModerationView, participants])

  // Leave confirmation modal
  const renderLeaveConfirmModal = () => (
    <Modal
      visible={showLeaveConfirm}
      transparent
      animationType="fade"
      onRequestClose={handleCancelLeave}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleCancelLeave}
        accessibilityRole="button"
        accessibilityLabel={t('leaveChatTitle')}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
          <ThemedText variant="h4" color="primary" style={styles.modalTitle}>{t('leaveChatTitle')}</ThemedText>
          <ThemedText variant="body" style={styles.modalMessage}>
            {t('leaveChatMessage')}
          </ThemedText>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelLeave}
              accessibilityRole="button"
              accessibilityLabel={t('stay')}
            >
              <ThemedText variant="button" color="primary" style={styles.modalCancelText}>{t('stay')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={handleConfirmLeave}
              accessibilityRole="button"
              accessibilityLabel={t('leave')}
            >
              <ThemedText variant="button" color="inverse">{t('leave')}</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )

  // Modify proposal modal
  const renderModifyModal = () => (
    <Modal
      visible={!!modifyingProposal}
      transparent
      animationType="fade"
      onRequestClose={handleCancelModify}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleCancelModify}
        accessibilityRole="button"
        accessibilityLabel={t('modifyProposal')}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modifyModalCard}>
          <View style={styles.modifyModalHeader}>
            <View style={[styles.proposalTypeBadge, { backgroundColor: modifyingProposal?.isClosure ? colors.chat : colors.agreeBubble }]}>
              <Ionicons
                name={modifyingProposal?.isClosure ? 'checkmark-done' : 'document-text'}
                size={12}
                color="#fff"
              />
              <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>
                {modifyingProposal?.isClosure ? t('proposeClosure') : t('proposeStatement')}
              </ThemedText>
            </View>
            <ThemedText variant="h2" color="primary" style={styles.modifyModalTitle}>{t('modifyProposal')}</ThemedText>
          </View>
          <TextInput
            style={styles.modifyInput}
            value={modifyText}
            onChangeText={setModifyText}
            placeholder={t('placeholderModify')}
            placeholderTextColor={colors.placeholderText}
            multiline
            autoFocus
            maxFontSizeMultiplier={1.5}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelModify}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <ThemedText variant="button" color="primary" style={styles.modalCancelText}>{t('cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modifySubmitButton, !modifyText.trim() && styles.modifySubmitButtonDisabled]}
              onPress={handleSubmitModify}
              disabled={!modifyText.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('send')}
            >
              <ThemedText variant="button" color="inverse">{t('send')}</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {from === 'chats' || from === 'moderation' ? (
          <Header onBack={handleBackPress} />
        ) : (
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('backA11y')}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </TouchableOpacity>
            <ThemedText variant="h2" color="primary" style={styles.headerTitle}>{t('chat')}</ThemedText>
            <View style={styles.headerRight} />
          </View>
        )}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="button" style={styles.loadingText}>{from === 'chats' || from === 'moderation' ? t('loadingChat') : t('joiningChat')}</ThemedText>
        </View>
        {renderLeaveConfirmModal()}
      </SafeAreaView>
    )
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {from === 'chats' || from === 'moderation' ? (
          <Header onBack={() => router.back()} />
        ) : (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('backA11y')}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </TouchableOpacity>
            <ThemedText variant="h2" color="primary" style={styles.headerTitle}>{t('chat')}</ThemedText>
            <View style={styles.headerRight} />
          </View>
        )}
        <View style={styles.centerContent}>
          <ThemedText variant="button" color="error" style={styles.errorText}>{error}</ThemedText>
          <Pressable
            style={styles.retryButton}
            onPress={() => router.back()}
            onPressIn={Platform.OS === 'web' ? () => router.back() : undefined}
            role="button"
          >
            <ThemedText variant="button" color="inverse">{t('goBack')}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      {isHistoricalView ? (
        <Header onBack={handleBackPress} />
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('backA11y')}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {otherUser ? (
              <View style={styles.headerUserInfo}>
                <Avatar user={otherUser} size="md" showKudosCount badgePosition="bottom-left" />
                <View style={styles.headerUserText}>
                  <ThemedText variant="h3" color="primary" numberOfLines={1}>{otherUser.displayName}</ThemedText>
                  <ThemedText variant="caption" style={styles.headerUsername} numberOfLines={1}>@{otherUser.username}</ThemedText>
                </View>
              </View>
            ) : (
              <ThemedText variant="h2" color="primary" numberOfLines={1}>{t('chat')}</ThemedText>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.headerKudosBadge, { backgroundColor: getTrustBadgeColor(user?.trustScore) }]}>
              <Ionicons name="star" size={14} color={colors.primary} />
              <ThemedText variant="badgeLg" color="primary">{user?.kudosCount || 0}</ThemedText>
            </View>
            <Avatar user={user} size={32} showKudosBadge={false} />
          </View>
        </View>
      )}

      {/* Chat ended banner */}
      {chatEnded && (
        <View style={[styles.endedBanner, isModerationView ? styles.endedBannerModeration : (chatEndedWithClosure || isHistoricalView) && styles.endedBannerClosure]}>
          <Ionicons
            name={isModerationView ? 'shield' : isHistoricalView ? 'time' : (chatEndedWithClosure ? 'checkmark-circle' : (otherUserLeft ? 'exit-outline' : 'information-circle'))}
            size={18}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <ThemedText variant="bodySmall" color="inverse" style={styles.endedText}>
            {isModerationView
              ? t('moderationReview')
              : isHistoricalView
              ? t('viewingHistorical')
              : chatEndedWithClosure
                ? t('endedMutualAgreement')
                : otherUserLeft
                  ? t('otherUserLeft', { name: otherUser?.displayName || t('theOtherUser') })
                  : t('chatEnded')}
          </ThemedText>
          {!isModerationView && (isHistoricalView || chatEnded) && (
            <TouchableOpacity
              onPress={() => setReportModalVisible(true)}
              style={styles.reportButton}
              accessibilityRole="button"
              accessibilityLabel={t('reportChatA11y')}
            >
              <Ionicons name="flag-outline" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Participants card for moderation view */}
      {isModerationView && participants && (
        <View style={styles.moderationParticipants}>
          <View style={styles.moderationParticipantCard}>
            <Avatar user={participants[1]} size="md" showKudosCount badgePosition="bottom-left" />
            <View style={styles.moderationParticipantInfo}>
              <ThemedText variant="buttonSmall" style={styles.moderationParticipantName}>{participants[1]?.displayName}</ThemedText>
              <ThemedText variant="caption" style={styles.moderationParticipantUsername}>@{participants[1]?.username}</ThemedText>
            </View>
            <View style={[styles.moderationParticipantDot, { backgroundColor: SemanticColors.agree }]} />
          </View>
          <Ionicons name="chatbubbles-outline" size={20} color={colors.secondaryText} />
          <View style={styles.moderationParticipantCard}>
            <View style={[styles.moderationParticipantDot, { backgroundColor: colors.messageYou }]} />
            <View style={styles.moderationParticipantInfo}>
              <ThemedText variant="buttonSmall" style={styles.moderationParticipantName}>{participants[0]?.displayName}</ThemedText>
              <ThemedText variant="caption" style={styles.moderationParticipantUsername}>@{participants[0]?.username}</ThemedText>
            </View>
            <Avatar user={participants[0]} size="md" showKudosCount badgePosition="bottom-left" />
          </View>
        </View>
      )}

      {/* Kudos prompt - only show after mutual agreement, not for historical views */}
      {chatEndedWithClosure && !isHistoricalView && kudosStatus === null && (
        <View style={styles.kudosPrompt}>
          <ThemedText variant="body" style={styles.kudosPromptText}>
            {t('kudosPrompt', { name: otherUser?.displayName || t('theOtherUserLower') })}
          </ThemedText>
          <View style={styles.kudosButtonsRow}>
            <TouchableOpacity
              style={styles.kudosDismissButton}
              onPress={handleDismissKudos}
              accessibilityRole="button"
              accessibilityLabel={t('dismissKudosA11y')}
            >
              <ThemedText variant="buttonSmall" style={styles.kudosDismissText}>{t('noThanks')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.kudosSendButton}
              onPress={handleSendKudos}
              accessibilityRole="button"
              accessibilityLabel={t('sendKudosA11y')}
            >
              <Ionicons name="star" size={16} color="#fff" style={{ marginRight: 6 }} />
              <ThemedText variant="buttonSmall" style={styles.kudosSendText}>{t('sendKudos')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Kudos sent confirmation */}
      {chatEndedWithClosure && !isHistoricalView && kudosStatus === 'sent' && (
        <View style={styles.kudosSentBanner}>
          <Ionicons name="star" size={18} color="#FFD700" style={{ marginRight: 8 }} />
          <ThemedText variant="bodySmall" style={styles.kudosSentText}>{t('kudosSentTo', { name: otherUser?.displayName || t('theOtherUserLower') })}</ThemedText>
        </View>
      )}

      {/* Messages list */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior="padding"
        keyboardVerticalOffset={keyboardOffset}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => item.id || `msg-${index}`}
          contentContainerStyle={styles.messagesList}
          inverted={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={
            chatInfo?.position ? (
              <PositionInfoCard
                position={chatInfo.position}
                label={t('topicOfDiscussion')}
                authorSubtitle="username"
                style={styles.topicCard}
                statementStyle={styles.topicStatement}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.secondaryText} />
              <ThemedText variant="button" style={styles.emptyChatText}>
                {t('startConversation')}
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            otherUserTyping ? (
              <View style={styles.typingRow}>
                <Avatar user={otherUser} size={28} showKudosBadge={false} />
                <View style={styles.typingBubble}>
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                </View>
              </View>
            ) : isHistoricalView && chatInfo?.endType === 'user_exit' ? (
              <View style={styles.chatEndedRow}>
                <ThemedText variant="bodySmall" style={styles.chatEndedText}>
                  {chatInfo?.endedByUserId === user?.id
                    ? t('youLeftChat')
                    : t('otherLeftChat', { name: otherUser?.displayName || t('theOtherUser') })}
                </ThemedText>
              </View>
            ) : null
          }
        />

        {/* Input area */}
        {!chatEnded && (
          <View style={styles.inputContainer}>
            {/* Special message menu button */}
            <TouchableOpacity
              style={[styles.specialMenuButton, showSpecialMenu && styles.specialMenuButtonActive]}
              onPress={handleToggleSpecialMenu}
              accessibilityRole="button"
              accessibilityLabel={t('messageMenuA11y')}
            >
              <Ionicons
                name={showSpecialMenu ? 'close' : 'add'}
                size={24}
                color={showSpecialMenu ? '#FFFFFF' : colors.primary}
              />
            </TouchableOpacity>

            {/* Special menu popup with backdrop */}
            {showSpecialMenu && (
              <>
                <Pressable
                  style={styles.specialMenuBackdrop}
                  onPress={() => setShowSpecialMenu(false)}
                />
                <View style={styles.specialMenuPopup}>
                  <TouchableOpacity
                    style={[styles.specialMenuItem, messageType === 'text' && styles.specialMenuItemSelected]}
                    onPress={handleSelectChat}
                    accessibilityRole="menuitem"
                    accessibilityLabel={t('menuChat')}
                    accessibilityState={{ selected: messageType === 'text' }}
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: colors.primary }]}>
                      <Ionicons name="chatbubble" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <ThemedText variant="body" style={styles.specialMenuItemTitle}>{t('menuChat')}</ThemedText>
                      <ThemedText variant="caption" style={styles.specialMenuItemDesc}>{t('menuChatDesc')}</ThemedText>
                    </View>
                    {messageType === 'text' && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.specialMenuItem, messageType === 'position_proposal' && styles.specialMenuItemSelected]}
                    onPress={handleSelectProposeStatement}
                    accessibilityRole="menuitem"
                    accessibilityLabel={t('menuProposeStatement')}
                    accessibilityState={{ selected: messageType === 'position_proposal' }}
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: colors.agreeBubble }]}>
                      <Ionicons name="document-text" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <ThemedText variant="body" style={styles.specialMenuItemTitle}>{t('menuProposeStatement')}</ThemedText>
                      <ThemedText variant="caption" style={styles.specialMenuItemDesc}>{t('menuProposeStatementDesc')}</ThemedText>
                    </View>
                    {messageType === 'position_proposal' && (
                      <Ionicons name="checkmark-circle" size={24} color={SemanticColors.agree} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.specialMenuItem, messageType === 'closure_proposal' && styles.specialMenuItemSelected]}
                    onPress={handleSelectProposeClosure}
                    accessibilityRole="menuitem"
                    accessibilityLabel={t('menuProposeClosure')}
                    accessibilityState={{ selected: messageType === 'closure_proposal' }}
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: colors.chat }]}>
                      <Ionicons name="checkmark-done" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <ThemedText variant="body" style={styles.specialMenuItemTitle}>{t('menuProposeClosure')}</ThemedText>
                      <ThemedText variant="caption" style={styles.specialMenuItemDesc}>{t('menuProposeClosureDesc')}</ThemedText>
                    </View>
                    {messageType === 'closure_proposal' && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.chat} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TextInput
              style={[styles.input, { height: inputHeight, maxHeight: maxInputHeight }]}
              value={inputText}
              onChangeText={handleTextChange}
              onContentSizeChange={handleContentSizeChange}
              placeholder={
                messageType === 'position_proposal' ? t('placeholderProposal') :
                messageType === 'closure_proposal' ? t('placeholderClosure') :
                t('placeholderMessage')
              }
              placeholderTextColor={colors.placeholderText}
              multiline
              maxLength={1000}
              maxFontSizeMultiplier={1.5}
              returnKeyType="send"
              blurOnSubmit={false}
              scrollEnabled={inputHeight >= maxInputHeight}
              onSubmitEditing={Platform.OS !== 'web' ? handleSend : undefined}
              onKeyPress={(e) => {
                // On web: Enter sends, Shift+Enter adds newline
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !inputText.trim() && messageType === 'text' && styles.sendButtonDisabled,
                messageType === 'position_proposal' && (inputText.trim() ? styles.sendButtonStatement : styles.sendButtonStatementDisabled),
                messageType === 'closure_proposal' && (inputText.trim() ? styles.sendButtonClosure : styles.sendButtonClosureDisabled),
              ]}
              onPress={handleSend}
              disabled={!inputText.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('sendMessageA11y')}
            >
              <Ionicons
                name={
                  messageType === 'position_proposal' ? 'document-text' :
                  messageType === 'closure_proposal' ? 'checkmark-done' :
                  'send'
                }
                size={20}
                color={inputText.trim() ? '#FFFFFF' : colors.pass}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {renderLeaveConfirmModal()}
      {renderModifyModal()}

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleSubmitChatReport}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.navBackground,
    ...Shadows.card,
    zIndex: 10,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    }),
  },
  headerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerUserText: {
    flex: 1,
  },
  headerDisplayName: {},
  headerUsername: {
    color: colors.pass,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerKudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  headerKudosCount: {},
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {},
  headerSubtitle: {
    fontSize: 12,
    color: colors.pass,
    marginTop: 2,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  ownMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  ownMessageContainer: {
    position: 'relative',
    maxWidth: '75%',
  },
  readIndicator: {
    position: 'absolute',
    bottom: -4,
    left: -8,
  },
  readIndicatorBorder: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  otherMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  otherMessageContainer: {
    flexShrink: 1,
    maxWidth: '75%',
  },
  messageAvatarSpacer: {
    width: 28,
    height: 28,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  ownMessage: {
    backgroundColor: colors.messageYou,
    borderBottomRightRadius: 4,
    maxWidth: '100%', // Override messageBubble maxWidth since container handles it
  },
  otherMessage: {
    backgroundColor: colors.agreeBubble,
    borderBottomLeftRadius: 4,
    maxWidth: '100%', // Container handles width constraint
  },
  messageText: {
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.agreeBubble,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  chatEndedRow: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  chatEndedText: {
    fontStyle: 'italic',
    color: colors.pass,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.navBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
    }),
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    minHeight: 40,
    color: colors.text,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
  sendButtonStatement: {
    backgroundColor: colors.agreeBubble,
  },
  sendButtonStatementDisabled: {
    backgroundColor: colors.agreeBubble + '40', // Light green (40% opacity)
  },
  sendButtonClosure: {
    backgroundColor: colors.chat,
  },
  sendButtonClosureDisabled: {
    backgroundColor: colors.chat + '40', // Light yellow (40% opacity)
  },
  specialMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  specialMenuButtonActive: {
    backgroundColor: colors.primarySurface,
  },
  specialMenuBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  specialMenuPopup: {
    position: 'absolute',
    bottom: 56,
    left: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    zIndex: 2,
    padding: 8,
    ...Shadows.elevated,
    minWidth: 260,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
    }),
  },
  specialMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  specialMenuItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  specialMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialMenuItemText: {
    flex: 1,
  },
  specialMenuItemTitle: {
    fontWeight: '600',
    color: colors.darkText,
  },
  specialMenuItemDesc: {
    color: colors.pass,
    marginTop: 2,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    color: colors.pass,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    marginTop: 12,
    color: colors.pass,
  },
  endedBanner: {
    backgroundColor: colors.pass,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedBannerClosure: {
    backgroundColor: colors.agreeBubble,
  },
  endedBannerModeration: {
    backgroundColor: colors.warningBubble,
  },
  endedText: {
    flex: 1,
    fontWeight: '500',
  },
  reportButton: {
    padding: 6,
    marginLeft: 8,
  },
  kudosPrompt: {
    backgroundColor: colors.cardBackground,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  kudosPromptText: {
    marginBottom: 12,
    textAlign: 'center',
  },
  kudosButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kudosDismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: colors.background,
  },
  kudosDismissText: {
    color: colors.pass,
    fontWeight: '500',
  },
  kudosSendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#FFD700',
  },
  kudosSendText: {
    color: colors.darkText,
  },
  kudosSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  kudosSentText: {
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: SemanticColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...Shadows.elevated,
  },
  modalTitle: {
    marginBottom: 12,
  },
  modalMessage: {
    color: colors.pass,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    width: '100%',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  modalCancelText: {},
  modalConfirmButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: SemanticColors.disagree,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topicCard: {
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...Shadows.card,
  },
  topicStatement: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26,
  },
  // Proposal styles - stacked card layout
  proposalStackContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
  },
  proposalStackedAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  proposalLatestCardRow: {
    width: '100%',
    alignItems: 'center',
  },
  stackExpandIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  stackExpandText: {
    color: 'rgba(255,255,255,0.7)',
  },
  proposalCardContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  proposalCardOffsetLeft: {
    alignSelf: 'flex-start',
    marginLeft: -40,
  },
  proposalCardOffsetRight: {
    alignSelf: 'flex-end',
    marginRight: -40,
  },
  proposalCard: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    ...Shadows.card,
    overflow: 'hidden',
    position: 'relative',
  },
  proposalCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 16,
    zIndex: 10,
  },
  proposalTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  proposalTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  proposalTypeBadgeText: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
  proposalStatusInline: {
    marginLeft: 'auto',
  },
  proposalCardContent: {
    textAlign: 'center',
  },
  proposalCardContentInactive: {
    textDecorationLine: 'line-through',
    opacity: 0.8,
  },
  proposalCardActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  proposalCardButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalCardButtonAccept: {
    backgroundColor: '#FFFFFF',
  },
  closureWarningText: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.85,
  },
  proposalCardWaiting: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // Both user avatars for accepted proposals
  proposalAvatarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  proposalAvatarLeft: {
    position: 'relative',
  },
  proposalAvatarRight: {
    position: 'relative',
  },
  proposalAvatarBorder: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  proposalAvatarCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  // Modify modal styles
  modifyModalCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    ...Shadows.elevated,
  },
  modifyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  modifyModalTitle: {},
  modifyInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modifySubmitButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: colors.agreeBubble,
    alignItems: 'center',
  },
  modifySubmitButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
  modifySubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Moderation view styles
  moderationParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  moderationParticipantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  moderationParticipantInfo: {
    flex: 1,
  },
  moderationParticipantName: {},
  moderationParticipantUsername: {
    color: colors.pass,
  },
  moderationParticipantDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  moderationSenderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.pass,
    textAlign: 'right',
    marginBottom: 2,
  },
  moderationSenderLabelOther: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.pass,
    marginBottom: 2,
    marginLeft: 2,
  },
})

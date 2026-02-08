import {
  StyleSheet,
  View,
  Text,
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
import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Colors } from '../../../constants/Colors'
import { Shadows } from '../../../constants/Theme'
import { UserContext } from '../../../contexts/UserContext'
import Header from '../../../components/Header'
import api from '../../../lib/api'
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
import PositionInfoCard from '../../../components/PositionInfoCard'
import ReportModal from '../../../components/ReportModal'

export default function ChatScreen() {
  const { id: chatId, from, reporterId } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useContext(UserContext)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()

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
            setError(err.message || 'Failed to load chat history')
            setLoading(false)
            return
          }
        }

        // For active chats, use WebSocket
        // Check socket connection
        if (!isConnected()) {
          setError('Not connected to chat server. Please try again.')
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
        setError(err.message || 'Failed to join chat')
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
      const proposalLabel = item.isClosure ? 'Closure' : 'Statement'
      const proposalColor = item.isClosure ? Colors.chat : Colors.agree

      // Color for the main (latest) proposal
      const bubbleColor = isAccepted
        ? Colors.messageYou
        : (isOwnMessage ? Colors.messageYou : Colors.agree)

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
        const pProposalLabel = proposal.isClosure ? 'Closure' : 'Statement'
        const pProposalColor = proposal.isClosure ? Colors.chat : Colors.agree
        const pBubbleColor = pIsAccepted
          ? Colors.messageYou
          : (pIsOwn ? Colors.messageYou : Colors.agree)

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
                <Text style={styles.proposalTypeBadgeText}>{pProposalLabel}</Text>
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
            <Text style={[
              styles.proposalCardContent,
              pIsInactive && styles.proposalCardContentInactive,
            ]}>
              {proposal.content}
            </Text>

            {/* Closure warning - only on latest pending */}
            {isLatest && proposal.isClosure && pIsPending && (
              <Text style={styles.closureWarningText}>
                Accepting will end this chat
              </Text>
            )}

            {/* Action buttons for pending proposals from other user - only on latest */}
            {isLatest && pIsPending && !pIsOwn && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={styles.proposalCardButton}
                  onPress={() => handleRejectProposal(proposal.proposalId)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.proposalCardButton}
                  onPress={() => handleStartModify(proposal)}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.proposalCardButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleAcceptProposal(proposal.proposalId)}
                >
                  <Ionicons name="checkmark" size={16} color={Colors.agree} />
                </TouchableOpacity>
              </View>
            )}
            {isLatest && pIsPending && pIsOwn && (
              <Text style={styles.proposalCardWaiting}>
                {proposal.isClosure ? 'Waiting for response to end chat...' : 'Waiting...'}
              </Text>
            )}

            {/* Both user avatars for accepted proposals - only on latest */}
            {isLatest && pIsAccepted && (
              <View style={styles.proposalAvatarsRow}>
                <View style={styles.proposalAvatarLeft}>
                  <Avatar user={isModerationView && participants ? participants[1] : otherUser} size={28} showKudosBadge={false} borderStyle={styles.proposalAvatarBorder} />
                  <Ionicons name="checkmark-circle" size={14} color={Colors.agree} style={styles.proposalAvatarCheck} />
                </View>
                <View style={styles.proposalAvatarRight}>
                  <Avatar user={isModerationView && participants ? participants[0] : user} size={28} showKudosBadge={false} borderStyle={styles.proposalAvatarBorder} />
                  <Ionicons name="checkmark-circle" size={14} color={Colors.agree} style={styles.proposalAvatarCheck} />
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
                        <Text style={styles.stackExpandText}>{isExpanded ? 'collapse' : `${numPreviousCards} more`}</Text>
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
      const prevMessage = index > 0 ? messages[index - 1] : null
      const prevSenderId = prevMessage ? String(prevMessage.sender_id || prevMessage.sender || prevMessage.senderId || '') : null
      const isFirstInGroup = !prevMessage || prevSenderId !== senderId

      return (
        <View style={styles.ownMessageRow}>
          <View style={styles.ownMessageContainer}>
            <View style={[styles.messageBubble, styles.ownMessage]}>
              <Text style={[styles.messageText, styles.ownMessageText]}>
                {item.content}
              </Text>
              {messageTime && (
                <Text style={[styles.messageTime, styles.ownMessageTime]}>
                  {messageTime}
                </Text>
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

    // Check if this is the last message in a group from the other user
    // Avatar shows only on the last consecutive message from the other user
    const nextMessage = messages[index + 1]
    const nextSenderId = nextMessage ? String(nextMessage.sender_id || nextMessage.sender || nextMessage.senderId || '') : null
    const isLastInGroup = !nextMessage || nextSenderId !== senderId

    // In moderation view, check if first in group to show name label
    const prevMessage = index > 0 ? messages[index - 1] : null
    const prevSenderId = prevMessage ? String(prevMessage.sender_id || prevMessage.sender || prevMessage.senderId || '') : null
    const isFirstInGroup = !prevMessage || prevSenderId !== senderId

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
        <View>
          <View style={[styles.messageBubble, styles.otherMessage]}>
            <Text style={[styles.messageText, styles.otherMessageText]}>
              {item.content}
            </Text>
            {messageTime && (
              <Text style={[styles.messageTime, styles.otherMessageTime]}>
                {messageTime}
              </Text>
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
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
          <Text style={styles.modalTitle}>Leave Chat?</Text>
          <Text style={styles.modalMessage}>
            Are you sure you want to leave this conversation? You can return to it later from your chat history.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelLeave}
            >
              <Text style={styles.modalCancelText}>Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={handleConfirmLeave}
            >
              <Text style={styles.modalConfirmText}>Leave</Text>
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
      >
        <TouchableOpacity activeOpacity={1} style={styles.modifyModalCard}>
          <View style={styles.modifyModalHeader}>
            <View style={[styles.proposalTypeBadge, { backgroundColor: modifyingProposal?.isClosure ? Colors.chat : Colors.agree }]}>
              <Ionicons
                name={modifyingProposal?.isClosure ? 'checkmark-done' : 'document-text'}
                size={12}
                color="#fff"
              />
              <Text style={styles.proposalTypeBadgeText}>
                {modifyingProposal?.isClosure ? 'Closure' : 'Statement'}
              </Text>
            </View>
            <Text style={styles.modifyModalTitle}>Modify Proposal</Text>
          </View>
          <TextInput
            style={styles.modifyInput}
            value={modifyText}
            onChangeText={setModifyText}
            placeholder="Edit the proposal..."
            placeholderTextColor={Colors.pass}
            multiline
            autoFocus
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelModify}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modifySubmitButton, !modifyText.trim() && styles.modifySubmitButtonDisabled]}
              onPress={handleSubmitModify}
              disabled={!modifyText.trim()}
            >
              <Text style={styles.modifySubmitText}>Send</Text>
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
            <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chat</Text>
            <View style={styles.headerRight} />
          </View>
        )}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{from === 'chats' || from === 'moderation' ? 'Loading chat log...' : 'Joining chat...'}</Text>
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chat</Text>
            <View style={styles.headerRight} />
          </View>
        )}
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => router.back()}
            onPressIn={Platform.OS === 'web' ? () => router.back() : undefined}
            role="button"
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
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
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {otherUser ? (
              <View style={styles.headerUserInfo}>
                <Avatar user={otherUser} size="md" showKudosCount badgePosition="bottom-left" />
                <View style={styles.headerUserText}>
                  <Text style={styles.headerDisplayName} numberOfLines={1}>{otherUser.displayName}</Text>
                  <Text style={styles.headerUsername} numberOfLines={1}>@{otherUser.username}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.headerTitle} numberOfLines={1}>Chat</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.headerKudosBadge, { backgroundColor: getTrustBadgeColor(user?.trustScore) }]}>
              <Ionicons name="star" size={14} color={Colors.primary} />
              <Text style={styles.headerKudosCount}>{user?.kudosCount || 0}</Text>
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
          <Text style={styles.endedText}>
            {isModerationView
              ? 'Moderation review — chat log'
              : isHistoricalView
              ? 'Viewing historical chat log'
              : chatEndedWithClosure
                ? 'Chat ended with mutual agreement'
                : otherUserLeft
                  ? `${otherUser?.displayName || 'The other user'} has left the chat`
                  : 'This chat has ended'}
          </Text>
          {!isModerationView && (isHistoricalView || chatEnded) && (
            <TouchableOpacity
              onPress={() => setReportModalVisible(true)}
              style={styles.reportButton}
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
              <Text style={styles.moderationParticipantName}>{participants[1]?.displayName}</Text>
              <Text style={styles.moderationParticipantUsername}>@{participants[1]?.username}</Text>
            </View>
            <View style={[styles.moderationParticipantDot, { backgroundColor: Colors.agree }]} />
          </View>
          <Ionicons name="chatbubbles-outline" size={20} color={Colors.pass} />
          <View style={styles.moderationParticipantCard}>
            <View style={[styles.moderationParticipantDot, { backgroundColor: Colors.messageYou }]} />
            <View style={styles.moderationParticipantInfo}>
              <Text style={styles.moderationParticipantName}>{participants[0]?.displayName}</Text>
              <Text style={styles.moderationParticipantUsername}>@{participants[0]?.username}</Text>
            </View>
            <Avatar user={participants[0]} size="md" showKudosCount badgePosition="bottom-left" />
          </View>
        </View>
      )}

      {/* Kudos prompt - only show after mutual agreement, not for historical views */}
      {chatEndedWithClosure && !isHistoricalView && kudosStatus === null && (
        <View style={styles.kudosPrompt}>
          <Text style={styles.kudosPromptText}>
            Would you like to send kudos to {otherUser?.displayName || 'the other user'}?
          </Text>
          <View style={styles.kudosButtonsRow}>
            <TouchableOpacity
              style={styles.kudosDismissButton}
              onPress={handleDismissKudos}
            >
              <Text style={styles.kudosDismissText}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.kudosSendButton}
              onPress={handleSendKudos}
            >
              <Ionicons name="star" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.kudosSendText}>Send Kudos</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Kudos sent confirmation */}
      {chatEndedWithClosure && !isHistoricalView && kudosStatus === 'sent' && (
        <View style={styles.kudosSentBanner}>
          <Ionicons name="star" size={18} color="#FFD700" style={{ marginRight: 8 }} />
          <Text style={styles.kudosSentText}>Kudos sent to {otherUser?.displayName || 'the other user'}!</Text>
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
                label="Topic of Discussion"
                authorSubtitle="username"
                style={styles.topicCard}
                statementStyle={styles.topicStatement}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.pass} />
              <Text style={styles.emptyChatText}>
                Start the conversation!
              </Text>
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
                <Text style={styles.chatEndedText}>
                  {chatInfo?.endedByUserId === user?.id
                    ? 'You left the chat'
                    : `${otherUser?.displayName || 'The other user'} left the chat`}
                </Text>
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
            >
              <Ionicons
                name={showSpecialMenu ? 'close' : 'add'}
                size={24}
                color={showSpecialMenu ? Colors.white : Colors.primary}
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
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: Colors.primary }]}>
                      <Ionicons name="chatbubble" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <Text style={styles.specialMenuItemTitle}>Chat</Text>
                      <Text style={styles.specialMenuItemDesc}>Send a normal message</Text>
                    </View>
                    {messageType === 'text' && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.specialMenuItem, messageType === 'position_proposal' && styles.specialMenuItemSelected]}
                    onPress={handleSelectProposeStatement}
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: Colors.agree }]}>
                      <Ionicons name="document-text" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <Text style={styles.specialMenuItemTitle}>Propose Statement</Text>
                      <Text style={styles.specialMenuItemDesc}>Suggest a statement you both agree on</Text>
                    </View>
                    {messageType === 'position_proposal' && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.agree} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.specialMenuItem, messageType === 'closure_proposal' && styles.specialMenuItemSelected]}
                    onPress={handleSelectProposeClosure}
                  >
                    <View style={[styles.specialMenuIcon, { backgroundColor: Colors.chat }]}>
                      <Ionicons name="checkmark-done" size={20} color="#fff" />
                    </View>
                    <View style={styles.specialMenuItemText}>
                      <Text style={styles.specialMenuItemTitle}>Propose Closure</Text>
                      <Text style={styles.specialMenuItemDesc}>Propose ending this chat amicably</Text>
                    </View>
                    {messageType === 'closure_proposal' && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.chat} />
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
                messageType === 'position_proposal' ? 'Type a statement to propose...' :
                messageType === 'closure_proposal' ? 'Type a closing message...' :
                'Type a message...'
              }
              placeholderTextColor={Colors.pass}
              multiline
              maxLength={1000}
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
            >
              <Ionicons
                name={
                  messageType === 'position_proposal' ? 'document-text' :
                  messageType === 'closure_proposal' ? 'checkmark-done' :
                  'send'
                }
                size={20}
                color={inputText.trim() ? Colors.white : Colors.pass}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.white,
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
  headerDisplayName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerUsername: {
    fontSize: 12,
    color: Colors.pass,
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
  headerKudosCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.pass,
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
    borderColor: Colors.white,
  },
  otherMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
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
    backgroundColor: Colors.messageYou,
    borderBottomRightRadius: 4,
    maxWidth: '100%', // Override messageBubble maxWidth since container handles it
  },
  otherMessage: {
    backgroundColor: Colors.agree,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: Colors.white,
  },
  otherMessageText: {
    color: Colors.white,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: Colors.agree,
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
    backgroundColor: Colors.white,
  },
  chatEndedRow: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  chatEndedText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: Colors.pass,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.light.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    minHeight: 40,
    color: Colors.light.text,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.cardBorder,
  },
  sendButtonStatement: {
    backgroundColor: Colors.agree,
  },
  sendButtonStatementDisabled: {
    backgroundColor: Colors.agree + '40', // Light green (40% opacity)
  },
  sendButtonClosure: {
    backgroundColor: Colors.chat,
  },
  sendButtonClosureDisabled: {
    backgroundColor: Colors.chat + '40', // Light yellow (40% opacity)
  },
  specialMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  specialMenuButtonActive: {
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.primaryLight,
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
    fontSize: 15,
    fontWeight: '600',
    color: Colors.darkText,
  },
  specialMenuItemDesc: {
    fontSize: 12,
    color: Colors.pass,
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
    fontSize: 16,
    color: Colors.pass,
  },
  errorText: {
    fontSize: 16,
    color: Colors.warning,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  retryButtonText: {
    color: Colors.white,
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
    fontSize: 16,
    color: Colors.pass,
  },
  endedBanner: {
    backgroundColor: Colors.pass,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedBannerClosure: {
    backgroundColor: Colors.agree,
  },
  endedBannerModeration: {
    backgroundColor: Colors.warning,
  },
  endedText: {
    flex: 1,
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  reportButton: {
    padding: 6,
    marginLeft: 8,
  },
  kudosPrompt: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  kudosPromptText: {
    fontSize: 15,
    color: Colors.light.text,
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
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  kudosDismissText: {
    fontSize: 14,
    color: Colors.pass,
    fontWeight: '500',
  },
  kudosSendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#FFD700',
  },
  kudosSendText: {
    fontSize: 14,
    color: Colors.darkText,
    fontWeight: '600',
  },
  kudosSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  kudosSentText: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...Shadows.elevated,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: Colors.pass,
    textAlign: 'center',
    lineHeight: 22,
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
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalConfirmButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: Colors.disagree,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  topicCard: {
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
    fontSize: 12,
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
    fontSize: 10,
    fontWeight: '600',
    color: Colors.white,
  },
  proposalStatusInline: {
    marginLeft: 'auto',
  },
  proposalCardContent: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.white,
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
    backgroundColor: Colors.white,
  },
  closureWarningText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: Colors.white,
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.85,
  },
  proposalCardWaiting: {
    fontSize: 12,
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
    borderColor: Colors.white,
  },
  proposalAvatarCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Colors.white,
    borderRadius: 7,
  },
  // Modify modal styles
  modifyModalCard: {
    backgroundColor: Colors.white,
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
  modifyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
  },
  modifyInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modifySubmitButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: Colors.agree,
    alignItems: 'center',
  },
  modifySubmitButtonDisabled: {
    backgroundColor: Colors.cardBorder,
  },
  modifySubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  // Moderation view styles
  moderationParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
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
  moderationParticipantName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  moderationParticipantUsername: {
    fontSize: 12,
    color: Colors.pass,
  },
  moderationParticipantDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  moderationSenderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.pass,
    textAlign: 'right',
    marginBottom: 2,
  },
  moderationSenderLabelOther: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.pass,
    marginBottom: 2,
    marginLeft: 2,
  },
})

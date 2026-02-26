import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
  Alert,
  KeyboardAvoidingView,
} from 'react-native'
// react-native-keyboard-controller tracks actual keyboard frame (handles emoji
// keyboard, different keyboard heights, smooth transitions). Native only.
const KBAvoidingView = Platform.OS !== 'web'
  ? require('react-native-keyboard-controller').KeyboardAvoidingView
  : null

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../../../constants/Colors'
import { Shadows } from '../../../constants/Theme'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { useAuth } from '../../../contexts/UserContext'
import Header from '../../../components/Header'
import api, { translateError } from '../../../lib/api'
import { CacheManager, CacheKeys } from '../../../lib/cache'
import {
  joinChat,
  leaveChat,
  sendMessage,
  onMessage,
  sendTyping,
  onTyping,
  exitChat,
  onChatStatus,
  isConnected,
  connectSocket,
  sendReadReceipt,
  onReadReceipt,
  proposeAgreedPosition,
  respondToAgreedPosition,
  onAgreedPosition,
  onPartnerDisconnected,
  onPartnerReconnected,
  sendReaction,
  onReaction,
  requestDefinition,
  respondDefinition,
  acceptDefinition,
  counterDefine,
  onDefinition,
  requestExplanation,
  respondExplanation,
  confirmGoodFaith,
  rejectExplanation,
  acceptExplanation,
  correctExplanation,
  onExplainPosition,
} from '../../../lib/socket'
import { playTypingSound, playMessageSound, playReactionSound, playAgreedSound, playClosureSound, initNativeSounds } from '../../../lib/sounds'
import { hapticTap, hapticSuccess } from '../../../lib/haptics'
import Avatar from '../../../components/Avatar'
import ThemedText from '../../../components/ThemedText'
import ChatMessageContent from '../../../components/chat/ChatMessageContent'
import ChatSidebar from '../../../components/chat/ChatSidebar'
import TextSelectionModal from '../../../components/chat/TextSelectionModal'
import { buildQuoteMarkup, stripQuoteMarkup } from '../../../lib/quoteUtils'
import PositionInfoCard from '../../../components/PositionInfoCard'
import ReportModal from '../../../components/ReportModal'
import ModerationActionModal from '../../../components/ModerationActionModal'
import useModerateChecker from '../../../hooks/useModerateChecker'
import useToxicityCheck from '../../../hooks/useToxicityCheck'
import ReconsiderModal from '../../../components/ReconsiderModal'
import ReactionBar from '../../../components/chat/ReactionBar'
import ReactionBadges from '../../../components/chat/ReactionBadges'
import { useTranslation } from 'react-i18next'
import useModalBackHandler from '../../../hooks/useModalBackHandler'
import useIsDesktop from '../../../hooks/useIsDesktop'
import { useGlossaryDrawer, useGlossaryRules } from '../../../hooks/useGlossaryDrawer'
import GlossaryDrawer from '../../../components/GlossaryDrawer'

/**
 * Parse a chat log into a sorted array of message/proposal objects.
 * Used for historical view (from chat history), fallback on join failure,
 * and when a joined chat turns out to be ended/archived.
 */
function parseHistoricalMessages(chatLog) {
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

  // Load definition requests
  const defs = chatLog.log?.definitions || []
  if (Array.isArray(defs)) {
    for (const defn of defs) {
      historicalMessages.push({
        id: defn.id || `def-${defn.timestamp || Date.now()}`,
        isDefinitionRequest: true,
        definitionRequest: defn,
        sender_id: defn.requesterId || defn.requester_id,
        timestamp: defn.timestamp,
      })
    }
  }

  // Load explanation requests
  const expls = chatLog.log?.explanations || []
  if (Array.isArray(expls)) {
    for (const expl of expls) {
      historicalMessages.push({
        id: expl.id || `expl-${expl.timestamp || Date.now()}`,
        isExplainRequest: true,
        explainRequest: expl,
        sender_id: expl.requesterId || expl.requester_id,
        timestamp: expl.timestamp,
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

  return historicalMessages
}

export default function ChatScreen() {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { id: chatId, mode, reporterId } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useAuth()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const { t } = useTranslation('chat')
  const isDesktop = useIsDesktop()
  const [glossaryDrawer, onGlossaryTermPress] = useGlossaryDrawer()
  const glossaryRules = useGlossaryRules(onGlossaryTermPress, { inverse: true })

  // Proposal card dimensions relative to screen width
  const proposalCardWidth = Math.min(Math.max(screenWidth * 0.7, 200), 400)
  // Offset constrained so card never goes off-screen
  const maxOffset = (screenWidth - proposalCardWidth) / 2
  const proposalOffset = Math.min(screenWidth * 0.1, maxOffset - 8) // 8px padding from edge
  const insets = useSafeAreaInsets()

  // Max input height: desktop gets 8 lines, mobile gets 4 lines
  // (fontSize 15 × ~1.33 lineHeight × lines + 20px padding)
  const maxInputHeight = isDesktop ? 180 : 100

  // Web textarea doesn't auto-grow — track content height explicitly
  const [webInputHeight, setWebInputHeight] = useState(null)
  const handleContentSizeChange = useCallback((e) => {
    if (Platform.OS !== 'web') return
    const h = e.nativeEvent.contentSize.height
    setWebInputHeight(h)
  }, [])

  // Ref for positioning the popover above the + button on desktop
  const specialMenuBtnRef = useRef(null)
  const [menuBtnLayout, setMenuBtnLayout] = useState(null)

  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chatInfo, setChatInfo] = useState(null)
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  const [chatEnded, setChatEnded] = useState(false)
  const [chatEndedWithClosure, setChatEndedWithClosure] = useState(false)
  const [otherUserLeft, setOtherUserLeft] = useState(false)
  const [partnerDisconnected, setPartnerDisconnected] = useState(false)
  const [isHistoricalView, setIsHistoricalView] = useState(false) // True when viewing archived chat from history
  const [isModerationView, setIsModerationView] = useState(false) // True when moderator is viewing a reported chat
  const [participants, setParticipants] = useState(null) // Both participants when in moderation view
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [otherUserLastRead, setOtherUserLastRead] = useState(null) // Message ID other user has read up to
  const [showSpecialMenu, setShowSpecialMenu] = useState(false) // Show menu for special message types
  const [messageType, setMessageType] = useState('text') // 'text', 'position_proposal', 'closure_proposal'
  const [modifyingProposal, setModifyingProposal] = useState(null) // Proposal being modified
  const [modifyText, setModifyText] = useState('') // Text for modified proposal
  const [expandedProposalStack, setExpandedProposalStack] = useState(null) // ID of expanded proposal stack
  const [proposalHeights, setProposalHeights] = useState({}) // Track heights of proposal cards for stacking
  const [kudosStatus, setKudosStatus] = useState(null) // null = show prompt, 'sent' = kudos sent, 'dismissed' = dismissed
  const [reportModalVisible, setReportModalVisible] = useState(false)

  // Quote system state
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [quoteButtonsMessageId, setQuoteButtonsMessageId] = useState(null) // Which message shows inline quote buttons
  const [textSelectionVisible, setTextSelectionVisible] = useState(false)
  const [textSelectionMessage, setTextSelectionMessage] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)

  // Definitions state
  const [definitions, setDefinitions] = useState([]) // DefinitionRequest objects
  const [definitionModalRequest, setDefinitionModalRequest] = useState(null) // null = closed
  const [definitionModalMode, setDefinitionModalMode] = useState('respond') // 'respond' | 'counter_define'
  const [definitionModalText, setDefinitionModalText] = useState('')

  // Explanations state
  const [explanations, setExplanations] = useState([]) // ExplainRequest objects
  const [explanationModalRequest, setExplanationModalRequest] = useState(null) // null = closed
  const [explanationModalMode, setExplanationModalMode] = useState('explain') // 'explain' | 'correct'
  const [explanationModalText, setExplanationModalText] = useState('')

  // Reactions state: { messageId: [{userId, emoji, timestamp}] }
  const [reactions, setReactions] = useState({})

  // Moderation state
  const checkModerateScope = useModerateChecker()
  const userCanModerate = chatInfo?.position
    ? checkModerateScope(chatInfo.position.location?.id, chatInfo.position.session?.id)
    : false
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  // Toxicity reconsider
  const toxicity = useToxicityCheck()

  // Close special menu on back gesture/button
  const closeSpecialMenu = useCallback(() => setShowSpecialMenu(false), [])
  useModalBackHandler(showSpecialMenu, closeSpecialMenu)

  // Web: track keyboard height via visualViewport (native handled by KBAvoidingView)
  const [webKeyboardHeight, setWebKeyboardHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    // Only needed on mobile web (touch-primary devices with on-screen keyboards).
    // Desktop browsers have pointer: fine — no on-screen keyboard to track.
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const vv = window.visualViewport
    if (!vv) return
    const initialHeight = window.innerHeight
    let focusTimeout = null
    // Ignore resize events during keyboard open animation to prevent
    // intermediate small diff values from briefly zeroing the spacer.
    let skipResizeUntil = 0

    const update = () => {
      if (Date.now() < skipResizeUntil) return
      const diff = initialHeight - vv.height
      setWebKeyboardHeight(diff > 150 ? diff : 0)
    }

    vv.addEventListener('resize', update)

    // Firefox fires no visualViewport resize on keyboard open — use focus events
    const onFocusIn = (e) => {
      if (!e.target?.tagName?.match?.(/INPUT|TEXTAREA/i)) return
      clearTimeout(focusTimeout)
      skipResizeUntil = Date.now() + 300
      setWebKeyboardHeight(Math.round(initialHeight * 0.4))
      setTimeout(update, 300)
    }
    const onFocusOut = () => {
      focusTimeout = setTimeout(() => {
        if (vv.height >= initialHeight - 150) setWebKeyboardHeight(0)
      }, 300)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv.removeEventListener('resize', update)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      clearTimeout(focusTimeout)
    }
  }, [])

  const flatListRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const isNearBottomRef = useRef(true) // Track if user is near bottom of chat
  const otherTypingTimeoutRef = useRef(null) // Delay before hiding other user's typing indicator
  const lastSentReadReceiptRef = useRef(null) // Track last read receipt we sent to avoid duplicates
  const visibleMessageIdsRef = useRef(new Set()) // Track which messages are currently visible on screen
  const confirmedLeaveRef = useRef(false) // Tracks confirmed leave to allow beforeRemove

  // Animated values for typing dots
  const dot1Anim = useRef(new Animated.Value(0)).current
  const dot2Anim = useRef(new Animated.Value(0)).current
  const dot3Anim = useRef(new Animated.Value(0)).current

  // Get other user from chat info
  const otherUser = chatInfo?.otherUser

  // Quote system: computed maps for message/position lookup
  const textMessages = useMemo(
    () => messages.filter(m => !m.isProposal && !m.isDefinitionRequest && !m.isExplainRequest),
    [messages]
  )
  const acceptedPositions = useMemo(
    () => messages.filter(m => m.isProposal && m.type === 'accepted'),
    [messages]
  )
  // M1 = textMessages[0], M2 = textMessages[1], etc.
  const messageMap = useMemo(
    () => Object.fromEntries(textMessages.map((m, i) => [i + 1, m])),
    [textMessages]
  )
  // S1 = acceptedPositions[0], S2 = acceptedPositions[1], etc.
  const positionMap = useMemo(
    () => Object.fromEntries(acceptedPositions.map((p, i) => [i + 1, p])),
    [acceptedPositions]
  )
  // Flatten resolved definition requests into individual definitions for D-numbering
  const flatDefinitions = useMemo(() => {
    const flat = []
    for (const req of definitions) {
      const status = req.status
      if (status === 'accepted') {
        flat.push({ id: req.id, term: req.term, definition: req.definition, definerId: req.definerId || req.definer_id, status: 'accepted' })
      } else if (status === 'both_defined') {
        flat.push({ id: req.id, term: req.term, definition: req.definition, definerId: req.definerId || req.definer_id, status: 'both_defined' })
        flat.push({ id: `${req.id}-counter`, term: req.term, definition: req.counterDefinition || req.counter_definition, definerId: req.counterDefinerId || req.counter_definer_id, status: 'both_defined' })
      }
    }
    return flat
  }, [definitions])
  // D1 = flatDefinitions[0], D2 = flatDefinitions[1], etc.
  const definitionMap = useMemo(
    () => Object.fromEntries(flatDefinitions.map((d, i) => [i + 1, d])),
    [flatDefinitions]
  )
  // Flatten resolved explanation requests into individual explanations for E-numbering
  const flatExplanations = useMemo(() => {
    const flat = []
    for (const req of explanations) {
      if (req.status === 'completed') {
        flat.push({ id: req.id, position: req.position, explanation: req.explanation, explainerId: req.explainerId || req.explainer_id })
      } else if (req.status === 'corrected') {
        flat.push({ id: req.id, position: req.position, explanation: req.correction, explainerId: req.requesterId || req.requester_id })
      }
    }
    return flat
  }, [explanations])
  // E1 = flatExplanations[0], E2 = flatExplanations[1], etc.
  const explanationMap = useMemo(
    () => Object.fromEntries(flatExplanations.map((e, i) => [i + 1, e])),
    [flatExplanations]
  )

  // Hide tab bar when chat screen is active
  useEffect(() => {
    const parent = navigation.getParent()
    parent?.setOptions({ tabBarStyle: { display: 'none' } })

    return () => {
      // Restore tab bar when leaving
      parent?.setOptions({ tabBarStyle: undefined })
    }
  }, [navigation])

  // Pre-initialize native sounds so they're ready for instant playback
  useEffect(() => { initNativeSounds() }, [])

  // Intercept gesture/hardware back when chat is live — show leave confirmation
  useEffect(() => {
    if (chatEnded || isHistoricalView || isModerationView) return

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (confirmedLeaveRef.current) return // Allow navigation after confirmation
      e.preventDefault()
      setShowLeaveConfirm(true)
    })
    return unsubscribe
  }, [navigation, chatEnded, isHistoricalView, isModerationView])

  // Animate typing dots and play sound when other user is typing
  useEffect(() => {
    if (otherUserTyping) {
      // Play subtle typing sound
      playTypingSound()

      const anim = Animated.loop(
        Animated.sequence([
          Animated.stagger(150, [
            Animated.sequence([
              Animated.timing(dot1Anim, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(dot1Anim, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
            ]),
            Animated.sequence([
              Animated.timing(dot2Anim, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(dot2Anim, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
            ]),
            Animated.sequence([
              Animated.timing(dot3Anim, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(dot3Anim, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
            ]),
          ]),
        ])
      )
      anim.start()

      return () => anim.stop()
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
    let cleanupPartnerDisconnected = null
    let cleanupPartnerReconnected = null
    let cleanupReaction = null
    let cleanupDefinition = null
    let cleanupExplanation = null
    let isActiveChat = false // Track whether we joined a live chat (for leave_chat on unmount)

    async function initChat() {
      try {
        setLoading(true)
        setError(null)

        // If viewing from chat history or moderation, load directly from API (no WebSocket needed)
        if (mode === 'history' || mode === 'moderation') {
          try {
            const chatLog = await api.chat.getChatLog(chatId)
            setChatInfo(chatLog)
            setChatEnded(true)
            setIsHistoricalView(true)

            // If moderator view, capture participants for message attribution
            if (mode === 'moderation') {
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

            setMessages(parseHistoricalMessages(chatLog))
            setDefinitions(chatLog.log?.definitions || [])
            setExplanations(chatLog.log?.explanations || [])
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
        // If socket isn't connected yet, try to connect before giving up
        if (!isConnected()) {
          try {
            await connectSocket()
          } catch {
            setError(t('notConnected'))
            setLoading(false)
            return
          }
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
                // Ensure we have all necessary proposal fields (camelCase from backend, snake_case fallback)
                proposalId: msg.proposalId || msg.proposal_id || msg.id,
                isClosure: msg.isClosure || msg.is_closure || false,
                parentId: msg.parentId || msg.parent_id || null,
              }
            }
            return msg
          })

          // Also check if agreedPositions are returned separately and need to be merged
          const agreedPositions = joinResponse.agreedPositions || []
          const proposalMessages = agreedPositions.map(pos => {
            // Backend returns camelCase: proposerId, isClosure, parentId, timestamp
            let displayType = pos.status || 'proposed'
            if (displayType === 'pending') displayType = 'proposed'
            return {
              id: pos.id || `proposal-${Date.now()}`,
              content: pos.content,
              type: displayType,
              sender_id: pos.proposerId || pos.proposer_id,
              timestamp: pos.timestamp,
              isProposal: true,
              isClosure: pos.isClosure || pos.is_closure || false,
              proposalId: pos.id,
              parentId: pos.parentId || pos.parent_id || null,
            }
          })

          // Merge messages and proposals, sorted by timestamp
          const allMessages = [...processedMessages, ...proposalMessages].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.sendTime || 0).getTime()
            const timeB = new Date(b.timestamp || b.sendTime || 0).getTime()
            return timeA - timeB
          })

          setMessages(allMessages)

          // Load reactions from join response
          if (joinResponse.reactions) {
            setReactions(joinResponse.reactions)
          }

          // Load definition requests from join response
          const joinDefinitions = joinResponse.definitions || []
          if (joinDefinitions.length > 0) {
            setDefinitions(joinDefinitions)
            // Add definition requests as items in the messages array for inline rendering
            const defMessages = joinDefinitions.map(req => ({
              id: req.id || `def-${Date.now()}`,
              isDefinitionRequest: true,
              definitionRequest: req,
              sender_id: req.requesterId || req.requester_id,
              timestamp: req.timestamp,
            }))
            setMessages(prev => [...prev, ...defMessages].sort((a, b) => {
              const timeA = new Date(a.timestamp || a.sendTime || 0).getTime()
              const timeB = new Date(b.timestamp || b.sendTime || 0).getTime()
              return timeA - timeB
            }))
          }

          // Load explanation requests from join response
          const joinExplanations = joinResponse.explanations || []
          if (joinExplanations.length > 0) {
            setExplanations(joinExplanations)
            // Add explanation requests as items in the messages array for inline rendering
            const explMessages = joinExplanations.map(req => ({
              id: req.id || `expl-${Date.now()}`,
              isExplainRequest: true,
              explainRequest: req,
              sender_id: req.requesterId || req.requester_id,
              timestamp: req.timestamp,
            }))
            setMessages(prev => [...prev, ...explMessages].sort((a, b) => {
              const timeA = new Date(a.timestamp || a.sendTime || 0).getTime()
              const timeB = new Date(b.timestamp || b.sendTime || 0).getTime()
              return timeA - timeB
            }))
          }
        } catch (joinErr) {
          // If join fails (e.g., chat already ended), check if it's archived in PostgreSQL
          console.debug('Join failed, checking if chat is archived:', joinErr.message)
          try {
            const chatLog = await api.chat.getChatLog(chatId)
            if (chatLog.status === 'ended' || chatLog.status === 'archived') {
              // Chat has ended, show it as a historical view
              setChatInfo(chatLog)
              setChatEnded(true)
              setIsHistoricalView(true)

              setMessages(parseHistoricalMessages(chatLog))

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
              return parseHistoricalMessages(chatLog)
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
          console.debug('[Chat] Status event:', data)
          if (data.chatId === chatId || String(data.chatId) === String(chatId)) {
            if (data.status === 'user_left') {
              // Other user left the chat
              setOtherUserLeft(true)
              setChatEnded(true)
            } else if (data.status === 'ended' || data.type === 'chat_ended') {
              setChatEnded(true)
              isActiveChat = false
              setPartnerDisconnected(false)
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
              // If ended by abandonment, mark the chat appropriately
              if (data.endType === 'abandoned') {
                setOtherUserLeft(true)
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
          console.debug('[Chat] Agreed position event:', data)
          const proposal = data.proposal || {}
          const action = data.action
          // Backend emits camelCase (proposerId) in both proposal.to_dict() and top-level
          const proposerId = proposal.proposerId || data.proposerId || proposal.proposer_id

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
              sender_id: proposerId,
              timestamp: proposal.timestamp || new Date().toISOString(),
              isProposal: true,
              isClosure: proposal.isClosure || data.isClosure || false,
              proposalId: proposal.id,
              parentId: proposal.parentId || null,
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

            // Sound + haptic on acceptance (both participants hear via socket)
            if (action === 'accept') {
              const isClosure = proposal.isClosure || data.isClosure
              if (isClosure) {
                playClosureSound()
              } else {
                playAgreedSound()
              }
              hapticSuccess()
            }

            // If closure was accepted, mark chat as ended
            if (action === 'accept' && (proposal.isClosure || data.isClosure)) {
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
                sender_id: proposerId,
                timestamp: proposal.timestamp || new Date().toISOString(),
                isProposal: true,
                isClosure: proposal.isClosure || data.isClosure || false,
                proposalId: proposal.id,
                parentId: data.originalProposalId, // Link to the original proposal
              }
              return [...updated, newProposalMessage]
            })
          }
        })

        // Set up partner disconnected/reconnected listeners
        cleanupPartnerDisconnected = onPartnerDisconnected((data) => {
          if (data.chatId === chatId || String(data.chatId) === String(chatId)) {
            console.debug('[Chat] Partner disconnected:', data)
            setPartnerDisconnected(true)
          }
        })

        cleanupPartnerReconnected = onPartnerReconnected((data) => {
          if (data.chatId === chatId || String(data.chatId) === String(chatId)) {
            console.debug('[Chat] Partner reconnected:', data)
            setPartnerDisconnected(false)
          }
        })

        // Set up reaction listener
        cleanupReaction = onReaction((data) => {
          if (data.chatId !== chatId && String(data.chatId) !== String(chatId)) return
          // Sound + haptic when partner reacts (not own echoes, not removes)
          if (data.userId !== user?.id && data.emoji) {
            playReactionSound()
            hapticSuccess()
          }
          setReactions(prev => {
            const next = { ...prev }
            const msgReactions = (next[data.messageId] || []).filter(
              r => r.userId !== data.userId
            )
            if (data.emoji) {
              msgReactions.push({
                userId: data.userId,
                emoji: data.emoji,
                timestamp: data.timestamp,
              })
            }
            if (msgReactions.length > 0) {
              next[data.messageId] = msgReactions
            } else {
              delete next[data.messageId]
            }
            return next
          })
        })

        // Set up definition listener
        cleanupDefinition = onDefinition((data) => {
          console.debug('[Chat] Definition event:', data)
          const req = data.request || {}
          const senderId = data.requesterId || data.definerId || data.counterDefinerId || data.accepterId

          // Hide typing indicator when we receive a definition event from the other user
          if (senderId && senderId !== user?.id) {
            if (otherTypingTimeoutRef.current) {
              clearTimeout(otherTypingTimeoutRef.current)
              otherTypingTimeoutRef.current = null
            }
            setOtherUserTyping(false)
          }

          if (data.action === 'request') {
            // New definition request — add to definitions and messages
            setDefinitions(prev => [...prev, req])
            setMessages(prev => [...prev, {
              id: req.id || `def-${Date.now()}`,
              isDefinitionRequest: true,
              definitionRequest: req,
              sender_id: req.requesterId || req.requester_id,
              timestamp: req.timestamp || new Date().toISOString(),
            }])
          } else {
            // Update existing request (define, accept, counter_define)
            setDefinitions(prev => prev.map(d => d.id === req.id ? req : d))
            setMessages(prev => prev.map(m =>
              m.isDefinitionRequest && m.definitionRequest?.id === req.id
                ? { ...m, definitionRequest: req }
                : m
            ))
          }
        })

        // Set up explanation listener
        cleanupExplanation = onExplainPosition((data) => {
          console.debug('[Chat] Explain position event:', data)
          const req = data.request || {}
          const senderId = data.requesterId || data.explainerId || data.confirmerId || data.rejecterId || data.accepterId || data.correcterId

          // Hide typing indicator when we receive an explanation event from the other user
          if (senderId && senderId !== user?.id) {
            if (otherTypingTimeoutRef.current) {
              clearTimeout(otherTypingTimeoutRef.current)
              otherTypingTimeoutRef.current = null
            }
            setOtherUserTyping(false)
          }

          if (data.action === 'request') {
            // New explanation request — add to explanations and messages
            setExplanations(prev => [...prev, req])
            setMessages(prev => [...prev, {
              id: req.id || `expl-${Date.now()}`,
              isExplainRequest: true,
              explainRequest: req,
              sender_id: req.requesterId || req.requester_id,
              timestamp: req.timestamp || new Date().toISOString(),
            }])
          } else {
            // Update existing request
            setExplanations(prev => prev.map(e => e.id === req.id ? req : e))
            setMessages(prev => prev.map(m =>
              m.isExplainRequest && m.explainRequest?.id === req.id
                ? { ...m, explainRequest: req }
                : m
            ))
          }
        })

        isActiveChat = true
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
      if (cleanupPartnerDisconnected) cleanupPartnerDisconnected()
      if (cleanupPartnerReconnected) cleanupPartnerReconnected()
      if (cleanupReaction) cleanupReaction()
      if (cleanupDefinition) cleanupDefinition()
      if (cleanupExplanation) cleanupExplanation()
      // Emit leave_chat when unmounting if this was an active chat
      if (isActiveChat) {
        leaveChat(chatId)
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (otherTypingTimeoutRef.current) {
        clearTimeout(otherTypingTimeoutRef.current)
      }
    }
  }, [chatId, user?.id, mode])

  // Actually dispatch the message over the socket
  const doSendMessage = useCallback(async (text, msgType, { wasFlaggedToxic } = {}) => {
    try {
      setInputText('')
      setMessageType('text')

      if (Platform.OS === 'web') {
        setTimeout(() => inputRef.current?.focus(), 0)
      }

      if (isTypingRef.current) {
        sendTyping(chatId, false)
        isTypingRef.current = false
      }

      if (msgType === 'definition_request') {
        await requestDefinition(chatId, text)
      } else if (msgType === 'explain_request') {
        await requestExplanation(chatId, text)
      } else if (msgType === 'position_proposal' || msgType === 'closure_proposal') {
        const isClosure = msgType === 'closure_proposal'
        await proposeAgreedPosition(chatId, text, isClosure)
      } else {
        await sendMessage(chatId, text, msgType, { wasFlaggedToxic })
      }
      if (user?.id) CacheManager.invalidate(CacheKeys.userChats(user.id))
    } catch (err) {
      console.error('Failed to send message:', err)
      setInputText(text)
      setMessageType(msgType)
    }
  }, [chatId])

  // Handle sending a message (with toxicity check for plain text messages)
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || chatEnded) return

    const currentMessageType = messageType

    // Only check toxicity for regular text messages (not proposals or definitions)
    if (currentMessageType === 'text') {
      toxicity.checkAndSend(
        text,
        () => doSendMessage(text, currentMessageType),
        () => doSendMessage(text, currentMessageType, { wasFlaggedToxic: true }),
      )
    } else {
      doSendMessage(text, currentMessageType)
    }
  }, [chatId, inputText, chatEnded, messageType, toxicity.checkAndSend, doSendMessage])

  // Desktop: Enter sends, Shift+Enter inserts newline
  const handleKeyPress = useCallback((e) => {
    if (!isDesktop) return
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [isDesktop, handleSend])

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


  const safeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)/cards')
    }
  }, [router])

  // Show leave confirmation
  const handleBackPress = useCallback(() => {
    if (chatEnded) {
      safeBack()
    } else {
      setShowLeaveConfirm(true)
    }
  }, [chatEnded, safeBack])

  // Handle confirmed exit chat
  const handleConfirmLeave = useCallback(async () => {
    setShowLeaveConfirm(false)
    confirmedLeaveRef.current = true
    // Only try to exit if the chat hasn't already ended (e.g., other user left)
    if (!chatEnded) {
      try {
        await exitChat(chatId, 'left')
      } catch (err) {
        console.error('Failed to exit chat:', err)
      }
    }
    safeBack()
  }, [chatId, safeBack, chatEnded])

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
      // 409 = already sent kudos to this user for this topic (from a previous chat)
      if (err?.status === 409 || err?.message?.includes('409')) {
        setKudosStatus('sent')
      } else {
        console.error('Failed to send kudos:', err)
      }
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

  const handleModerateChat = useCallback(() => {
    setModerateTarget({ type: 'chat_log', id: chatId })
    setReportModalVisible(true)
  }, [chatId])

  const handleModerateRuleSelected = useCallback(async (ruleId, comment, rule) => {
    setModerateRule(rule)
    setModerateComment(comment)
    setReportModalVisible(false)
    setTimeout(() => setActionModalVisible(true), 300)
  }, [])

  const handleModerateActionSubmit = useCallback(async (actionData) => {
    if (!moderateTarget || !moderateRule) return
    try {
      await api.moderation.createAction({
        targetType: moderateTarget.type,
        targetId: moderateTarget.id,
        ruleId: moderateRule.id,
        comment: moderateComment,
        ...actionData,
      })
      setActionModalVisible(false)
      Alert.alert(t('discuss:moderationSuccess'))
    } catch (err) {
      if (err?.status === 403) {
        Alert.alert(t('discuss:moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t])

  // Reaction handler
  const handleReact = useCallback((messageId, emoji) => {
    if (emoji) hapticTap()
    sendReaction(chatId, messageId, emoji).catch(err => {
      console.error('Failed to send reaction:', err)
    })
    // Optimistic update
    setReactions(prev => {
      const next = { ...prev }
      const msgReactions = (next[messageId] || []).filter(
        r => r.userId !== user?.id
      )
      if (emoji) {
        msgReactions.push({
          userId: user?.id,
          emoji,
          timestamp: new Date().toISOString(),
        })
      }
      if (msgReactions.length > 0) {
        next[messageId] = msgReactions
      } else {
        delete next[messageId]
      }
      return next
    })
    // Dismiss the action bar (quote buttons + reaction picker)
    setQuoteButtonsMessageId(null)
  }, [chatId, user?.id])

  // Quote handlers
  const handleMessageTap = useCallback((item) => {
    // Toggle inline quote buttons for this message
    setQuoteButtonsMessageId(prev => prev === item.id ? null : item.id)
  }, [])

  const handleQuoteFull = useCallback((item) => {
    // Use ID-based lookup (not indexOf) — object references can break after state updates
    const mNumber = textMessages.findIndex(m => m.id === item.id) + 1
    if (mNumber <= 0) return
    const plainText = stripQuoteMarkup(item.content || '')
    const markup = buildQuoteMarkup('M', mNumber, plainText)
    setInputText(prev => markup + '\n' + prev)
    setQuoteButtonsMessageId(null)
  }, [textMessages])

  const handleSelectPart = useCallback((item) => {
    setTextSelectionMessage(item)
    setTextSelectionVisible(true)
    setQuoteButtonsMessageId(null)
  }, [])

  const handleQuotePartial = useCallback((selectedText, start, end) => {
    if (!textSelectionMessage) return
    // Use ID-based lookup (not indexOf) — object references can break after state updates
    const mNumber = textMessages.findIndex(m => m.id === textSelectionMessage.id) + 1
    if (mNumber <= 0) return
    const plainText = stripQuoteMarkup(textSelectionMessage.content || '')
    const markup = buildQuoteMarkup('M', mNumber, plainText, { start, end })
    setInputText(prev => markup + '\n' + prev)
    setTextSelectionVisible(false)
    setTextSelectionMessage(null)
  }, [textSelectionMessage, textMessages])

  const handleQuoteAgreedPosition = useCallback((pos, sNum) => {
    const markup = buildQuoteMarkup('S', sNum, pos.content || '')
    setInputText(prev => markup + '\n' + prev)
    setSidebarVisible(false)
  }, [])

  const handleQuoteDefinition = useCallback((defn, dNum) => {
    const markup = buildQuoteMarkup('D', dNum, defn.definition || '')
    setInputText(prev => markup + '\n' + prev)
    setSidebarVisible(false)
  }, [])

  const handleQuotePress = useCallback((prefix, num) => {
    // Find the index of the referenced item in the FlatList data (use ID-based lookup)
    let targetId = null
    if (prefix === 'M') {
      targetId = messageMap[num]?.id
    } else if (prefix === 'S') {
      targetId = positionMap[num]?.id
    } else if (prefix === 'D') {
      targetId = definitionMap[num]?.id
    } else if (prefix === 'E') {
      targetId = explanationMap[num]?.id
    }

    if (!targetId) return

    const targetIndex = messages.findIndex(m => m.id === targetId)
    if (targetIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.5,
      })
      // Brief highlight flash
      setHighlightedMessageId(targetId)
      setTimeout(() => setHighlightedMessageId(null), 1500)
    }
  }, [messages, messageMap, positionMap, definitionMap, explanationMap])

  // Toggle special message menu
  const handleToggleSpecialMenu = useCallback(() => {
    // On desktop, measure + button position for popover placement
    if (isDesktop && specialMenuBtnRef.current) {
      specialMenuBtnRef.current.measureInWindow((x, y, width, height) => {
        setMenuBtnLayout({ x, y, width, height })
      })
    }
    setShowSpecialMenu(prev => !prev)
  }, [isDesktop])

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

  // Select define term message type
  const handleSelectDefine = useCallback(() => {
    setMessageType('definition_request')
    setShowSpecialMenu(false)
  }, [])

  // Definition request actions
  const handleRespondDefinition = useCallback((request) => {
    setDefinitionModalRequest(request)
    setDefinitionModalMode('respond')
    setDefinitionModalText('')
  }, [])

  const handleAcceptDefinition = useCallback(async (requestId) => {
    try {
      await acceptDefinition(chatId, requestId)
    } catch (err) {
      console.error('Failed to accept definition:', err)
    }
  }, [chatId])

  const handleStartCounterDefine = useCallback((request) => {
    setDefinitionModalRequest(request)
    setDefinitionModalMode('counter_define')
    setDefinitionModalText('')
  }, [])

  const handleCancelDefinitionModal = useCallback(() => {
    setDefinitionModalRequest(null)
    setDefinitionModalText('')
  }, [])

  const handleSubmitDefinitionModal = useCallback(async () => {
    const text = definitionModalText.trim()
    if (!text || !definitionModalRequest) return

    try {
      if (definitionModalMode === 'respond') {
        await respondDefinition(chatId, definitionModalRequest.id, text)
      } else {
        await counterDefine(chatId, definitionModalRequest.id, text)
      }
      setDefinitionModalRequest(null)
      setDefinitionModalText('')
    } catch (err) {
      console.error('Failed to submit definition:', err)
    }
  }, [chatId, definitionModalRequest, definitionModalMode, definitionModalText])

  // Explanation request actions
  const handleSelectExplain = useCallback(() => {
    setMessageType('explain_request')
    setShowSpecialMenu(false)
  }, [])

  // Shared menu items for both desktop popover and mobile modal
  const renderSpecialMenuItems = useCallback(() => {
    const items = [
      { type: 'text', handler: handleSelectChat, label: t('menuChat'), desc: t('menuChatDesc'), icon: 'chatbubble', color: colors.primary },
      { type: 'position_proposal', handler: handleSelectProposeStatement, label: t('menuProposeStatement'), desc: t('menuProposeStatementDesc'), icon: 'document-text', color: colors.agreeBubble, checkColor: SemanticColors.agree },
      { type: 'closure_proposal', handler: handleSelectProposeClosure, label: t('menuProposeClosure'), desc: t('menuProposeClosureDesc'), icon: 'checkmark-done', color: colors.chat },
      { type: 'definition_request', handler: handleSelectDefine, label: t('menuDefine'), desc: t('menuDefineDesc'), icon: 'book-outline', color: colors.definitionAccent },
      { type: 'explain_request', handler: handleSelectExplain, label: t('menuExplain'), desc: t('menuExplainDesc'), icon: 'chatbubble-ellipses-outline', color: colors.explanationAccent },
    ]
    return items.map(item => (
      <TouchableOpacity
        key={item.type}
        style={[styles.specialMenuItem, messageType === item.type && styles.specialMenuItemSelected]}
        onPress={item.handler}
        accessibilityRole="menuitem"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: messageType === item.type }}
      >
        <View style={[styles.specialMenuIcon, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={20} color="#fff" />
        </View>
        <View style={styles.specialMenuItemText}>
          <ThemedText variant="body" style={styles.specialMenuItemTitle}>{item.label}</ThemedText>
          <ThemedText variant="caption" style={styles.specialMenuItemDesc}>{item.desc}</ThemedText>
        </View>
        {messageType === item.type && (
          <Ionicons name="checkmark-circle" size={24} color={item.checkColor || item.color} />
        )}
      </TouchableOpacity>
    ))
  }, [messageType, colors, t, handleSelectChat, handleSelectProposeStatement, handleSelectProposeClosure, handleSelectDefine, handleSelectExplain, styles])

  const handleRespondExplanation = useCallback((request) => {
    setExplanationModalRequest(request)
    setExplanationModalMode('explain')
    setExplanationModalText('')
  }, [])

  const handleConfirmGoodFaith = useCallback(async (requestId) => {
    try {
      await confirmGoodFaith(chatId, requestId)
    } catch (err) {
      console.error('Failed to confirm good faith:', err)
    }
  }, [chatId])

  const handleRejectExplanation = useCallback(async (requestId) => {
    try {
      await rejectExplanation(chatId, requestId)
    } catch (err) {
      console.error('Failed to reject explanation:', err)
    }
  }, [chatId])

  const handleAcceptExplanation = useCallback(async (requestId) => {
    try {
      await acceptExplanation(chatId, requestId)
    } catch (err) {
      console.error('Failed to accept explanation:', err)
    }
  }, [chatId])

  const handleStartCorrection = useCallback((request) => {
    setExplanationModalRequest(request)
    setExplanationModalMode('correct')
    setExplanationModalText('')
  }, [])

  const handleCancelExplanationModal = useCallback(() => {
    setExplanationModalRequest(null)
    setExplanationModalText('')
  }, [])

  const handleSubmitExplanationModal = useCallback(async () => {
    const text = explanationModalText.trim()
    if (!text || !explanationModalRequest) return

    try {
      if (explanationModalMode === 'explain') {
        await respondExplanation(chatId, explanationModalRequest.id, text)
      } else {
        await correctExplanation(chatId, explanationModalRequest.id, text)
      }
      setExplanationModalRequest(null)
      setExplanationModalText('')
    } catch (err) {
      console.error('Failed to submit explanation:', err)
    }
  }, [chatId, explanationModalRequest, explanationModalMode, explanationModalText])

  const handleQuoteExplanation = useCallback((expl, eNum) => {
    const markup = buildQuoteMarkup('E', eNum, expl.explanation || '')
    setInputText(prev => markup + '\n' + prev)
    setSidebarVisible(false)
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

    // Check if this is a definition request card
    if (item.isDefinitionRequest) {
      const req = item.definitionRequest || {}
      const reqStatus = req.status || 'pending'
      const isRequester = String(req.requesterId || req.requester_id || '') === currentUserId
      const isDefiner = String(req.definerId || req.definer_id || '') === currentUserId

      return (
        <View
          style={[
            styles.definitionCardWrapper,
            highlightedMessageId === item.id && styles.highlightedMessage,
          ]}
        >
          <View style={[styles.proposalCard, { backgroundColor: colors.definitionAccent }]}>
            {/* Type badge row */}
            <View style={styles.proposalTypeRow}>
              <View style={[styles.proposalTypeBadge, { backgroundColor: colors.definitionAccent }]}>
                <Ionicons name="book-outline" size={12} color="#fff" />
                <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>{t('defineLabel')}</ThemedText>
              </View>
              {reqStatus === 'accepted' && (
                <View style={styles.proposalStatusInline}>
                  <MaterialCommunityIcons name="handshake-outline" size={14} color="#fff" />
                </View>
              )}
            </View>

            {/* Term */}
            <ThemedText variant="body" color="inverse" style={styles.proposalCardContent}>
              {req.term}
            </ThemedText>

            {/* Defined: show definition text */}
            {(reqStatus === 'defined' || reqStatus === 'accepted') && req.definition && (
              <ThemedText variant="body" color="inverse" style={styles.definitionText}>
                {req.definition}
              </ThemedText>
            )}

            {/* Both defined: show both definitions with attribution */}
            {reqStatus === 'both_defined' && (
              <>
                <ThemedText variant="body" color="inverse" style={styles.definitionText}>
                  {req.definition}
                </ThemedText>
                <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                  {t('definedBy', { name: isDefiner ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                </ThemedText>
                <ThemedText variant="body" color="inverse" style={[styles.definitionText, { marginTop: 8 }]}>
                  {req.counterDefinition || req.counter_definition}
                </ThemedText>
                <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                  {t('counterDefinedBy', { name: isRequester ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                </ThemedText>
              </>
            )}

            {/* Pending: action buttons */}
            {reqStatus === 'pending' && !isRequester && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={[styles.proposalCardButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleRespondDefinition(req)}
                  accessibilityRole="button"
                  accessibilityLabel={t('respondButtonA11y')}
                >
                  <Ionicons name="create-outline" size={16} color={colors.definitionAccent} />
                </TouchableOpacity>
              </View>
            )}
            {reqStatus === 'pending' && isRequester && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {t('waitingForDefinition')}
              </ThemedText>
            )}

            {/* Defined: requester can accept or counter-define */}
            {reqStatus === 'defined' && isRequester && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={[styles.proposalCardLabelButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleAcceptDefinition(req.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('acceptDefinitionA11y')}
                >
                  <ThemedText variant="button" style={styles.proposalCardLabelText}>{t('acceptDefinitionButton')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.proposalCardLabelButton}
                  onPress={() => handleStartCounterDefine(req)}
                  accessibilityRole="button"
                  accessibilityLabel={t('counterDefineA11y')}
                >
                  <ThemedText variant="button" style={styles.proposalCardLabelTextInverse}>{t('counterDefineButton')}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            {reqStatus === 'defined' && isDefiner && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {t('waitingForDefinition')}
              </ThemedText>
            )}

            {/* Accepted: both user avatars */}
            {reqStatus === 'accepted' && (
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
        </View>
      )
    }

    // Check if this is an explanation request card
    if (item.isExplainRequest) {
      const req = item.explainRequest || {}
      const reqStatus = req.status || 'pending'
      const isRequester = String(req.requesterId || req.requester_id || '') === currentUserId
      const isExplainer = String(req.explainerId || req.explainer_id || '') === currentUserId

      return (
        <View
          style={[
            styles.definitionCardWrapper,
            highlightedMessageId === item.id && styles.highlightedMessage,
          ]}
        >
          <View style={[styles.proposalCard, { backgroundColor: colors.explanationAccent }]}>
            {/* Type badge row */}
            <View style={styles.proposalTypeRow}>
              <View style={[styles.proposalTypeBadge, { backgroundColor: colors.explanationAccent }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={12} color="#fff" />
                <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>{t('explainLabel')}</ThemedText>
              </View>
              {(reqStatus === 'good_faith' || reqStatus === 'completed' || reqStatus === 'corrected') && (
                <View style={styles.proposalStatusInline}>
                  <MaterialCommunityIcons name="handshake-outline" size={14} color="#fff" />
                </View>
              )}
            </View>

            {/* Position text */}
            <ThemedText variant="body" color="inverse" style={styles.proposalCardContent}>
              {req.position}
            </ThemedText>

            {/* Explained: show explanation text */}
            {(reqStatus === 'explained' || reqStatus === 'good_faith' || reqStatus === 'completed') && req.explanation && (
              <ThemedText variant="body" color="inverse" style={styles.definitionText}>
                {req.explanation}
              </ThemedText>
            )}

            {/* Corrected: show correction text with attribution */}
            {reqStatus === 'corrected' && (
              <>
                {req.explanation && (
                  <ThemedText variant="body" color="inverse" style={styles.definitionText}>
                    {req.explanation}
                  </ThemedText>
                )}
                <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                  {t('explainedBy', { name: isExplainer ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                </ThemedText>
                <ThemedText variant="body" color="inverse" style={[styles.definitionText, { marginTop: 8 }]}>
                  {req.correction}
                </ThemedText>
                <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                  {t('correctedBy', { name: isRequester ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                </ThemedText>
              </>
            )}

            {/* Pending: action buttons for non-requester */}
            {reqStatus === 'pending' && !isRequester && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={[styles.proposalCardButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleRespondExplanation(req)}
                  accessibilityRole="button"
                  accessibilityLabel={t('respondExplanationA11y')}
                >
                  <Ionicons name="create-outline" size={16} color={colors.explanationAccent} />
                </TouchableOpacity>
              </View>
            )}
            {reqStatus === 'pending' && isRequester && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {t('waitingForExplanation')}
              </ThemedText>
            )}

            {/* Explained: requester decides good faith or reject */}
            {reqStatus === 'explained' && isRequester && !chatEnded && (
              <>
                <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                  {t('wasGoodFaith')}
                </ThemedText>
                <View style={styles.proposalCardActions}>
                  <TouchableOpacity
                    style={[styles.proposalCardLabelButton, styles.proposalCardButtonAccept]}
                    onPress={() => handleConfirmGoodFaith(req.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('confirmGoodFaithA11y')}
                  >
                    <ThemedText variant="button" style={styles.proposalCardLabelText}>{t('confirmGoodFaith')}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.proposalCardLabelButton}
                    onPress={() => handleRejectExplanation(req.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('rejectExplanationA11y')}
                  >
                    <ThemedText variant="button" style={styles.proposalCardLabelTextInverse}>{t('rejectGoodFaith')}</ThemedText>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {reqStatus === 'explained' && isExplainer && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {t('waitingForReview')}
              </ThemedText>
            )}

            {/* Good faith: requester can accept or correct */}
            {reqStatus === 'good_faith' && isRequester && !chatEnded && (
              <View style={styles.proposalCardActions}>
                <TouchableOpacity
                  style={[styles.proposalCardButton, styles.proposalCardButtonAccept]}
                  onPress={() => handleAcceptExplanation(req.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('acceptExplanationA11y')}
                >
                  <Ionicons name="checkmark" size={16} color={SemanticColors.agree} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.proposalCardButton}
                  onPress={() => handleStartCorrection(req)}
                  accessibilityRole="button"
                  accessibilityLabel={t('correctExplanationA11y')}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {reqStatus === 'good_faith' && isExplainer && (
              <ThemedText variant="caption" style={styles.proposalCardWaiting}>
                {t('waitingForReview')}
              </ThemedText>
            )}

            {/* Completed/Corrected: both user avatars + handshake */}
            {(reqStatus === 'completed' || reqStatus === 'corrected') && (
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
        </View>
      )
    }

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

    // Compute M-number for text messages (use ID-based lookup for stability)
    const mNumber = !item.isProposal ? textMessages.findIndex(m => m.id === item.id) + 1 : 0
    const isHighlighted = item.id === highlightedMessageId

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

      const ownCanQuote = !chatEnded && !isModerationView
      const ownShowActions = ownCanQuote && quoteButtonsMessageId === item.id
      const msgReactions = reactions[item.id] || []

      return (
        <View style={[styles.ownMessageWrapper, isHighlighted && styles.highlightedMessage]}>
          <View style={styles.ownMessageRow}>
            {/* Inline quote buttons — to the left of own bubble */}
            {ownShowActions && (
              <View style={[styles.quoteButtonsColumn, { marginLeft: 0, marginRight: 4 }]}>
                <TouchableOpacity
                  style={styles.quoteButton}
                  onPress={() => handleQuoteFull(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('quoteFull')}
                >
                  <ThemedText style={styles.quoteButtonIcon}>{'\u201C'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quoteButton}
                  onPress={() => handleSelectPart(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('selectPart')}
                >
                  <ThemedText style={styles.quoteButtonIcon}>{'\u2026'}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.ownMessageContainer}>
              {ownCanQuote ? (
                <Pressable
                  onPress={() => handleMessageTap(item)}
                  accessibilityRole="button"
                  accessibilityHint={t('tapToQuoteA11y')}
                >
                  <View style={[styles.messageBubble, styles.ownMessage]}>
                    <ChatMessageContent
                      content={item.content}
                      messageMap={messageMap}
                      positionMap={positionMap}
                      definitionMap={definitionMap}
                      explanationMap={explanationMap}
                      currentUserId={currentUserId}
                      otherUser={otherUser}
                      colors={colors}
                      onQuotePress={handleQuotePress}
                      glossaryRules={glossaryRules}
                    />
                    {messageTime && (
                      <ThemedText variant="badge" style={[styles.messageTime, styles.ownMessageTime]}>
                        {mNumber > 0 ? `M${mNumber}  ` : ''}{messageTime}
                      </ThemedText>
                    )}
                  </View>
                </Pressable>
              ) : (
                <View style={[styles.messageBubble, styles.ownMessage]}>
                  <ChatMessageContent
                    content={item.content}
                    messageMap={messageMap}
                    positionMap={positionMap}
                    definitionMap={definitionMap}
                    explanationMap={explanationMap}
                    currentUserId={currentUserId}
                    otherUser={otherUser}
                    colors={colors}
                    onQuotePress={handleQuotePress}
                    glossaryRules={glossaryRules}
                  />
                  {messageTime && (
                    <ThemedText variant="badge" style={[styles.messageTime, styles.ownMessageTime]}>
                      {mNumber > 0 ? `M${mNumber}  ` : ''}{messageTime}
                    </ThemedText>
                  )}
                </View>
              )}
              {/* Read indicator - small avatar bubble */}
              {isLastRead && otherUser && (
                <View style={styles.readIndicator}>
                  <Avatar user={otherUser} size={16} showKudosBadge={false} borderStyle={styles.readIndicatorBorder} />
                </View>
              )}
            </View>
          </View>
          {/* Persistent reaction badges (read-only on own messages) */}
          {msgReactions.length > 0 && (
            <View style={styles.ownReactionBadgesRow}>
              <ReactionBadges reactions={msgReactions} currentUserId={currentUserId} onToggle={() => {}} />
            </View>
          )}
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

    // Other user's message — tappable for quoting (only in active chats, not own messages)
    const canQuote = !chatEnded && !isModerationView
    const showActions = canQuote && quoteButtonsMessageId === item.id
    const msgReactions = reactions[item.id] || []
    const ownReaction = msgReactions.find(r => r.userId === currentUserId)?.emoji || null

    return (
      <View style={[styles.otherMessageWrapper, isHighlighted && styles.highlightedMessage]}>
        <View style={styles.otherMessageRow}>
          {isLastInGroup ? (
            <Avatar user={messageUser} size={28} showKudosBadge={false} />
          ) : (
            <View style={styles.messageAvatarSpacer} />
          )}
          <View style={styles.otherMessageContainer}>
            {canQuote ? (
              <Pressable
                onPress={() => handleMessageTap(item)}
                accessibilityRole="button"
                accessibilityHint={t('tapToQuoteA11y')}
              >
                <View style={[styles.messageBubble, styles.otherMessage]}>
                  <ChatMessageContent
                    content={item.content}
                    messageMap={messageMap}
                    positionMap={positionMap}
                    definitionMap={definitionMap}
                    explanationMap={explanationMap}
                    currentUserId={currentUserId}
                    otherUser={otherUser}
                    colors={colors}
                    onQuotePress={handleQuotePress}
                    glossaryRules={glossaryRules}
                  />
                  {messageTime && (
                    <ThemedText variant="badge" style={[styles.messageTime, styles.otherMessageTime]}>
                      {mNumber > 0 ? `M${mNumber}  ` : ''}{messageTime}
                    </ThemedText>
                  )}
                </View>
              </Pressable>
            ) : (
              <View style={[styles.messageBubble, styles.otherMessage]}>
                <ChatMessageContent
                  content={item.content}
                  messageMap={messageMap}
                  positionMap={positionMap}
                  currentUserId={currentUserId}
                  otherUser={otherUser}
                  colors={colors}
                  onQuotePress={handleQuotePress}
                  glossaryRules={glossaryRules}
                />
                {messageTime && (
                  <ThemedText variant="badge" style={[styles.messageTime, styles.otherMessageTime]}>
                    {mNumber > 0 ? `M${mNumber}  ` : ''}{messageTime}
                  </ThemedText>
                )}
              </View>
            )}
          </View>
          {/* Inline quote buttons — to the right of the bubble */}
          {showActions && (
            <View style={styles.quoteButtonsColumn}>
              <TouchableOpacity
                style={styles.quoteButton}
                onPress={() => handleQuoteFull(item)}
                accessibilityRole="button"
                accessibilityLabel={t('quoteFull')}
              >
                <ThemedText style={styles.quoteButtonIcon}>{'\u201C'}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quoteButton}
                onPress={() => handleSelectPart(item)}
                accessibilityRole="button"
                accessibilityLabel={t('selectPart')}
              >
                <ThemedText style={styles.quoteButtonIcon}>{'\u2026'}</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {/* Reaction bar below message when tapped */}
        {showActions && (
          <View style={styles.otherReactionsRow}>
            <ReactionBar currentReaction={ownReaction} onReact={(emoji) => handleReact(item.id, emoji)} />
          </View>
        )}
        {/* Persistent reaction badges */}
        {msgReactions.length > 0 && (
          <View style={styles.otherReactionBadgesRow}>
            <ReactionBadges reactions={msgReactions} currentUserId={currentUserId} onToggle={(emoji) => handleReact(item.id, emoji)} />
          </View>
        )}
      </View>
    )
  }, [user, otherUser, otherUserLastRead, messages, chatEnded, expandedProposalStack, proposalHeights, proposalCardWidth, proposalOffset, handleAcceptProposal, handleRejectProposal, handleStartModify, isModerationView, participants, textMessages, messageMap, positionMap, handleQuotePress, handleMessageTap, handleQuoteFull, handleSelectPart, highlightedMessageId, quoteButtonsMessageId, reactions, handleReact, colors])

  // Leave confirmation modal
  const renderLeaveConfirmModal = () => (
    <Modal
      visible={showLeaveConfirm}
      transparent
      animationType="fade"
      onRequestClose={handleCancelLeave}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={handleCancelLeave}
        accessibilityLabel={t('leaveChatTitle')}
      >
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
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
        </Pressable>
      </Pressable>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable
        style={styles.modalOverlay}
        onPress={handleCancelModify}
        accessibilityLabel={t('modifyProposal')}
      >
        <Pressable style={styles.modifyModalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
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
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {mode === 'history' || mode === 'moderation' ? (
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
          <ThemedText variant="button" style={styles.loadingText}>{mode === 'history' || mode === 'moderation' ? t('loadingChat') : t('joiningChat')}</ThemedText>
        </View>
        {renderLeaveConfirmModal()}
      </SafeAreaView>
    )
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {mode === 'history' || mode === 'moderation' ? (
          <Header onBack={safeBack} />
        ) : (
          <View style={styles.header}>
            <TouchableOpacity onPress={safeBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('backA11y')}>
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
            onPress={safeBack}
            onPressIn={Platform.OS === 'web' ? safeBack : undefined}
            role="button"
          >
            <ThemedText variant="button" color="inverse">{t('goBack')}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const Wrapper = Platform.OS === 'web' ? View : KBAvoidingView
  const wrapperProps = Platform.OS === 'web' ? {} : {
    behavior: 'padding',
    keyboardVerticalOffset: 0,
  }

  return (
    <Wrapper style={[styles.container, { paddingTop: insets.top }]} {...wrapperProps}>
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
            <TouchableOpacity
              onPress={() => setSidebarVisible(true)}
              style={styles.sidebarToggle}
              accessibilityRole="button"
              accessibilityLabel={t('agreedStatementsA11y')}
            >
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              {acceptedPositions.length > 0 && (
                <View style={styles.sidebarBadge}>
                  <ThemedText variant="badge" style={styles.sidebarBadgeText}>
                    {acceptedPositions.length}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Partner disconnected warning banner */}
      {partnerDisconnected && !chatEnded && (
        <View
          style={styles.disconnectedBanner}
          accessibilityRole="alert"
          accessibilityLabel={t('partnerDisconnectedA11y')}
        >
          <Ionicons name="cloud-offline-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <ThemedText variant="bodySmall" color="inverse" style={styles.disconnectedText}>
            {t('partnerDisconnected')}
          </ThemedText>
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
            userCanModerate ? (
              <TouchableOpacity
                onPress={handleModerateChat}
                style={styles.reportButton}
                accessibilityRole="button"
                accessibilityLabel={t('moderateChatA11y')}
              >
                <Ionicons name="shield-outline" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setReportModalVisible(true)}
                style={styles.reportButton}
                accessibilityRole="button"
                accessibilityLabel={t('reportChatA11y')}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )
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
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={15}
        windowSize={11}
        initialNumToRender={20}
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
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* Special message menu button */}
            <TouchableOpacity
              ref={specialMenuBtnRef}
              style={[styles.specialMenuButton, showSpecialMenu && styles.specialMenuButtonActive]}
              onPress={handleToggleSpecialMenu}
              accessibilityRole="button"
              accessibilityLabel={t('messageMenuA11y')}
            >
              <Ionicons
                name={showSpecialMenu ? 'close' : 'add'}
                size={24}
                color={showSpecialMenu ? '#FFFFFF' : colors.title}
              />
            </TouchableOpacity>

            {/* Special menu — desktop: inline popover above button; mobile: full-screen modal */}
            {isDesktop ? (
              showSpecialMenu && (
                <>
                  <Pressable style={styles.desktopPopoverBackdrop} onPress={closeSpecialMenu} />
                  <View style={[
                    styles.desktopPopover,
                    menuBtnLayout && { left: menuBtnLayout.x, bottom: screenHeight - menuBtnLayout.y + 8 },
                  ]}>
                    <View style={styles.specialMenuPopup}>
                      {renderSpecialMenuItems()}
                    </View>
                    <View style={styles.popoverArrow} />
                  </View>
                </>
              )
            ) : (
              <Modal
                visible={showSpecialMenu}
                transparent
                animationType="fade"
                onRequestClose={closeSpecialMenu}
              >
                <View style={styles.specialMenuBackdrop}>
                  <Pressable style={{ flex: 1 }} onPress={closeSpecialMenu} />
                  <View style={[styles.specialMenuPopup, { marginBottom: Math.max(insets.bottom, 8) + 56 }]}>
                    {renderSpecialMenuItems()}
                  </View>
                </View>
              </Modal>
            )}

            <View style={styles.inputFields}>
              <TextInput
                ref={inputRef}
                style={[
                  styles.input,
                  { maxHeight: maxInputHeight },
                  Platform.OS === 'web' && webInputHeight != null && { height: Math.max(40, Math.min(webInputHeight, maxInputHeight)) },
                ]}
                value={inputText}
                onChangeText={handleTextChange}
                onContentSizeChange={Platform.OS === 'web' ? handleContentSizeChange : undefined}
                onKeyPress={isDesktop ? handleKeyPress : undefined}
                placeholder={
                  messageType === 'definition_request' ? t('placeholderDefinitionTerm') :
                  messageType === 'explain_request' ? t('placeholderExplainPosition') :
                  messageType === 'position_proposal' ? t('placeholderProposal') :
                  messageType === 'closure_proposal' ? t('placeholderClosure') :
                  t('placeholderMessage')
                }
                placeholderTextColor={colors.placeholderText}
                multiline
                numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                maxLength={messageType === 'definition_request' ? 100 : messageType === 'explain_request' ? 200 : 1000}
                maxFontSizeMultiplier={1.5}
                blurOnSubmit={false}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.sendButton,
                !inputText.trim() && messageType === 'text' && styles.sendButtonDisabled,
                messageType === 'position_proposal' && (inputText.trim() ? styles.sendButtonStatement : styles.sendButtonStatementDisabled),
                messageType === 'closure_proposal' && (inputText.trim() ? styles.sendButtonClosure : styles.sendButtonClosureDisabled),
                messageType === 'definition_request' && (inputText.trim() ? styles.sendButtonDefinition : styles.sendButtonDefinitionDisabled),
                messageType === 'explain_request' && (inputText.trim() ? styles.sendButtonExplanation : styles.sendButtonExplanationDisabled),
              ]}
              onPress={handleSend}
              disabled={!inputText.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('sendMessageA11y')}
            >
              <Ionicons
                name={
                  messageType === 'definition_request' ? 'book-outline' :
                  messageType === 'explain_request' ? 'chatbubble-ellipses-outline' :
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

      {/* Web keyboard spacer */}
      {Platform.OS === 'web' && webKeyboardHeight > 0 && (
        <View style={{ height: webKeyboardHeight }} />
      )}

      {renderLeaveConfirmModal()}
      {renderModifyModal()}

      {/* Definition respond / counter-define modal */}
      <Modal
        visible={!!definitionModalRequest}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDefinitionModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCancelDefinitionModal}
          accessibilityLabel={definitionModalMode === 'respond' ? t('respondDefinitionTitle') : t('counterDefineTitle')}
        >
          <Pressable style={styles.modifyModalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
            <View style={styles.modifyModalHeader}>
              <View style={[styles.proposalTypeBadge, { backgroundColor: colors.definitionAccent }]}>
                <Ionicons name="book-outline" size={12} color="#fff" />
                <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>{t('defineLabel')}</ThemedText>
              </View>
              <ThemedText variant="h2" color="primary" style={styles.modifyModalTitle}>
                {definitionModalMode === 'respond' ? t('respondDefinitionTitle') : t('counterDefineTitle')}
              </ThemedText>
            </View>
            <ThemedText variant="body" style={styles.definitionModalTerm}>
              {definitionModalRequest?.term}
            </ThemedText>
            <TextInput
              style={styles.modifyInput}
              value={definitionModalText}
              onChangeText={setDefinitionModalText}
              placeholder={t('placeholderDefinition')}
              placeholderTextColor={colors.placeholderText}
              multiline
              autoFocus
              maxLength={500}
              maxFontSizeMultiplier={1.5}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleCancelDefinitionModal}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
              >
                <ThemedText variant="button" color="primary" style={styles.modalCancelText}>{t('cancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.definitionSubmitButton, !definitionModalText.trim() && styles.definitionSubmitButtonDisabled]}
                onPress={handleSubmitDefinitionModal}
                disabled={!definitionModalText.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('send')}
              >
                <ThemedText variant="button" color="inverse">{t('send')}</ThemedText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Explanation respond / correct modal */}
      <Modal
        visible={!!explanationModalRequest}
        transparent
        animationType="fade"
        onRequestClose={handleCancelExplanationModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCancelExplanationModal}
          accessibilityLabel={explanationModalMode === 'explain' ? t('respondExplanationTitle') : t('correctExplanationTitle')}
        >
          <Pressable style={styles.modifyModalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
            <View style={styles.modifyModalHeader}>
              <View style={[styles.proposalTypeBadge, { backgroundColor: colors.explanationAccent }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={12} color="#fff" />
                <ThemedText variant="badge" style={styles.proposalTypeBadgeText}>{t('explainLabel')}</ThemedText>
              </View>
              <ThemedText variant="h2" color="primary" style={styles.modifyModalTitle}>
                {explanationModalMode === 'explain' ? t('respondExplanationTitle') : t('correctExplanationTitle')}
              </ThemedText>
            </View>
            <ThemedText variant="body" style={styles.definitionModalTerm}>
              {explanationModalRequest?.position}
            </ThemedText>
            <TextInput
              style={styles.modifyInput}
              value={explanationModalText}
              onChangeText={setExplanationModalText}
              placeholder={explanationModalMode === 'explain' ? t('placeholderExplanation') : t('placeholderCorrection')}
              placeholderTextColor={colors.placeholderText}
              multiline
              autoFocus
              maxLength={500}
              maxFontSizeMultiplier={1.5}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleCancelExplanationModal}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
              >
                <ThemedText variant="button" color="primary" style={styles.modalCancelText}>{t('cancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.explanationSubmitButton, !explanationModalText.trim() && styles.explanationSubmitButtonDisabled]}
                onPress={handleSubmitExplanationModal}
                disabled={!explanationModalText.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('send')}
              >
                <ThemedText variant="button" color="inverse">{t('send')}</ThemedText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : handleSubmitChatReport}
        contentType="chat_log"
        isModerating={!!moderateTarget}
      />

      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => { setActionModalVisible(false); setModerateTarget(null); setModerateRule(null); setModerateComment(null) }}
        onSubmit={handleModerateActionSubmit}
        reportType={moderateTarget?.type}
        rule={moderateRule}
      />

      <ChatSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        acceptedPositions={acceptedPositions}
        definitions={flatDefinitions}
        explanations={flatExplanations}
        currentUserId={user?.id}
        otherUser={otherUser}
        onQuotePosition={handleQuoteAgreedPosition}
        onQuoteDefinition={handleQuoteDefinition}
        onQuoteExplanation={handleQuoteExplanation}
      />

      <TextSelectionModal
        visible={textSelectionVisible}
        onClose={() => { setTextSelectionVisible(false); setTextSelectionMessage(null) }}
        messageText={textSelectionMessage ? stripQuoteMarkup(textSelectionMessage.content || '') : ''}
        onConfirm={handleQuotePartial}
      />

      <ReconsiderModal {...toxicity.modalProps} />
      <GlossaryDrawer {...glossaryDrawer} showActions={false} />
    </Wrapper>
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
  sidebarToggle: {
    padding: 6,
    position: 'relative',
  },
  sidebarBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.agreeBubble,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  sidebarBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
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
  messagesList: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  highlightedMessage: {
    backgroundColor: 'rgba(92, 0, 92, 0.1)',
    borderRadius: 12,
  },
  quoteButtonsColumn: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 4,
    paddingBottom: 2,
  },
  quoteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.buttonDefault,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteButtonIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 22,
  },
  ownMessageWrapper: {
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  ownMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  ownReactionBadgesRow: {
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  otherMessageWrapper: {
    marginBottom: 8,
  },
  otherMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  otherReactionsRow: {
    marginTop: 4,
    marginLeft: 36,
    alignSelf: 'flex-start',
  },
  otherReactionBadgesRow: {
    marginLeft: 36,
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
  definitionCardWrapper: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  definitionText: {
    lineHeight: 20,
    marginTop: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.navBackground,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
      default: { boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.1)' },
    }),
  },
  inputFields: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    minHeight: 40,
    color: colors.text,
    ...(Platform.OS !== 'web' && { textAlignVertical: 'top' }),
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
  sendButtonDefinition: {
    backgroundColor: colors.definitionAccent,
  },
  sendButtonDefinitionDisabled: {
    backgroundColor: colors.definitionAccent + '40',
  },
  sendButtonExplanation: {
    backgroundColor: colors.explanationAccent,
  },
  sendButtonExplanationDisabled: {
    backgroundColor: colors.explanationAccent + '40',
  },
  specialMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.buttonDefault,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  specialMenuButtonActive: {
    backgroundColor: colors.primarySurface,
  },
  specialMenuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  specialMenuPopup: {
    marginLeft: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 8,
    ...Shadows.elevated,
    minWidth: 260,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
    }),
  },
  // Desktop popover: positioned absolutely above the + button
  desktopPopoverBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  desktopPopover: {
    position: 'fixed',
    zIndex: 1000,
  },
  popoverArrow: {
    width: 12,
    height: 12,
    backgroundColor: colors.cardBackground,
    transform: [{ rotate: '45deg' }],
    marginLeft: 20,
    marginTop: -6,
    ...Shadows.card,
  },
  specialMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  specialMenuItemSelected: {
    backgroundColor: colors.buttonDefault,
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
    color: colors.secondaryText,
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
  disconnectedBanner: {
    backgroundColor: colors.warningBubble,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectedText: {
    flex: 1,
    fontWeight: '500',
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
  proposalCardLabelButton: {
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  proposalCardLabelText: {
    color: '#1a1a1a',
    fontWeight: '700',
  },
  proposalCardLabelTextInverse: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  // Definition modal styles
  definitionModalTerm: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  definitionSubmitButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: colors.definitionAccent,
    alignItems: 'center',
  },
  definitionSubmitButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
  explanationSubmitButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: colors.explanationAccent,
    alignItems: 'center',
  },
  explanationSubmitButtonDisabled: {
    backgroundColor: colors.cardBorder,
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

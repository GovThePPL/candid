import { StyleSheet, View, TouchableOpacity, Platform, Dimensions, Alert, BackHandler, ScrollView, RefreshControl } from 'react-native'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useIsFocused } from '@react-navigation/native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { SemanticColors, BrandColor, OnBrandColors } from '../constants/Colors'
import { Shadows } from '../constants/Theme'
import { useThemeColors } from '../hooks/useThemeColors'
import useIsDesktop from '../hooks/useIsDesktop'
import useCardHandlers from '../hooks/useCardHandlers'
import useModerateChecker from '../hooks/useModerateChecker'
import api from '../lib/api'
import ThemedText from './ThemedText'
import { useToast } from './Toast'
import { useAuth, useChatContext } from '../contexts/UserContext'
import { useLocationSession } from '../contexts/LocationSessionContext'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'
import {
  PositionCard,
  ChatRequestCard,
  SurveyCard,
  DemographicCard,
  KudosCard,
  PairwiseCard,
  BanNotificationCard,
  PositionRemovedCard,
  DiagnosticsConsentCard,
  BridgingKudosCard,
} from './cards'
import CommunityRulesModal from './CommunityRulesModal'
import InfoModal from './InfoModal'
import { SkeletonPulse, SkeletonBox, SkeletonCircle, SkeletonLine } from './Skeleton'
import ChattingListExplanationModal from './ChattingListExplanationModal'
import ChatRequestIndicator from './ChatRequestIndicator'
import ReportModal from './ReportModal'
import ModerationActionModal from './ModerationActionModal'
import GlossaryDrawer from './GlossaryDrawer'
import SessionInfoCard from './SessionInfoCard'
import { useGlossaryDrawer } from '../hooks/useGlossaryDrawer'
import { Ionicons } from '@expo/vector-icons'

// AsyncStorage keys for tutorial tracking
const TUTORIAL_CHATTING_LIST_KEY = '@tutorial_seen_chatting_list'

// Configuration for continuous card loading
const INITIAL_FETCH_SIZE = 20
const REFETCH_THRESHOLD = 5  // Fetch more when this many cards remain
const REFETCH_SIZE = 15

// Chat request timeout duration in milliseconds (2 minutes)
const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

// How long after last swipe to consider user "actively swiping" (15 seconds)
const SWIPING_ACTIVITY_WINDOW_MS = 15 * 1000

// How long to wait before promoting a back-card chat request to top (10 seconds)
const PROMOTION_DELAY_MS = 10 * 1000

const SCREEN_HEIGHT = Dimensions.get('window').height

// Desktop card scaling: cards render at this width and scale down to fit narrower panels
const CARD_REFERENCE_WIDTH = 380

export function CardQueueSkeleton({ styles, colors, isDesktop }) {
  return (
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      <View style={[
        styles.cardContainer,
        isDesktop && styles.cardContainerDesktop,
      ]}>
        <View style={styles.cardStack}>
          <View style={styles.currentCard}>
            <SkeletonPulse style={styles.skeletonCard}>
              {/* Header row — badge left, circle button right */}
              <View style={styles.skeletonHeaderRow}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SkeletonBox width={36} height={22} borderRadius={10} />
                  <SkeletonLine width={70} height={14} />
                </View>
                <SkeletonCircle size={42} />
              </View>
              {/* Statement — centered, matching paddingVertical: 40 */}
              <View style={styles.skeletonStatementArea}>
                <SkeletonLine width="85%" height={16} />
                <SkeletonLine width="100%" height={16} />
                <SkeletonLine width="60%" height={16} />
              </View>
              {/* Footer — flag | avatar+name | add, with top border */}
              <View style={styles.skeletonFooterRow}>
                <SkeletonCircle size={42} />
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <SkeletonCircle size={36} />
                  <SkeletonLine width={60} height={10} />
                </View>
                <SkeletonCircle size={42} />
              </View>
            </SkeletonPulse>
          </View>
        </View>
      </View>
      {isDesktop && <View style={styles.desktopActions} />}
    </View>
  )
}

export default function CardQueueContent() {
  const router = useRouter()
  const { t } = useTranslation('cards')
  const { user } = useAuth()
  const { incomingChatRequest, clearIncomingChatRequest, restoreIncomingChatRequest, pendingChatRequest: pendingChatCtx, clearPendingChatRequest } = useChatContext()
  const { selectedSession, selectedLocation, effectiveStage, viewingStage, sessionData, openSessionSelector, openSessionOverview } = useLocationSession()

  // Derive phase and archived state from effective stage
  const STAGE_TO_PHASE = {
    proposal_issue: 'proposal', proposal_qualify: 'proposal', proposal_stakeholders: 'proposal',
    opinion_discussion: 'opinion', reflection_curation: 'opinion', reflection_proposals: 'opinion',
    consensus: 'consensus',
  }
  const phase = effectiveStage ? STAGE_TO_PHASE[effectiveStage] : null
  const isArchived = viewingStage != null
  const isFocused = useIsFocused()
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [createInitialStatement, setCreateInitialStatement] = useState('')
  const [showAddPositionModal, setShowAddPositionModal] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Ring buffer: 4 fixed slots with stable keys to prevent remounting
  const [slotCards, setSlotCards] = useState([null, null, null, null])
  const [headSlotJS, setHeadSlotJS] = useState(0)
  const headSlot = useSharedValue(0)
  const headSlotJSRef = useRef(0)

  const showToast = useToast()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [glossaryDrawer, onGlossaryTermPress] = useGlossaryDrawer()

  // Desktop card scaling: measure available width, scale card to fit
  const [desktopCardAreaWidth, setDesktopCardAreaWidth] = useState(null)
  const handleCardAreaLayout = useCallback((e) => {
    setDesktopCardAreaWidth(e.nativeEvent.layout.width)
  }, [])
  const cardScale = isDesktop && desktopCardAreaWidth
    ? Math.min(1, desktopCardAreaWidth / CARD_REFERENCE_WIDTH)
    : 1

  // Tutorial modal state (frontend-only, uses AsyncStorage)
  const [showChattingListModal, setShowChattingListModal] = useState(false)
  const hasCheckedTutorialsRef = useRef(false)
  const seenChattingListTutorialRef = useRef(false)

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportPositionId, setReportPositionId] = useState(null)

  // Moderation state
  const checkModerateScope = useModerateChecker()
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  // Shared value for back card transition
  const backCardProgress = useSharedValue(0)

  // Ref to current card for keyboard-triggered swipes
  const currentCardRef = useRef(null)

  // Track fetching state and seen card IDs to prevent duplicates
  const isFetchingRef = useRef(false)
  const seenCardIdsRef = useRef(new Set())

  // Swiping activity tracking for chat request delivery mode
  const lastSwipeTimeRef = useRef(0)
  const isActivelySwiping = useCallback(() => {
    return Date.now() - lastSwipeTimeRef.current < SWIPING_ACTIVITY_WINDOW_MS
  }, [])

  // Slide-in animation state for incoming chat requests
  const slideInAnim = useSharedValue(0)
  const [slidingInCard, setSlidingInCard] = useState(null)
  const isSlidingIn = useSharedValue(0)

  // Create card slide-in animation
  const createSlideAnim = useSharedValue(0)

  // Promotion timer: promotes back-card chat request to top after delay
  const promotionTimerRef = useRef(null)

  // Expiration timers for chat request cards
  const expirationTimerRef = useRef(null)

  // Local cache of chatting list: positionId → { id (chattingListId), hasPendingRequests }
  const chattingListMapRef = useRef(new Map())

  // Load tutorial state from AsyncStorage on mount
  useEffect(() => {
    const loadTutorialState = async () => {
      if (hasCheckedTutorialsRef.current) return
      hasCheckedTutorialsRef.current = true
      try {
        const chattingListSeen = await AsyncStorage.getItem(TUTORIAL_CHATTING_LIST_KEY)
        seenChattingListTutorialRef.current = chattingListSeen === 'true'
      } catch (err) {
        console.error('Failed to load tutorial state:', err)
      }
    }
    loadTutorialState()
  }, [])

  // Get unique key for a card to track duplicates
  const getCardKey = useCallback((card) => {
    if (!card) return null
    if (card.type === 'demographic') return `demographic-${card.data?.field}`
    // For chatting list cards, use chattingListId to ensure uniqueness
    if (card.data?.source === 'chatting_list') {
      return `chatting_list-${card.data?.chattingListId}`
    }
    // Pairwise cards have no data.id — key by the option pair
    if (card.type === 'pairwise') {
      const ids = [card.data?.optionA?.id, card.data?.optionB?.id].sort()
      return `pairwise-${ids[0]}-${ids[1]}`
    }
    return `${card.type}-${card.data?.id}`
  }, [])

  // Enrich position cards with local chatting list state
  const enrichWithChattingList = useCallback((cards) => {
    const map = chattingListMapRef.current
    if (map.size === 0) return cards
    return cards.map(card => {
      if (card.type !== 'position' || !card.data?.id) return card
      const clInfo = map.get(card.data.id)
      if (clInfo) {
        return {
          ...card,
          data: {
            ...card.data,
            source: 'chatting_list',
            chattingListId: clInfo.id,
            hasPendingRequests: clInfo.hasPendingRequests,
          }
        }
      }
      return card
    })
  }, [])

  // Refresh chatting list from API and update local cache + map
  const refreshChattingList = useCallback(async () => {
    try {
      const chattingList = await api.chattingList.getList()
      if (chattingList) {
        const map = chattingListMapRef.current
        map.clear()
        for (const item of chattingList) {
          map.set(item.positionId, {
            id: item.id,
            hasPendingRequests: (item.pendingRequestCount || 0) > 0,
          })
        }
        if (user?.id) {
          await CacheManager.set(CacheKeys.chattingList(user.id), chattingList)
        }
      }
    } catch {
      // Silently fail — chatting list is supplementary
    }
  }, [user?.id])

  // Fetch cards and append to queue (avoiding duplicates)
  const fetchMoreCards = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      if (isInitial) {
        setInitialLoading(true)
        setError(null)
      }

      // Check if chatting list cache is stale
      const chattingListCacheKey = user?.id ? CacheKeys.chattingList(user.id) : null
      let needsChattingListFetch = true

      if (chattingListCacheKey) {
        const cachedChattingList = await CacheManager.get(chattingListCacheKey)
        if (cachedChattingList && !CacheManager.isStale(cachedChattingList, CacheDurations.CHATTING_LIST)) {
          // Rebuild map from cache if map is empty (e.g., first load with warm cache)
          if (chattingListMapRef.current.size === 0 && cachedChattingList.data) {
            for (const item of cachedChattingList.data) {
              chattingListMapRef.current.set(item.positionId, {
                id: item.id,
                hasPendingRequests: (item.pendingRequestCount || 0) > 0,
              })
            }
          }
          needsChattingListFetch = false
        }
      }

      // Fetch card queue (always) and chatting list (only if stale) in parallel
      const fetchSize = isInitial ? INITIAL_FETCH_SIZE : REFETCH_SIZE
      const sessionId = selectedSession && selectedSession !== 'all' ? selectedSession : null
      const fetches = [api.cards.getCardQueue(fetchSize, sessionId, phase, isArchived)]
      if (needsChattingListFetch) {
        fetches.push(refreshChattingList())
      }

      const [response] = await Promise.all(fetches)

      const newCards = response || []

      // Filter out cards we've already seen
      const uniqueNewCards = enrichWithChattingList(newCards.filter(card => {
        const key = getCardKey(card)
        if (!key || seenCardIdsRef.current.has(key)) return false
        seenCardIdsRef.current.add(key)
        return true
      }))

      if (isInitial) {
        setCards(uniqueNewCards)
        setCurrentIndex(0)
      } else {
        // Append new cards to existing queue
        setCards(prev => [...prev, ...uniqueNewCards])
      }
    } catch (err) {
      console.error('Card fetch error:', err)
      if (isInitial) {
        setError(err.message || t('failedLoadCards'))
      }
    } finally {
      isFetchingRef.current = false
      if (isInitial) {
        setInitialLoading(false)
      }
    }
  }, [getCardKey, user?.id, refreshChattingList, selectedSession, phase, isArchived])

  // Initial fetch + reset when session or phase changes
  useEffect(() => {
    seenCardIdsRef.current.clear()
    setCards([])
    setCurrentIndex(0)
    setSlotCards([null, null, null, null])
    headSlotJSRef.current = 0
    headSlot.value = 0
    setHeadSlotJS(0)
    fetchMoreCards(true)
  }, [selectedSession, phase, isArchived])

  // Heartbeat: send presence signal every 30s while on card queue
  useEffect(() => {
    const sendHeartbeat = () => {
      api.users.heartbeat().catch(() => {})
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30000)
    return () => clearInterval(interval)
  }, [])

  // Calculate remaining cards
  const remainingCards = cards.length - currentIndex

  // Background fetch when running low on cards
  useEffect(() => {
    if (remainingCards <= REFETCH_THRESHOLD && remainingCards > 0 && !isFetchingRef.current) {
      fetchMoreCards(false)
    }
  }, [remainingCards, fetchMoreCards])

  const currentCard = slotCards[headSlotJS]

  const handleCloseChattingListModal = useCallback(async () => {
    setShowChattingListModal(false)
    seenChattingListTutorialRef.current = true
    try {
      await AsyncStorage.setItem(TUTORIAL_CHATTING_LIST_KEY, 'true')
    } catch (err) {
      console.error('Failed to save chatting list tutorial state:', err)
    }
  }, [])

  // Refs for stable callbacks used in reanimated worklet completions
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex
  const cardsLengthRef = useRef(cards.length)
  cardsLengthRef.current = cards.length
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  const advanceIndex = useCallback(() => {
    const oldHead = headSlotJSRef.current
    const newHead = (oldHead + 1) % 4
    const newCurrentIndex = currentIndexRef.current + 1

    const newReserveCard = cardsRef.current[newCurrentIndex + 3] || null
    // Load next card into the old head slot (now reserve at opacity 0)
    setSlotCards(prev => {
      const next = [...prev]
      next[oldHead] = newReserveCard
      return next
    })

    // Sync JS-side refs and React state (headSlot.value already set on UI thread)
    headSlotJSRef.current = newHead
    setHeadSlotJS(newHead)
    setCurrentIndex(newCurrentIndex)

    if (newCurrentIndex >= cardsLengthRef.current - 1) {
      fetchMoreCards(false)
    }
  }, [fetchMoreCards])

  // Sync slotCards from cards array on external mutations (chatting list, slide-in, expiration)
  useEffect(() => {
    const head = headSlotJSRef.current
    const ci = currentIndexRef.current
    setSlotCards(prev => {
      const next = [...prev]
      for (let offset = 0; offset < 4; offset++) {
        const slotIdx = (head + offset) % 4
        const cardIdx = ci + offset
        next[slotIdx] = cards[cardIdx] || null
      }
      return next
    })
  }, [cards])

  const goToNextCard = useCallback(() => {
    // Track swiping activity for chat request delivery mode
    lastSwipeTimeRef.current = Date.now()

    // Clear promotion timer - user swiped so the back card will naturally advance
    if (promotionTimerRef.current) {
      clearTimeout(promotionTimerRef.current)
      promotionTimerRef.current = null
    }

    // Clear expiration timer for the current card (user is moving on)
    if (expirationTimerRef.current) {
      clearTimeout(expirationTimerRef.current)
      expirationTimerRef.current = null
    }

    // Animate the back cards forward, then rotate the ring buffer.
    // headSlot must update atomically with backCardProgress reset on the UI thread
    // so there's no frame where progress=0 with the old head (which would snap back).
    backCardProgress.value = withTiming(1, { duration: 200 }, (finished) => {
      'worklet'
      if (finished) {
        headSlot.value = (headSlot.value + 1) % 4
        backCardProgress.value = 0
        runOnJS(advanceIndex)()
      }
    })
  }, [advanceIndex])

  // Card-type-specific response handlers (API calls + advance)
  const {
    pendingChatRequest,
    handleAgree, handleDisagree, handlePass, handleChatRequest,
    handleSubmitReport, handleDismissRemoval, handleAdoptPosition,
    handleAcceptChat, handleDeclineChat,
    handleSurveyResponse, handleSurveySkip,
    handleDemographicResponse, handleDemographicSkip,
    handleSendKudos, handleDismissKudos, handleAcknowledgeKudos,
    handlePairwiseResponse, handlePairwiseSkip,
    handleDismissBridgingKudos,
    handleDiagnosticsAccept, handleDiagnosticsDecline,
  } = useCardHandlers({ currentCard, goToNextCard })

  // Complete slide-in: insert card into queue and clear overlay (React state only).
  // Shared values are already reset on the UI thread before this runs.
  const completeSlideIn = useCallback((card) => {
    setSlidingInCard(null)
    setCards(prev => {
      const next = [...prev]
      next.splice(currentIndexRef.current, 0, card)
      return next
    })
  }, [])

  // Trigger slide-in animation to insert a card at the current position (pushes queue back)
  const triggerSlideIn = useCallback((card) => {
    setSlidingInCard(card)
    isSlidingIn.value = 1
    slideInAnim.value = 0
    slideInAnim.value = withTiming(1, { duration: 300 }, (finished) => {
      if (finished) {
        // Reset animation state on UI thread BEFORE triggering React re-render.
        // This prevents the newly-inserted card from briefly appearing at the
        // "shifted back" position (scale 0.96, translateY 24) due to
        // currentCardSlideStyle still reading stale shared values.
        isSlidingIn.value = 0
        slideInAnim.value = 0
        runOnJS(completeSlideIn)(card)
      }
    })
  }, [completeSlideIn])

  // Consume incoming chat request from context — only when this tab is focused.
  // Tab screens stay mounted across tab switches, so without this guard the card queue
  // would immediately consume and clear the request before the Header indicator can show it.
  useEffect(() => {
    if (!incomingChatRequest || !isFocused) return

    const cardKey = `chat_request-${incomingChatRequest?.data?.id}`

    // Deduplication: skip if already seen
    if (seenCardIdsRef.current.has(cardKey)) {
      clearIncomingChatRequest()
      return
    }

    // Mark as seen
    seenCardIdsRef.current.add(cardKey)

    if (isActivelySwiping()) {
      // User is actively swiping: insert as the next card (back card)
      setCards(prev => {
        const next = [...prev]
        next.splice(currentIndex + 1, 0, incomingChatRequest)
        return next
      })

      // Start promotion timer: if user doesn't swipe to it in 10s, slide it to top
      if (promotionTimerRef.current) clearTimeout(promotionTimerRef.current)
      promotionTimerRef.current = setTimeout(() => {
        promotionTimerRef.current = null
        // Check if the chat request is still the back card (user hasn't swiped to it)
        setCards(prev => {
          const backIdx = currentIndex + 1
          if (backIdx < prev.length && prev[backIdx]?.type === 'chat_request' && prev[backIdx]?.data?.id === incomingChatRequest?.data?.id) {
            // Remove from back position and slide in at top
            const next = [...prev]
            next.splice(backIdx, 1)
            // Trigger slide-in will insert at currentIndex
            setTimeout(() => triggerSlideIn(incomingChatRequest), 0)
            return next
          }
          return prev
        })
      }, PROMOTION_DELAY_MS)
    } else {
      // User is NOT actively swiping: slide in from top
      triggerSlideIn(incomingChatRequest)
    }

    clearIncomingChatRequest()
  }, [incomingChatRequest, isFocused, clearIncomingChatRequest, isActivelySwiping, currentIndex, triggerSlideIn])

  // Chat request expiration: auto-dismiss when a chat request card is current
  useEffect(() => {
    // Clear previous timer
    if (expirationTimerRef.current) {
      clearTimeout(expirationTimerRef.current)
      expirationTimerRef.current = null
    }

    if (!currentCard || currentCard.type !== 'chat_request') return

    const createdTime = currentCard.data?.createdTime
    if (!createdTime) return

    const expiresAt = new Date(createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS
    const remaining = expiresAt - Date.now()

    if (remaining <= 0) {
      // Already expired - dismiss immediately with animation
      if (currentCardRef.current?.swipeDown) {
        currentCardRef.current.swipeDown()
      } else {
        api.chat.respondToRequest(currentCard.data.id, 'dismissed').catch(() => {})
        goToNextCard()
      }
      return
    }

    expirationTimerRef.current = setTimeout(() => {
      expirationTimerRef.current = null
      // Auto-dismiss: trigger swipe down animation which calls onDecline -> goToNextCard
      if (currentCardRef.current?.swipeDown) {
        currentCardRef.current.swipeDown()
      } else {
        // Fallback: dismiss via API and advance manually
        api.chat.respondToRequest(currentCard.data.id, 'dismissed').catch(() => {})
        goToNextCard()
      }
    }, remaining)

    return () => {
      if (expirationTimerRef.current) {
        clearTimeout(expirationTimerRef.current)
        expirationTimerRef.current = null
      }
    }
  }, [currentIndex, currentCard?.type, currentCard?.data?.id])

  // Expiration for chat request cards that are still in the back of the queue
  useEffect(() => {
    const timers = []
    cards.forEach((card, idx) => {
      // Only for chat request cards behind the current card
      if (idx <= currentIndex || card.type !== 'chat_request' || !card.data?.createdTime) return

      const expiresAt = new Date(card.data.createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS
      const remaining = expiresAt - Date.now()

      if (remaining <= 0) {
        // Already expired - remove silently
        api.chat.respondToRequest(card.data.id, 'dismissed').catch(() => {})
        setCards(prev => prev.filter((_, i) => i !== idx))
      } else {
        const timer = setTimeout(() => {
          api.chat.respondToRequest(card.data.id, 'dismissed').catch(() => {})
          setCards(prev => prev.filter(c => c.data?.id !== card.data.id || c.type !== 'chat_request'))
        }, remaining)
        timers.push(timer)
      }
    })

    return () => timers.forEach(t => clearTimeout(t))
  }, [cards.length, currentIndex])

  // Clean up timers on unmount and restore unconsumed chat requests to context
  useEffect(() => {
    return () => {
      if (promotionTimerRef.current) clearTimeout(promotionTimerRef.current)
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current)

      // Restore any unconsumed chat request to context so the Header indicator shows it
      const remaining = cardsRef.current.slice(currentIndexRef.current)
      const pending = remaining.find(c => c.type === 'chat_request')
      if (pending) {
        const expiresAt = new Date(pending.data?.createdTime).getTime() + CHAT_REQUEST_TIMEOUT_MS
        if (expiresAt > Date.now()) {
          restoreIncomingChatRequest(pending)
        }
      }
    }
  }, [])

  const handleReport = useCallback(() => {
    setReportPositionId(currentCard?.data?.id)
    setReportModalVisible(true)
  }, [currentCard])

  const handleModeratePosition = useCallback(() => {
    setModerateTarget({ type: 'position', id: currentCard?.data?.id })
    setReportModalVisible(true)
  }, [currentCard])

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
      goToNextCard()
    } catch (err) {
      if (err?.status === 403) {
        Alert.alert(t('discuss:moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t, goToNextCard])

  const handleAddPosition = useCallback(() => {
    if (currentCard?.type !== 'position') return
    setShowAddPositionModal(true)
  }, [currentCard])

  const handleAddPositionAdopt = useCallback(() => {
    setShowAddPositionModal(false)

    // Wait for InfoModal fade-out (~300ms) before swiping the card away
    setTimeout(() => {
      const cardRef = currentCardRef.current
      if (cardRef?.swipeRightWithPlus) {
        cardRef.swipeRightWithPlus()
      } else {
        goToNextCard()
      }
      handleAdoptPosition()
    }, 350)
  }, [goToNextCard, handleAdoptPosition])

  const handleAddPositionModify = useCallback(() => {
    setShowAddPositionModal(false)
    if (!selectedSession) { openSessionSelector(); return }
    const statement = currentCard?.data?.statement || ''
    setCreateInitialStatement(statement)
    setShowCreateCard(true)
    createSlideAnim.value = 0
    createSlideAnim.value = withTiming(1, { duration: 300 })
  }, [currentCard, createSlideAnim, selectedSession, openSessionSelector])

  const handleAddPositionCreate = useCallback(() => {
    setShowAddPositionModal(false)
    if (!selectedSession) { openSessionSelector(); return }
    setCreateInitialStatement('')
    setShowCreateCard(true)
    createSlideAnim.value = 0
    createSlideAnim.value = withTiming(1, { duration: 300 })
  }, [createSlideAnim, selectedSession, openSessionSelector])

  // Retry handler - resets state and fetches fresh
  const handleRetry = useCallback(() => {
    seenCardIdsRef.current.clear()
    setCards([])
    setCurrentIndex(0)
    setSlotCards([null, null, null, null])
    headSlotJSRef.current = 0
    headSlot.value = 0
    setHeadSlotJS(0)
    fetchMoreCards(true)
  }, [fetchMoreCards])

  // Create mode: adopt a similar position (from NLP suggestions)
  // Unmount the card immediately, then animate stack back (no slide-out)
  const handleCreateAdopt = useCallback(async (positionId) => {
    try {
      await api.positions.adopt(positionId)
      setShowCreateCard(false)
      setCreateInitialStatement('')
      createSlideAnim.value = withTiming(0, { duration: 300 })
      showToast(t('positionAdopted'), { position: 'top' })
      handleRetry()
    } catch (err) {
      console.error('Failed to adopt position:', err)
      showToast(t('errorAdoptFailed'), { position: 'top' })
    }
  }, [showToast, t, createSlideAnim, handleRetry])

  // Create mode: slide card back up to dismiss
  const handleCreateCancel = useCallback(() => {
    createSlideAnim.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(setShowCreateCard)(false)
        runOnJS(setCreateInitialStatement)('')
      }
    })
  }, [createSlideAnim])

  // Back gesture/button dismisses the create-position card
  useEffect(() => {
    if (!showCreateCard || Platform.OS === 'web') return
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCreateCancel()
      return true
    })
    return () => handler.remove()
  }, [showCreateCard, handleCreateCancel])

  // Handle removing a position from the chatting list
  const handleRemoveFromChattingList = useCallback(async () => {
    if (currentCard?.type !== 'position' || !currentCard?.data?.chattingListId) return
    // Save state for revert
    const prevChattingListId = currentCard.data.chattingListId
    const prevSource = currentCard.data.source
    const prevMapEntry = chattingListMapRef.current.get(currentCard.data.id)

    // Optimistic update
    chattingListMapRef.current.delete(currentCard.data.id)
    setCards(prev => prev.map((card, idx) => {
      if (idx === currentIndex && card.type === 'position') {
        return {
          ...card,
          data: {
            ...card.data,
            source: null,
            chattingListId: null,
          }
        }
      }
      return card
    }))

    try {
      await api.chattingList.remove(prevChattingListId)
      if (user?.id) CacheManager.invalidate(CacheKeys.chattingList(user.id))
    } catch (err) {
      console.error('Failed to remove from chatting list:', err)
      // Revert
      if (prevMapEntry) chattingListMapRef.current.set(currentCard.data.id, prevMapEntry)
      setCards(prev => prev.map((card, idx) => {
        if (idx === currentIndex && card.type === 'position') {
          return {
            ...card,
            data: {
              ...card.data,
              source: prevSource,
              chattingListId: prevChattingListId,
            }
          }
        }
        return card
      }))
      showToast(t('errorChattingListFailed'), { position: 'top' })
    }
  }, [currentCard, currentIndex, user?.id, showToast, t])

  // Handle adding a position to the chatting list
  const handleAddToChattingList = useCallback(async () => {
    if (currentCard?.type !== 'position' || !currentCard?.data?.id) return

    // If already in chatting list, don't try to add again
    if (currentCard?.data?.source === 'chatting_list') return

    // Show tutorial on first use
    if (!seenChattingListTutorialRef.current) {
      setShowChattingListModal(true)
    }

    // Optimistic update
    setCards(prev => prev.map((card, idx) => {
      if (idx === currentIndex && card.type === 'position') {
        return {
          ...card,
          data: {
            ...card.data,
            source: 'chatting_list',
          }
        }
      }
      return card
    }))

    try {
      const result = await api.chattingList.addPosition(currentCard.data.id)
      // Update local map and card with actual ID
      if (result?.id) {
        chattingListMapRef.current.set(currentCard.data.id, {
          id: result.id,
          hasPendingRequests: false,
        })
        setCards(prev => prev.map((card, idx) => {
          if (idx === currentIndex && card.type === 'position') {
            return {
              ...card,
              data: {
                ...card.data,
                chattingListId: result.id,
              }
            }
          }
          return card
        }))
      }
      if (user?.id) CacheManager.invalidate(CacheKeys.chattingList(user.id))
    } catch (err) {
      console.error('Failed to add to chatting list:', err)
      // Revert
      setCards(prev => prev.map((card, idx) => {
        if (idx === currentIndex && card.type === 'position') {
          return {
            ...card,
            data: {
              ...card.data,
              source: null,
              chattingListId: null,
            }
          }
        }
        return card
      }))
      showToast(t('errorChattingListFailed'), { position: 'top' })
    }
  }, [currentCard, currentIndex, user?.id, showToast, t])

  // Keyboard support for desktop PC only
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktop) return

    const handleKeyDown = (event) => {
      // Don't capture if user is typing in an input or contenteditable (WYSIWYG)
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) {
        return
      }

      // Use the card ref to trigger swipe animations
      const cardRef = currentCardRef.current

      switch (event.key) {
        case 'd':
        case 'D':
          event.preventDefault()
          if (cardRef?.swipeRight) {
            cardRef.swipeRight()
          }
          break
        case 'a':
        case 'A':
          event.preventDefault()
          if (cardRef?.swipeLeft) {
            cardRef.swipeLeft()
          }
          break
        case 's':
        case 'S':
          event.preventDefault()
          if (cardRef?.swipeDown) {
            cardRef.swipeDown()
          }
          break
        case 'w':
        case 'W':
          event.preventDefault()
          if (cardRef?.swipeUp && currentCard?.type === 'position' && !pendingChatRequest) {
            cardRef.swipeUp()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentCard, pendingChatRequest, isDesktop])

  // Per-slot animated styles for the ring buffer (runs on UI thread).
  // Each slot's style is inlined so Reanimated can directly track shared value reads.
  // Role rest positions: current(0), back(1), third(2), reserve(3)
  //   opacity:    [1,    1,    0.85, 0   ]
  //   scale:      [1,    0.96, 0.92, 0.88]
  //   translateY: [0,    24,   48,   72  ]
  //   zIndex:     [2,    1,    0,    -1  ]

  const makeSlotStyle = (slotIndex) => useAnimatedStyle(() => {
    const role = ((slotIndex - headSlot.value) % 4 + 4) % 4
    const progress = backCardProgress.value
    // Combined push-back from chat request slide-in or create card slide-in
    const pushBack = Math.max(isSlidingIn.value ? slideInAnim.value : 0, createSlideAnim.value)

    // Role 0: current card — position controlled by SwipeableCard gesture
    if (role === 0) {
      if (pushBack > 0) {
        return {
          zIndex: 2, opacity: 1,
          transform: [
            { scale: interpolate(pushBack, [0, 1], [1, 0.96]) },
            { translateY: interpolate(pushBack, [0, 1], [0, 24]) },
          ],
        }
      }
      return { zIndex: 2, opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] }
    }

    // Role 1: back card
    if (role === 1) {
      const baseScale = interpolate(progress, [0, 1], [0.96, 1])
      const baseTranslateY = interpolate(progress, [0, 1], [24, 0])
      if (pushBack > 0) {
        return {
          zIndex: 1,
          opacity: 1,
          transform: [
            { scale: baseScale + interpolate(pushBack, [0, 1], [0, -0.04]) },
            { translateY: baseTranslateY + interpolate(pushBack, [0, 1], [0, 24]) },
          ],
        }
      }
      return {
        zIndex: 1, opacity: 1,
        transform: [{ scale: baseScale }, { translateY: baseTranslateY }],
      }
    }

    // Role 2: third card
    if (role === 2) {
      return {
        zIndex: 0,
        opacity: interpolate(progress, [0, 1], [0.85, 1]),
        transform: [
          { scale: interpolate(progress, [0, 1], [0.92, 0.96]) },
          { translateY: interpolate(progress, [0, 1], [48, 24]) },
        ],
      }
    }

    // Role 3: reserve (hidden)
    return {
      zIndex: -1,
      opacity: interpolate(progress, [0, 1], [0, 0.85]),
      transform: [
        { scale: interpolate(progress, [0, 1], [0.88, 0.92]) },
        { translateY: interpolate(progress, [0, 1], [72, 48]) },
      ],
    }
  })

  const slotStyle0 = makeSlotStyle(0)
  const slotStyle1 = makeSlotStyle(1)
  const slotStyle2 = makeSlotStyle(2)
  const slotStyle3 = makeSlotStyle(3)
  const slotStyles = [slotStyle0, slotStyle1, slotStyle2, slotStyle3]

  const slideInCardStyle = useAnimatedStyle(() => ({
    zIndex: 3,
    transform: [
      { translateY: interpolate(slideInAnim.value, [0, 1], [-SCREEN_HEIGHT, 0]) },
    ],
  }))

  const createCardSlideStyle = useAnimatedStyle(() => ({
    zIndex: 3,
    transform: [
      { translateY: interpolate(createSlideAnim.value, [0, 1], [-SCREEN_HEIGHT, 0]) },
    ],
  }))

  // Archived handler: show toast and advance to next card
  const archivedHandler = useCallback(() => {
    showToast(t('archivedStageNoActions'), { position: 'top' })
    goToNextCard()
  }, [showToast, t, goToNextCard])

  const renderCard = (card, isBackCard = false) => {
    if (!card) return null

    switch (card.type) {
      case 'position':
        const isFromChattingList = card.data?.source === 'chatting_list'
        const cardCanModerate = checkModerateScope(card.data?.location?.id, card.data?.session?.id)
        return (
          <PositionCard
            ref={isBackCard ? undefined : currentCardRef}
            position={card.data}
            onAgree={isBackCard ? undefined : (isArchived ? archivedHandler : handleAgree)}
            onDisagree={isBackCard ? undefined : (isArchived ? archivedHandler : handleDisagree)}
            onPass={isBackCard ? undefined : (isArchived ? archivedHandler : handlePass)}
            onChatRequest={isBackCard || pendingChatRequest || isArchived ? undefined : handleChatRequest}
            onReport={isBackCard ? undefined : handleReport}
            onModerate={isBackCard ? undefined : handleModeratePosition}
            canModerate={cardCanModerate}
            onAddPosition={isBackCard ? undefined : (isArchived ? archivedHandler : handleAddPosition)}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

            isFromChattingList={isFromChattingList}
            hasPendingRequests={card.data?.hasPendingRequests || false}
            onRemoveFromChattingList={isArchived ? archivedHandler : handleRemoveFromChattingList}
            onAddToChattingList={isArchived ? archivedHandler : handleAddToChattingList}
            onTermPress={onGlossaryTermPress}
            disabled={isArchived}
            onBadgePress={openSessionOverview}
          />
        )

      case 'chat_request':
        return (
          <ChatRequestCard
            ref={isBackCard ? undefined : currentCardRef}
            chatRequest={card.data}
            onAccept={isBackCard ? undefined : handleAcceptChat}
            onDecline={isBackCard ? undefined : handleDeclineChat}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

          />
        )

      case 'survey':
        return (
          <SurveyCard
            ref={isBackCard ? undefined : currentCardRef}
            survey={card.data}
            onRespond={isBackCard ? undefined : (isArchived ? archivedHandler : handleSurveyResponse)}
            onSkip={isBackCard ? undefined : (isArchived ? archivedHandler : handleSurveySkip)}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

            disabled={isArchived}
          />
        )

      case 'demographic':
        return (
          <DemographicCard
            ref={isBackCard ? undefined : currentCardRef}
            demographic={card.data}
            onRespond={isBackCard ? undefined : handleDemographicResponse}
            onSkip={isBackCard ? undefined : handleDemographicSkip}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

          />
        )

      case 'kudos':
        return (
          <KudosCard
            ref={isBackCard ? undefined : currentCardRef}
            kudos={card.data}
            onSendKudos={isBackCard ? undefined : handleSendKudos}
            onAcknowledge={isBackCard ? undefined : handleAcknowledgeKudos}
            onDismiss={isBackCard ? undefined : handleDismissKudos}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

          />
        )

      case 'pairwise':
        return (
          <PairwiseCard
            ref={isBackCard ? undefined : currentCardRef}
            pairwise={card}
            onRespond={isBackCard ? undefined : (isArchived ? archivedHandler : handlePairwiseResponse)}
            onSkip={isBackCard ? undefined : (isArchived ? archivedHandler : handlePairwiseSkip)}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

            disabled={isArchived}
          />
        )

      case 'ban_notification':
        return (
          <BanNotificationCard
            banData={card.data}
          />
        )

      case 'position_removed_notification':
        return (
          <PositionRemovedCard
            data={card.data}
            onDismiss={isBackCard ? undefined : handleDismissRemoval}
          />
        )

      case 'diagnostics_consent':
        return (
          <DiagnosticsConsentCard
            ref={isBackCard ? undefined : currentCardRef}
            onAccept={isBackCard ? undefined : handleDiagnosticsAccept}
            onDecline={isBackCard ? undefined : handleDiagnosticsDecline}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}

          />
        )

      case 'bridging_kudos':
        return (
          <BridgingKudosCard
            ref={isBackCard ? undefined : currentCardRef}
            bridgingKudos={card.data}
            location={sessionData?.locationCode ? { code: sessionData.locationCode, name: sessionData.locationName } : null}
            session={sessionData ? { label: sessionData.label } : null}
            onDismiss={isBackCard ? undefined : handleDismissBridgingKudos}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
          />
        )

      default:
        return (
          <View style={styles.unknownCard}>
            <ThemedText variant="body">{t('unknownCardType', { type: card.type })}</ThemedText>
          </View>
        )
    }
  }

  // Desktop action buttons for the current card
  const renderDesktopActions = () => {
    if (!isDesktop || !currentCard) return null

    const hint = (key) => (
      <View style={styles.shortcutHint}>
        <ThemedText style={styles.shortcutHintText}>{key}</ThemedText>
      </View>
    )

    // Invisible placeholders to keep the diamond grid stable across card types
    const blank = <View style={[styles.desktopActionButton, { opacity: 0 }]} />
    const blankCenter = <View style={[styles.desktopActionButton, styles.desktopActionCenter, { opacity: 0 }]} />

    let top = blankCenter
    let left = blank
    let right = blank
    let bottom = blankCenter

    switch (currentCard.type) {
      case 'position':
        top = (
          <TouchableOpacity
            style={[styles.desktopActionButton, styles.desktopActionCenter, { backgroundColor: colors.primarySurface }]}
            onPress={() => currentCardRef.current?.swipeUp?.()}
            disabled={!!pendingChatRequest}
            accessibilityRole="button"
            accessibilityLabel={t('chatAction')}
          >
            <Ionicons name="chatbubble-outline" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('chatAction')}</ThemedText>
            {hint('W')}
          </TouchableOpacity>
        )
        left = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.disagree }]}
            onPress={() => currentCardRef.current?.swipeLeft?.()}
            accessibilityRole="button"
            accessibilityLabel={t('disagreeAction')}
          >
            <Ionicons name="close" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('disagreeAction')}</ThemedText>
            {hint('A')}
          </TouchableOpacity>
        )
        right = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.agree }]}
            onPress={() => currentCardRef.current?.swipeRight?.()}
            accessibilityRole="button"
            accessibilityLabel={t('agreeAction')}
          >
            <Ionicons name="checkmark" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('agreeAction')}</ThemedText>
            {hint('D')}
          </TouchableOpacity>
        )
        bottom = (
          <TouchableOpacity
            style={[styles.desktopActionButton, styles.desktopActionCenter, { backgroundColor: colors.pass }]}
            onPress={() => currentCardRef.current?.swipeDown?.()}
            accessibilityRole="button"
            accessibilityLabel={t('skipAction')}
          >
            <Ionicons name="arrow-down-outline" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('skipAction')}</ThemedText>
            {hint('S')}
          </TouchableOpacity>
        )
        break

      case 'chat_request':
        left = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.disagree }]}
            onPress={() => currentCardRef.current?.swipeLeft?.()}
            accessibilityRole="button"
            accessibilityLabel={t('declineAction')}
          >
            <Ionicons name="close" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('declineAction')}</ThemedText>
            {hint('A')}
          </TouchableOpacity>
        )
        right = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.agree }]}
            onPress={() => currentCardRef.current?.swipeRight?.()}
            accessibilityRole="button"
            accessibilityLabel={t('acceptAction')}
          >
            <Ionicons name="checkmark" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('acceptAction')}</ThemedText>
            {hint('D')}
          </TouchableOpacity>
        )
        break

      case 'survey':
      case 'pairwise':
      case 'demographic':
        right = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.agree }]}
            onPress={() => currentCardRef.current?.swipeRight?.()}
            accessibilityRole="button"
            accessibilityLabel={t('submitAction')}
          >
            <Ionicons name="checkmark" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('submitAction')}</ThemedText>
            {hint('D')}
          </TouchableOpacity>
        )
        bottom = (
          <TouchableOpacity
            style={[styles.desktopActionButton, styles.desktopActionCenter, { backgroundColor: colors.pass }]}
            onPress={() => currentCardRef.current?.swipeDown?.()}
            accessibilityRole="button"
            accessibilityLabel={t('skipAction')}
          >
            <Ionicons name="arrow-down-outline" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('skipAction')}</ThemedText>
            {hint('S')}
          </TouchableOpacity>
        )
        break

      case 'kudos':
        right = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.agree }]}
            onPress={() => currentCardRef.current?.swipeRight?.()}
            accessibilityRole="button"
            accessibilityLabel={currentCard.data?.userAlreadySentKudos ? t('acknowledgeAction') : t('sendKudosAction')}
          >
            <Ionicons name={currentCard.data?.userAlreadySentKudos ? 'checkmark' : 'heart'} size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">
              {currentCard.data?.userAlreadySentKudos ? t('acknowledgeAction') : t('sendKudosAction')}
            </ThemedText>
            {hint('D')}
          </TouchableOpacity>
        )
        if (!currentCard.data?.userAlreadySentKudos) {
          bottom = (
            <TouchableOpacity
              style={[styles.desktopActionButton, styles.desktopActionCenter, { backgroundColor: colors.pass }]}
              onPress={() => currentCardRef.current?.swipeDown?.()}
              accessibilityRole="button"
              accessibilityLabel={t('dismissAction')}
            >
              <Ionicons name="arrow-down-outline" size={18} color={OnBrandColors.text} />
              <ThemedText variant="label" color="inverse">{t('dismissAction')}</ThemedText>
              {hint('S')}
            </TouchableOpacity>
          )
        }
        break

      case 'diagnostics_consent':
        left = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: colors.pass }]}
            onPress={() => currentCardRef.current?.swipeLeft?.()}
            accessibilityRole="button"
            accessibilityLabel={t('noThanksAction')}
          >
            <Ionicons name="close" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('noThanksAction')}</ThemedText>
            {hint('A')}
          </TouchableOpacity>
        )
        right = (
          <TouchableOpacity
            style={[styles.desktopActionButton, { backgroundColor: SemanticColors.agree }]}
            onPress={() => currentCardRef.current?.swipeRight?.()}
            accessibilityRole="button"
            accessibilityLabel={t('enableAction')}
          >
            <Ionicons name="checkmark" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('enableAction')}</ThemedText>
            {hint('D')}
          </TouchableOpacity>
        )
        break

      case 'bridging_kudos':
        bottom = (
          <TouchableOpacity
            style={[styles.desktopActionButton, styles.desktopActionCenter, { backgroundColor: colors.pass }]}
            onPress={() => currentCardRef.current?.swipeDown?.()}
            accessibilityRole="button"
            accessibilityLabel={t('dismissAction')}
          >
            <Ionicons name="arrow-down-outline" size={18} color={OnBrandColors.text} />
            <ThemedText variant="label" color="inverse">{t('dismissAction')}</ThemedText>
            {hint('S')}
          </TouchableOpacity>
        )
        break

      // ban_notification, position_removed_notification: all blanks (in-card UI)
      default:
        break
    }

    return (
      <View style={styles.desktopActions}>
        {top}
        <View style={styles.desktopActionsRow}>{left}{right}</View>
        {bottom}
      </View>
    )
  }

  // Desktop: chat request timeout/cancel handlers for the indicator
  const handleChatRequestTimeout = useCallback(async () => {
    const requestId = pendingChatCtx?.id
    const positionId = pendingChatCtx?.positionId
    clearPendingChatRequest()
    if (requestId) {
      try {
        await api.chat.rescindChatRequest(requestId)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
      }
    }
    // Auto-add to chatting list so user gets notified when someone is available
    if (positionId) {
      showToast(t('addedToChattingList'), { position: 'top' })
      try {
        await api.chattingList.addPosition(positionId)
      } catch (err) {
        console.error('Failed to add to chatting list:', err)
      }
    }
  }, [pendingChatCtx, clearPendingChatRequest, showToast, t])

  const handleChatRequestCancel = useCallback(async () => {
    const requestId = pendingChatCtx?.id
    clearPendingChatRequest()
    if (requestId) {
      try {
        await api.chat.rescindChatRequest(requestId)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
        showToast(t('common:errorChatRequestRescindFailed'), { position: 'top' })
      }
    }
  }, [pendingChatCtx, clearPendingChatRequest, showToast, t])

  // Create mode: placeholder based on phase
  const PHASE_PLACEHOLDERS = {
    proposal: 'placeholderIssue',
    opinion: 'placeholderPosition',
    reflection: 'placeholderReflection',
    consensus: 'placeholderReflection',
  }
  const createPlaceholder = phase ? t(PHASE_PLACEHOLDERS[phase] || 'placeholderPosition') : t('placeholderPosition')

  // Create mode: synthetic position object matching real position card data shape
  const createModePosition = useMemo(() => ({
    location: sessionData?.locationCode ? { code: sessionData.locationCode, name: sessionData.locationName } : null,
    session: sessionData ? { label: sessionData.label } : null,
    creator: user,
  }), [sessionData, user])

  // Create mode: submit handler — returns local object (no API call yet).
  // The actual position creation is deferred to handleCreateVote so we know
  // whether to set chatsDisabled based on the self-vote response.
  const handleCreateSubmit = useCallback(async (statement) => {
    return {
      statement,
      session: sessionData ? { label: sessionData.label } : null,
      location: sessionData?.locationCode ? { code: sessionData.locationCode, name: sessionData.locationName } : null,
      creator: user,
    }
  }, [sessionData, user])

  // Create mode: self-vote handlers (receive createdPosition object from PositionCard)
  // Creates the position via API (with chatsDisabled when not agreeing), records
  // the self-vote, then waits 400ms for SwipeableCard exit animation before cleanup.
  const handleCreateVote = useCallback(async (createdPosition, response) => {
    try {
      const chatsDisabled = response !== 'agree'
      const result = await api.positions.create(
        createdPosition.statement, selectedSession, selectedLocation, chatsDisabled
      )
      const positionId = result.id
      await api.positions.respond([{ positionId, response }])
      if (response === 'agree') {
        try { await api.chattingList.addPosition(positionId) } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to create position or record self-vote:', err)
    }
    // Wait for SwipeableCard exit animation, then clean up and animate stack back
    setTimeout(() => {
      setShowCreateCard(false)
      setCreateInitialStatement('')
      createSlideAnim.value = withTiming(0, { duration: 300 })
    }, 400)
  }, [createSlideAnim, selectedSession, selectedLocation])

  const handleCreateAgree = useCallback((createdPosition) => handleCreateVote(createdPosition, 'agree'), [handleCreateVote])
  const handleCreateDisagree = useCallback((createdPosition) => handleCreateVote(createdPosition, 'disagree'), [handleCreateVote])
  const handleCreatePass = useCallback((createdPosition) => handleCreateVote(createdPosition, 'pass'), [handleCreateVote])

  const handleOpenRules = useCallback(() => setShowRules(true), [])

  // Only show loading on initial load when we have no cards yet
  if (initialLoading && cards.length === 0) {
    return <CardQueueSkeleton styles={styles} colors={colors} isDesktop={isDesktop} />
  }

  if (error && cards.length === 0) {
    return (
      <View style={styles.centerContent}>
        <ThemedText variant="button" style={styles.errorText}>{error}</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry} accessibilityRole="button" accessibilityLabel={t('common:retry')}>
          <ThemedText variant="button" color="inverse">{t('common:retry')}</ThemedText>
        </TouchableOpacity>
      </View>
    )
  }

  // Show empty state only when not loading and truly have no cards
  // Also handles case where we've swiped through all cards
  if (!initialLoading && (cards.length === 0 || currentIndex >= cards.length)) {
    const handleEmptyCreate = () => {
      if (!selectedSession) { openSessionSelector(); return }
      setCreateInitialStatement('')
      setShowCreateCard(true)
      createSlideAnim.value = 0
      createSlideAnim.value = withTiming(1, { duration: 300 })
    }
    const handleEmptyRefresh = async () => {
      setRefreshing(true)
      seenCardIdsRef.current.clear()
      await fetchMoreCards(true)
      setRefreshing(false)
    }
    return (
      <View style={[styles.container, isDesktop && styles.containerDesktop]}>
        <ScrollView
          contentContainerStyle={[styles.cardContainer, { flexGrow: 1 }, isDesktop && styles.cardContainerDesktop]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleEmptyRefresh}
              tintColor={colors.secondaryText}
              colors={[colors.primarySurface]}
              accessibilityLabel={t('common:pullToRefresh')}
            />
          }
        >
          <View style={styles.cardStack}>
            <SessionInfoCard style={styles.sessionInfoOverride} />
            {/* Empty state content */}
            <View style={styles.centerContent}>
              <ThemedText variant="statement" color="primary" style={styles.emptyTitle}>{t('emptyTitle')}</ThemedText>
              <ThemedText variant="button" color="secondary" style={styles.emptyText}>
                {t('emptyText')}
              </ThemedText>
              {!isArchived && (
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={handleEmptyCreate}
                  accessibilityRole="button"
                  accessibilityLabel={t('createPosition')}
                >
                  <ThemedText variant="button" color="inverse">{t('createPosition')}</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* Create card slides in over empty state */}
            {showCreateCard && !isArchived && (
              <Animated.View style={[styles.currentCard, createCardSlideStyle]}>
                <PositionCard
                  createMode
                  position={createModePosition}
                  onCreateSubmit={handleCreateSubmit}
                  onCreateCancel={handleCreateCancel}
                  onOpenRules={handleOpenRules}
                  placeholder={createPlaceholder}
                  initialStatement={createInitialStatement}
                  onAgree={handleCreateAgree}
                  onDisagree={handleCreateDisagree}
                  onPass={handleCreatePass}
                  onAddToChattingList={() => {}}
                  locationId={selectedLocation}
                  sessionId={selectedSession}
                  onAdopt={handleCreateAdopt}
                />
              </Animated.View>
            )}
          </View>
        </ScrollView>
        <CommunityRulesModal
          visible={showRules}
          onClose={() => setShowRules(false)}
          contentType="position"
          locationId={selectedLocation}
          sessionId={selectedSession}
        />
      </View>
    )
  }

  return (
    <View
      style={[styles.container, isDesktop && styles.containerDesktop]}
      onLayout={isDesktop ? handleCardAreaLayout : undefined}
    >
      {/* Desktop: pending chat request indicator above the card area (always reserves space) */}
      {isDesktop && (
        <View style={styles.desktopIndicator}>
          {pendingChatCtx && (
            <ChatRequestIndicator
              pendingRequest={pendingChatCtx}
              onTimeout={handleChatRequestTimeout}
              onCancel={handleChatRequestCancel}
            />
          )}
        </View>
      )}

      <View style={[
        styles.cardContainer,
        isDesktop && styles.cardContainerDesktop,
        isDesktop && cardScale < 1 && {
          width: CARD_REFERENCE_WIDTH,
          alignSelf: 'center',
          transform: [{ scale: cardScale }],
          transformOrigin: 'top center',
          marginBottom: -(CARD_REFERENCE_WIDTH * 16 / 9) * (1 - cardScale),
        },
      ]}>
        {/* Card stack wrapper — 4 fixed ring buffer slots */}
        <View style={styles.cardStack}>
          {[0, 1, 2, 3].map(slotIndex => {
            const card = slotCards[slotIndex]
            const role = ((slotIndex - headSlotJS) % 4 + 4) % 4
            return (
              <Animated.View key={`slot-${slotIndex}`} style={[
                role === 0 ? styles.currentCard : styles.stackedCard,
                slotStyles[slotIndex],
              ]}>
                {card && renderCard(card, role !== 0)}
              </Animated.View>
            )
          })}

          {/* Sliding-in chat request card from top */}
          {slidingInCard && (
            <Animated.View style={[styles.stackedCard, slideInCardStyle]}>
              {renderCard(slidingInCard, true)}
            </Animated.View>
          )}

          {/* Create position card — slides in over card stack */}
          {showCreateCard && !isArchived && (
            <Animated.View style={[styles.currentCard, createCardSlideStyle]}>
              <PositionCard
                createMode
                position={createModePosition}
                onCreateSubmit={handleCreateSubmit}
                onCreateCancel={handleCreateCancel}
                onOpenRules={handleOpenRules}
                placeholder={createPlaceholder}
                initialStatement={createInitialStatement}
                onAgree={handleCreateAgree}
                onDisagree={handleCreateDisagree}
                onPass={handleCreatePass}
                onAddToChattingList={() => {}}
                locationId={selectedLocation}
                sessionId={selectedSession}
                onAdopt={handleCreateAdopt}
              />
            </Animated.View>
          )}
        </View>
      </View>

      {!showCreateCard && renderDesktopActions()}

      {/* Add position options modal */}
      <InfoModal
        visible={showAddPositionModal}
        onClose={() => setShowAddPositionModal(false)}
        title={t('addPositionTitle')}
        icon="add-circle-outline"
        iconColor={SemanticColors.agree}
        buttonText={t('common:cancel')}
      >
        <View style={styles.addPositionOptions}>
          <TouchableOpacity
            style={styles.addPositionOption}
            onPress={handleAddPositionAdopt}
            accessibilityRole="button"
            accessibilityLabel={t('addPositionAdopt')}
          >
            <View style={[styles.addPositionIcon, styles.addPositionIconAdopt]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={SemanticColors.agree} />
            </View>
            <View style={styles.addPositionOptionText}>
              <ThemedText variant="body" color="primary" style={styles.addPositionOptionTitle}>{t('addPositionAdopt')}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">{t('addPositionAdoptDesc')}</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addPositionOption}
            onPress={handleAddPositionModify}
            accessibilityRole="button"
            accessibilityLabel={t('addPositionModify')}
          >
            <View style={[styles.addPositionIcon, styles.addPositionIconModify]}>
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.addPositionOptionText}>
              <ThemedText variant="body" color="primary" style={styles.addPositionOptionTitle}>{t('addPositionModify')}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">{t('addPositionModifyDesc')}</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addPositionOption, styles.addPositionOptionLast]}
            onPress={handleAddPositionCreate}
            accessibilityRole="button"
            accessibilityLabel={t('createPosition')}
          >
            <View style={[styles.addPositionIcon, styles.addPositionIconCreate]}>
              <Ionicons name="add-circle-outline" size={22} color={SemanticColors.agree} />
            </View>
            <View style={styles.addPositionOptionText}>
              <ThemedText variant="body" color="primary" style={styles.addPositionOptionTitle}>{t('createPosition')}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">{t('addPositionCreateDesc')}</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </InfoModal>

      {/* Community rules modal (create mode) */}
      <CommunityRulesModal
        visible={showRules}
        onClose={() => setShowRules(false)}
        contentType="position"
        locationId={selectedLocation}
        sessionId={selectedSession}
      />

      {/* Chatting list explanation modal (tutorial - shows on first use) */}
      <ChattingListExplanationModal
        visible={showChattingListModal}
        onClose={handleCloseChattingListModal}
      />

      {/* Report / rule-selection modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false); setReportPositionId(null) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : (ruleId, comment) => handleSubmitReport(reportPositionId, ruleId, comment)}
        contentType="position"
        isModerating={!!moderateTarget}
      />

      {/* Moderation action modal (second step of moderation flow) */}
      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => { setActionModalVisible(false); setModerateTarget(null); setModerateRule(null); setModerateComment(null) }}
        onSubmit={handleModerateActionSubmit}
        reportType={moderateTarget?.type}
        rule={moderateRule}
      />

      <GlossaryDrawer {...glossaryDrawer} />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 20,
    overflow: 'visible',
  },
  cardStack: {
    flex: 1,
    position: 'relative',
    overflow: 'visible',
  },
  currentCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  stackedCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontWeight: undefined,
  },
  errorText: {
    fontWeight: undefined,
    color: SemanticColors.warning,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  sessionInfoOverride: {
    marginHorizontal: 4, // Compensate for cardContainer's 8px paddingHorizontal to match other tabs' 12px total
    marginTop: 0, // cardContainer's paddingTop: 8 already provides the gap
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    fontWeight: undefined,
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
  },
  unknownCard: {
    padding: 20,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    alignItems: 'center',
  },
  skeletonCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    ...Shadows.card,
  },
  skeletonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  skeletonStatementArea: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  skeletonFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  containerDesktop: {
    justifyContent: 'center',
  },
  cardContainerDesktop: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    aspectRatio: 9 / 16,
  },
  desktopIndicator: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  desktopActions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    height: 110,
  },
  desktopActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  desktopActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minHeight: 30,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  desktopActionCenter: {
    flex: 0,
    minWidth: '46%',
  },
  shortcutHint: {
    backgroundColor: OnBrandColors.overlay,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  shortcutHintText: {
    color: OnBrandColors.text,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  addPositionOptions: {
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  addPositionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 14,
  },
  addPositionOptionLast: {
    borderBottomWidth: 0,
  },
  addPositionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPositionIconAdopt: {
    backgroundColor: SemanticColors.agree + '20',
  },
  addPositionIconModify: {
    backgroundColor: colors.chattingListBg,
  },
  addPositionIconCreate: {
    backgroundColor: SemanticColors.agree + '20',
  },
  addPositionOptionText: {
    flex: 1,
  },
  addPositionOptionTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
})

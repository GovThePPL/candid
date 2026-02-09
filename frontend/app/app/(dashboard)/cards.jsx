import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Platform, Animated, Dimensions } from 'react-native'
import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../../constants/Colors'
import api from '../../lib/api'
import { UserContext } from '../../contexts/UserContext'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'
import {
  PositionCard,
  ChatRequestCard,
  SurveyCard,
  DemographicCard,
  KudosCard,
  PairwiseCard,
  BanNotificationCard,
  PositionRemovedCard,
} from '../../components/cards'
import Header from '../../components/Header'
import ChattingListExplanationModal from '../../components/ChattingListExplanationModal'
import AdoptPositionExplanationModal from '../../components/AdoptPositionExplanationModal'
import ReportModal from '../../components/ReportModal'
import { useToast } from '../../components/Toast'

// AsyncStorage keys for tutorial tracking
const TUTORIAL_CHATTING_LIST_KEY = '@tutorial_seen_chatting_list'
const TUTORIAL_ADOPT_POSITION_KEY = '@tutorial_seen_adopt_position'

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

export default function CardQueue() {
  const router = useRouter()
  const showToast = useToast()
  const { user, logout, invalidatePositions, pendingChatRequest, setPendingChatRequest, incomingChatRequest, clearIncomingChatRequest } = useContext(UserContext)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tutorial modal state (frontend-only, uses AsyncStorage)
  const [showChattingListModal, setShowChattingListModal] = useState(false)
  const [showAdoptPositionModal, setShowAdoptPositionModal] = useState(false)
  const hasCheckedTutorialsRef = useRef(false)
  const seenChattingListTutorialRef = useRef(false)
  const seenAdoptPositionTutorialRef = useRef(false)

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportPositionId, setReportPositionId] = useState(null)

  // Animated value for back card transition
  const backCardProgress = useRef(new Animated.Value(0)).current

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
  const slideInAnim = useRef(new Animated.Value(0)).current
  const [slidingInCard, setSlidingInCard] = useState(null)

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
        const [chattingListSeen, adoptPositionSeen] = await Promise.all([
          AsyncStorage.getItem(TUTORIAL_CHATTING_LIST_KEY),
          AsyncStorage.getItem(TUTORIAL_ADOPT_POSITION_KEY),
        ])
        seenChattingListTutorialRef.current = chattingListSeen === 'true'
        seenAdoptPositionTutorialRef.current = adoptPositionSeen === 'true'
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
      const fetches = [api.cards.getCardQueue(fetchSize)]
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
        setError(err.message || 'Failed to load cards')
      }
    } finally {
      isFetchingRef.current = false
      if (isInitial) {
        setInitialLoading(false)
      }
    }
  }, [getCardKey, user?.id, refreshChattingList])

  // Initial fetch
  useEffect(() => {
    fetchMoreCards(true)
  }, [])

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

  const currentCard = cards[currentIndex]
  const nextCard = cards[currentIndex + 1]

  const handleCloseChattingListModal = useCallback(async () => {
    setShowChattingListModal(false)
    seenChattingListTutorialRef.current = true
    try {
      await AsyncStorage.setItem(TUTORIAL_CHATTING_LIST_KEY, 'true')
    } catch (err) {
      console.error('Failed to save chatting list tutorial state:', err)
    }
  }, [])

  const handleCloseAdoptPositionModal = useCallback(async () => {
    setShowAdoptPositionModal(false)
    seenAdoptPositionTutorialRef.current = true
    try {
      await AsyncStorage.setItem(TUTORIAL_ADOPT_POSITION_KEY, 'true')
    } catch (err) {
      console.error('Failed to save adopt position tutorial state:', err)
    }
  }, [])

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

    // Animate the back card forward, then advance
    Animated.timing(backCardProgress, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      backCardProgress.setValue(0)
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else if (cards.length > 0) {
        // At end of queue - trigger fetch if not already fetching
        // Cards will appear once fetch completes
        fetchMoreCards(false)
      }
    })
  }, [currentIndex, cards.length, fetchMoreCards, backCardProgress])

  // Trigger slide-in animation to insert a card at the current position (pushes queue back)
  const triggerSlideIn = useCallback((card) => {
    setSlidingInCard(card)
    slideInAnim.setValue(0)
    Animated.timing(slideInAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      // Insert card at current index
      setCards(prev => {
        const next = [...prev]
        next.splice(currentIndex, 0, card)
        return next
      })
      setSlidingInCard(null)
      slideInAnim.setValue(0)
    })
  }, [currentIndex, slideInAnim])

  // Consume incoming chat request from context
  useEffect(() => {
    if (!incomingChatRequest) return

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
  }, [incomingChatRequest, clearIncomingChatRequest, isActivelySwiping, currentIndex, triggerSlideIn])

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

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (promotionTimerRef.current) clearTimeout(promotionTimerRef.current)
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current)
    }
  }, [])

  // Position card handlers
  const handleAgree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{
        positionId: currentCard.data.id,
        response: 'agree',
      }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handleDisagree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{
        positionId: currentCard.data.id,
        response: 'disagree',
      }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handlePass = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{
        positionId: currentCard.data.id,
        response: 'pass',
      }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handleChatRequest = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    if (pendingChatRequest) return

    // If no users are available, add to chatting list + show toast instead
    if (currentCard.data?.availability === 'none') {
      const isAlreadyInChattingList = currentCard.data?.source === 'chatting_list'
      if (!isAlreadyInChattingList) {
        try {
          await api.chattingList.addPosition(currentCard.data.id)
        } catch (err) {
          console.error('Failed to add to chatting list:', err)
        }
      }
      showToast("Added to chatting list \u2014 you'll be matched when someone is online")
      goToNextCard()
      return
    }

    try {
      const response = await api.chat.createRequest(currentCard.data.userPositionId)
      // Set pending chat request with countdown info
      const now = new Date()
      const author = currentCard.data.creator || {}
      setPendingChatRequest({
        id: response.id,
        createdTime: now.toISOString(),
        expiresAt: new Date(now.getTime() + CHAT_REQUEST_TIMEOUT_MS).toISOString(),
        positionStatement: currentCard.data.statement,
        category: currentCard.data.category,
        location: currentCard.data.location,
        author: {
          displayName: author.displayName,
          username: author.username,
          avatarUrl: author.avatarUrl,
          avatarIconUrl: author.avatarIconUrl,
          trustScore: author.trustScore,
          kudosCount: author.kudosCount,
        },
        status: 'pending',
      })
      goToNextCard()
    } catch (err) {
      console.error('Failed to create chat request:', err)
    }
  }, [currentCard, goToNextCard, setPendingChatRequest, pendingChatRequest, showToast])

  const handleReport = useCallback(() => {
    setReportPositionId(currentCard?.data?.id)
    setReportModalVisible(true)
  }, [currentCard])

  const handleSubmitReport = useCallback(async (ruleId, comment) => {
    if (!reportPositionId) return
    await api.positions.report(reportPositionId, ruleId, comment)
    setReportModalVisible(false)
    goToNextCard()
  }, [reportPositionId, goToNextCard])

  // Dismiss position removed notification
  const handleDismissRemoval = useCallback(async () => {
    if (currentCard?.type !== 'position_removed_notification') return
    try {
      await api.cards.dismissPositionRemovedNotification(currentCard.data.positionId)
      goToNextCard()
    } catch (err) {
      console.error('Failed to dismiss removal notification:', err)
    }
  }, [currentCard, goToNextCard])

  const handleAddPosition = useCallback(async () => {
    if (currentCard?.type !== 'position') return

    // Show tutorial on first use
    if (!seenAdoptPositionTutorialRef.current) {
      setShowAdoptPositionModal(true)
    }

    const cardRef = currentCardRef.current
    if (cardRef?.swipeRightWithPlus) {
      // Trigger swipe animation with plus icon - API call happens after animation
      cardRef.swipeRightWithPlus()
    } else {
      goToNextCard()
    }
    try {
      await api.positions.adopt(currentCard.data.id)
      invalidatePositions() // Signal that positions list needs refresh
    } catch (err) {
      console.error('Failed to adopt position:', err)
    }
  }, [currentCard, goToNextCard, invalidatePositions])

  // Handle removing a position from the chatting list
  const handleRemoveFromChattingList = useCallback(async () => {
    if (currentCard?.type !== 'position' || !currentCard?.data?.chattingListId) return
    try {
      await api.chattingList.remove(currentCard.data.chattingListId)
      // Update local map
      chattingListMapRef.current.delete(currentCard.data.id)
      // Invalidate chatting list cache
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      // Update the card in state to show it's no longer in the chatting list
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
    } catch (err) {
      console.error('Failed to remove from chatting list:', err)
    }
  }, [currentCard, currentIndex])

  // Handle adding a position to the chatting list
  const handleAddToChattingList = useCallback(async () => {
    if (currentCard?.type !== 'position' || !currentCard?.data?.id) return

    // If already in chatting list, don't try to add again
    if (currentCard?.data?.source === 'chatting_list') return

    // Show tutorial on first use
    if (!seenChattingListTutorialRef.current) {
      setShowChattingListModal(true)
    }

    try {
      const result = await api.chattingList.addPosition(currentCard.data.id)
      // Update local map
      if (result?.id) {
        chattingListMapRef.current.set(currentCard.data.id, {
          id: result.id,
          hasPendingRequests: false,
        })
      }
      // Invalidate chatting list cache
      if (user?.id) await CacheManager.invalidate(CacheKeys.chattingList(user.id))
      // Update the card in state to show it's now in the chatting list
      setCards(prev => prev.map((card, idx) => {
        if (idx === currentIndex && card.type === 'position') {
          return {
            ...card,
            data: {
              ...card.data,
              source: 'chatting_list',
              chattingListId: result?.id,
            }
          }
        }
        return card
      }))
    } catch (err) {
      console.error('Failed to add to chatting list:', err)
    }
  }, [currentCard, currentIndex, user?.seenChattingListExplanation])

  // Chat request handlers
  const handleAcceptChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    let response
    try {
      response = await api.chat.respondToRequest(currentCard.data.id, 'accepted')
    } catch (err) {
      console.error('Failed to accept chat:', err)
    }
    goToNextCard()
    // Navigate to chat screen with the new chat log ID
    if (response?.chatLogId) {
      router.push(`/chat/${response.chatLogId}`)
    }
  }, [currentCard, goToNextCard, router])

  const handleDeclineChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    try {
      await api.chat.respondToRequest(currentCard.data.id, 'dismissed')
    } catch (err) {
      console.error('Failed to decline chat:', err)
    }
    goToNextCard()
  }, [currentCard, goToNextCard])

  // Survey handlers
  const handleSurveyResponse = useCallback(async (surveyId, questionId, optionId) => {
    try {
      await api.surveys.respond(surveyId, questionId, optionId)
    } catch (err) {
      console.error('Failed to submit survey response:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  const handleSurveySkip = useCallback(() => {
    // Just move to next card - the survey will appear again later
    // since no response was recorded
    goToNextCard()
  }, [goToNextCard])

  // Demographic handlers
  const handleDemographicResponse = useCallback(async (field, value) => {
    try {
      await api.users.updateDemographics({ [field]: value })
    } catch (err) {
      console.error('Failed to update demographics:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  const handleDemographicSkip = useCallback(() => {
    // Just move to next card - the demographic will appear again later
    goToNextCard()
  }, [goToNextCard])

  // Kudos handlers
  const handleSendKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    try {
      await api.chat.sendKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to send kudos:', err)
    }
    goToNextCard()
  }, [currentCard, goToNextCard])

  const handleDismissKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    try {
      await api.chat.dismissKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to dismiss kudos:', err)
    }
    goToNextCard()
  }, [currentCard, goToNextCard])

  // Acknowledge kudos (when user already sent kudos, just mark as seen)
  const handleAcknowledgeKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    try {
      await api.chat.acknowledgeKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to acknowledge kudos:', err)
    }
    goToNextCard()
  }, [currentCard, goToNextCard])

  // Pairwise comparison handlers
  const handlePairwiseResponse = useCallback(async (surveyId, winnerItemId, loserItemId) => {
    try {
      await api.surveys.respondToPairwise(surveyId, winnerItemId, loserItemId)
    } catch (err) {
      console.error('Failed to submit pairwise response:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  const handlePairwiseSkip = useCallback(() => {
    // Just move to next card - the pairwise comparison will appear again later
    goToNextCard()
  }, [goToNextCard])

  // Keyboard support for PC
  useEffect(() => {
    if (Platform.OS !== 'web') return

    const handleKeyDown = (event) => {
      // Don't capture if user is typing in an input
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return
      }

      // Use the card ref to trigger swipe animations
      const cardRef = currentCardRef.current

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          if (cardRef?.swipeRight) {
            cardRef.swipeRight()
          }
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (cardRef?.swipeLeft) {
            cardRef.swipeLeft()
          }
          break
        case 'ArrowDown':
          event.preventDefault()
          if (cardRef?.swipeDown && currentCard?.type === 'position') {
            cardRef.swipeDown()
          }
          break
        case 'ArrowUp':
          event.preventDefault()
          if (cardRef?.swipeUp && currentCard?.type === 'position' && !pendingChatRequest) {
            cardRef.swipeUp()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentCard, pendingChatRequest])

  const renderCard = (card, isBackCard = false) => {
    if (!card) return null

    let cardId = card.data?.id || card.data?.field
    if (card.type === 'pairwise') {
      cardId = `${card.data?.optionA?.id}-${card.data?.optionB?.id}`
    }
    const key = `${cardId}-${isBackCard ? 'back' : 'current'}`

    switch (card.type) {
      case 'position':
        const isFromChattingList = card.data?.source === 'chatting_list'
        return (
          <PositionCard
            ref={isBackCard ? undefined : currentCardRef}
            key={key}
            position={card.data}
            onAgree={isBackCard ? undefined : handleAgree}
            onDisagree={isBackCard ? undefined : handleDisagree}
            onPass={isBackCard ? undefined : handlePass}
            onChatRequest={isBackCard || pendingChatRequest ? undefined : handleChatRequest}
            onReport={isBackCard ? undefined : handleReport}
            onAddPosition={isBackCard ? undefined : handleAddPosition}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
            isFromChattingList={isFromChattingList}
            hasPendingRequests={card.data?.hasPendingRequests || false}
            onRemoveFromChattingList={isBackCard ? undefined : handleRemoveFromChattingList}
            onAddToChattingList={isBackCard ? undefined : handleAddToChattingList}
          />
        )

      case 'chat_request':
        return (
          <ChatRequestCard
            ref={isBackCard ? undefined : currentCardRef}
            key={key}
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
            key={key}
            survey={card.data}
            onRespond={isBackCard ? undefined : handleSurveyResponse}
            onSkip={isBackCard ? undefined : handleSurveySkip}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
          />
        )

      case 'demographic':
        return (
          <DemographicCard
            ref={isBackCard ? undefined : currentCardRef}
            key={key}
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
            key={key}
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
            key={key}
            pairwise={card}
            onRespond={isBackCard ? undefined : handlePairwiseResponse}
            onSkip={isBackCard ? undefined : handlePairwiseSkip}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
          />
        )

      case 'ban_notification':
        return (
          <BanNotificationCard
            key={key}
            banData={card.data}
          />
        )

      case 'position_removed_notification':
        return (
          <PositionRemovedCard
            key={key}
            data={card.data}
            onDismiss={isBackCard ? undefined : handleDismissRemoval}
          />
        )

      default:
        return (
          <View style={styles.unknownCard}>
            <Text>Unknown card type: {card.type}</Text>
          </View>
        )
    }
  }

  // Retry handler - resets state and fetches fresh
  const handleRetry = useCallback(() => {
    seenCardIdsRef.current.clear()
    setCards([])
    setCurrentIndex(0)
    fetchMoreCards(true)
  }, [fetchMoreCards])

  // Only show loading on initial load when we have no cards yet
  if (initialLoading && cards.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading cards...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error && cards.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // Show empty state only when not loading and truly have no cards
  // Also handles case where we've swiped through all cards
  if (!initialLoading && (cards.length === 0 || currentIndex >= cards.length)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No more cards</Text>
          <Text style={styles.emptyText}>
            Check back later for more positions, or create your own!
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/create')}
          >
            <Text style={styles.createButtonText}>Create Position</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />

      <View style={styles.cardContainer}>
        {/* Card stack wrapper */}
        <View style={styles.cardStack}>
          {/* Fourth card in stack (index + 3) */}
          {cards[currentIndex + 3] && (
            <Animated.View style={[
              styles.stackedCard,
              {
                zIndex: -1,
                opacity: backCardProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.85],
                }),
                transform: [
                  { scale: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.88, 0.92],
                  })},
                  { translateY: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [72, 48],
                  })},
                ],
              }
            ]}>
              {renderCard(cards[currentIndex + 3], true)}
            </Animated.View>
          )}

          {/* Third card in stack (index + 2) */}
          {cards[currentIndex + 2] && (
            <Animated.View style={[
              styles.stackedCard,
              {
                zIndex: 0,
                opacity: backCardProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1],
                }),
                transform: [
                  { scale: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 0.96],
                  })},
                  { translateY: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [48, 24],
                  })},
                ],
              }
            ]}>
              {renderCard(cards[currentIndex + 2], true)}
            </Animated.View>
          )}

          {/* Back card (next card in queue) */}
          {nextCard && (
            <Animated.View style={[
              styles.stackedCard,
              {
                zIndex: 1,
                transform: [
                  { scale: slidingInCard
                    ? Animated.add(
                        // During slide-in: push back from 0.96→0.92
                        slideInAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -0.04],
                        }),
                        backCardProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1],
                        })
                      )
                    : backCardProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      })
                  },
                  { translateY: slidingInCard
                    ? Animated.add(
                        // During slide-in: push back from 24→48
                        slideInAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 24],
                        }),
                        backCardProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [24, 0],
                        })
                      )
                    : backCardProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      })
                  },
                ],
              }
            ]}>
              {renderCard(nextCard, true)}
            </Animated.View>
          )}

          {/* Current card - main card on top, shifts back during slide-in */}
          <Animated.View style={[
            styles.currentCard,
            slidingInCard ? {
              transform: [
                { scale: slideInAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.96],
                })},
                { translateY: slideInAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 24],
                })},
              ],
            } : undefined,
          ]}>
            {renderCard(currentCard, false)}
          </Animated.View>

          {/* Sliding-in chat request card from top */}
          {slidingInCard && (
            <Animated.View style={[
              styles.stackedCard,
              {
                zIndex: 3,
                transform: [
                  { translateY: slideInAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-SCREEN_HEIGHT, 0],
                  })},
                ],
              }
            ]}>
              {renderCard(slidingInCard, true)}
            </Animated.View>
          )}
        </View>
      </View>

      {/* Chatting list explanation modal (tutorial - shows on first use) */}
      <ChattingListExplanationModal
        visible={showChattingListModal}
        onClose={handleCloseChattingListModal}
      />

      {/* Adopt position explanation modal (tutorial - shows on first use) */}
      <AdoptPositionExplanationModal
        visible={showAdoptPositionModal}
        onClose={handleCloseAdoptPositionModal}
      />

      {/* Report modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleSubmitReport}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
    flex: 1,
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
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.pass,
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
  },
  createButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  unknownCard: {
    padding: 20,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    alignItems: 'center',
  },
})

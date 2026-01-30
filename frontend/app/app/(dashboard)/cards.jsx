import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Platform, Animated } from 'react-native'
import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/Colors'
import api from '../../lib/api'
import { UserContext } from '../../contexts/UserContext'
import {
  PositionCard,
  ChatRequestCard,
  SurveyCard,
  DemographicCard,
  KudosCard,
} from '../../components/cards'
import Header from '../../components/Header'

// Configuration for continuous card loading
const INITIAL_FETCH_SIZE = 20
const REFETCH_THRESHOLD = 5  // Fetch more when this many cards remain
const REFETCH_SIZE = 15

// Chat request timeout duration in milliseconds (2 minutes)
const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

export default function CardQueue() {
  const router = useRouter()
  const { user, logout, invalidatePositions, setPendingChatRequest, activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat } = useContext(UserContext)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)

  // Animated value for back card transition
  const backCardProgress = useRef(new Animated.Value(0)).current

  // Ref to current card for keyboard-triggered swipes
  const currentCardRef = useRef(null)

  // Track fetching state and seen card IDs to prevent duplicates
  const isFetchingRef = useRef(false)
  const seenCardIdsRef = useRef(new Set())

  // Get unique key for a card to track duplicates
  const getCardKey = useCallback((card) => {
    if (!card) return null
    if (card.type === 'demographic') return `demographic-${card.data?.field}`
    return `${card.type}-${card.data?.id}`
  }, [])

  // Fetch cards and append to queue (avoiding duplicates)
  const fetchMoreCards = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      if (isInitial) {
        setInitialLoading(true)
        setError(null)
      }

      const fetchSize = isInitial ? INITIAL_FETCH_SIZE : REFETCH_SIZE
      const response = await api.cards.getCardQueue(fetchSize)
      const newCards = response || []

      // Filter out cards we've already seen
      const uniqueNewCards = newCards.filter(card => {
        const key = getCardKey(card)
        if (!key || seenCardIdsRef.current.has(key)) return false
        seenCardIdsRef.current.add(key)
        return true
      })

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
  }, [getCardKey])

  // Initial fetch
  useEffect(() => {
    fetchMoreCards(true)
  }, [])

  // Handle navigation when a chat starts (via socket event)
  useEffect(() => {
    if (activeChatNavigation?.chatId) {
      router.push(`/chat/${activeChatNavigation.chatId}`)
      clearActiveChatNavigation()
    }
  }, [activeChatNavigation, router, clearActiveChatNavigation])

  // Handle navigation to existing active chat on app load
  useEffect(() => {
    console.log('[Cards] activeChat changed:', activeChat?.id || 'none')
    if (activeChat?.id) {
      console.log('[Cards] Navigating to active chat:', activeChat.id)
      router.push(`/chat/${activeChat.id}`)
      clearActiveChat()
    }
  }, [activeChat, router, clearActiveChat])

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

  const goToNextCard = useCallback(() => {
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
    try {
      const response = await api.chat.createRequest(currentCard.data.userPositionId)
      // Set pending chat request with countdown info
      const now = new Date()
      setPendingChatRequest({
        id: response.id,
        createdTime: now.toISOString(),
        expiresAt: new Date(now.getTime() + CHAT_REQUEST_TIMEOUT_MS).toISOString(),
        positionStatement: currentCard.data.statement,
        status: 'pending',
      })
      goToNextCard()
    } catch (err) {
      console.error('Failed to create chat request:', err)
    }
  }, [currentCard, goToNextCard, setPendingChatRequest])

  const handleReport = useCallback(() => {
    // Navigate to report screen
    router.push({
      pathname: '/report',
      params: { positionId: currentCard?.data?.id }
    })
  }, [currentCard, router])

  const handleAddPosition = useCallback(async () => {
    if (currentCard?.type !== 'position') return
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

  // Chat request handlers
  const handleAcceptChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    try {
      const response = await api.chat.respondToRequest(currentCard.data.id, 'accepted')
      goToNextCard()
      // Navigate to chat screen with the new chat log ID
      if (response.chatLogId) {
        router.push(`/chat/${response.chatLogId}`)
      }
    } catch (err) {
      console.error('Failed to accept chat:', err)
    }
  }, [currentCard, goToNextCard, router])

  const handleDeclineChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    try {
      await api.chat.respondToRequest(currentCard.data.id, 'dismissed')
      goToNextCard()
    } catch (err) {
      console.error('Failed to decline chat:', err)
    }
  }, [currentCard, goToNextCard])

  // Survey handlers
  const handleSurveyResponse = useCallback(async (surveyId, questionId, optionId) => {
    try {
      await api.surveys.respond(surveyId, questionId, optionId)
      goToNextCard()
    } catch (err) {
      console.error('Failed to submit survey response:', err)
    }
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
      goToNextCard()
    } catch (err) {
      console.error('Failed to update demographics:', err)
    }
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
      goToNextCard()
    } catch (err) {
      console.error('Failed to send kudos:', err)
    }
  }, [currentCard, goToNextCard])

  const handleDismissKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    try {
      await api.chat.dismissKudos(currentCard.data.id)
      goToNextCard()
    } catch (err) {
      console.error('Failed to dismiss kudos:', err)
    }
  }, [currentCard, goToNextCard])

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
          if (cardRef?.swipeUp && currentCard?.type === 'position') {
            cardRef.swipeUp()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentCard])

  const renderCard = (card, isBackCard = false) => {
    if (!card) return null

    const key = `${card.data?.id || card.data?.field}-${isBackCard ? 'back' : 'current'}`

    switch (card.type) {
      case 'position':
        return (
          <PositionCard
            ref={isBackCard ? undefined : currentCardRef}
            key={key}
            position={card.data}
            onAgree={isBackCard ? undefined : handleAgree}
            onDisagree={isBackCard ? undefined : handleDisagree}
            onPass={isBackCard ? undefined : handlePass}
            onChatRequest={isBackCard ? undefined : handleChatRequest}
            onReport={isBackCard ? undefined : handleReport}
            onAddPosition={isBackCard ? undefined : handleAddPosition}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
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
            onDismiss={isBackCard ? undefined : handleDismissKudos}
            isBackCard={isBackCard}
            backCardAnimatedValue={backCardProgress}
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
                  { scale: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  })},
                  { translateY: backCardProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  })},
                ],
              }
            ]}>
              {renderCard(nextCard, true)}
            </Animated.View>
          )}

          {/* Current card - main card on top */}
          <View style={styles.currentCard}>
            {renderCard(currentCard, false)}
          </View>
        </View>
      </View>
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
    color: '#fff',
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
    color: '#fff',
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

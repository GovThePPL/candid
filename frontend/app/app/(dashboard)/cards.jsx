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

export default function CardQueue() {
  const router = useRouter()
  const { user, logout, invalidatePositions } = useContext(UserContext)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Animated value for back card transition
  const backCardProgress = useRef(new Animated.Value(0)).current

  // Ref to current card for keyboard-triggered swipes
  const currentCardRef = useRef(null)

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.cards.getCardQueue(10)
      setCards(response || [])
      setCurrentIndex(0)
    } catch (err) {
      setError(err.message || 'Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

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
      } else {
        // Fetch more cards when we reach the end
        fetchCards()
      }
    })
  }, [currentIndex, cards.length, fetchCards, backCardProgress])

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
      await api.chat.createRequest(currentCard.data.userPositionId)
      goToNextCard()
    } catch (err) {
      console.error('Failed to create chat request:', err)
    }
  }, [currentCard, goToNextCard])

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
      await api.chat.respondToRequest(currentCard.data.id, 'accept')
      goToNextCard()
      // Navigate to chat screen
      // router.push({ pathname: '/chat', params: { chatId: ... } })
    } catch (err) {
      console.error('Failed to accept chat:', err)
    }
  }, [currentCard, goToNextCard])

  const handleDeclineChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    try {
      await api.chat.respondToRequest(currentCard.data.id, 'decline')
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

  if (loading) {
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

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchCards}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No cards available</Text>
          <Text style={styles.emptyText}>
            Why not create a position to start a conversation?
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

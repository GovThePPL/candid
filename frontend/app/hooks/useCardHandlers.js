/**
 * Hook for card-type-specific response handlers in the card queue.
 *
 * Each handler calls the relevant API then advances to the next card.
 */
import { useCallback, useContext } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../contexts/UserContext'
import { useToast } from '../components/Toast'
import api from '../lib/api'

const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

export default function useCardHandlers({ currentCard, goToNextCard }) {
  const router = useRouter()
  const showToast = useToast()
  const { t } = useTranslation('cards')
  const { pendingChatRequest, setPendingChatRequest, invalidatePositions } = useContext(UserContext)

  // Position card handlers
  const handleAgree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'agree' }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handleDisagree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'disagree' }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handlePass = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'pass' }])
      goToNextCard()
    } catch (err) {
      console.error('Failed to respond:', err)
    }
  }, [currentCard, goToNextCard])

  const handleChatRequest = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    if (pendingChatRequest) return

    if (currentCard.data?.availability === 'none') {
      const isAlreadyInChattingList = currentCard.data?.source === 'chatting_list'
      if (!isAlreadyInChattingList) {
        try {
          await api.chattingList.addPosition(currentCard.data.id)
        } catch (err) {
          console.error('Failed to add to chatting list:', err)
        }
      }
      showToast(t('addedToChattingList'))
      goToNextCard()
      return
    }

    try {
      const response = await api.chat.createRequest(currentCard.data.userPositionId)
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

  const handleSubmitReport = useCallback(async (positionId, ruleId, comment) => {
    if (!positionId) return
    await api.positions.report(positionId, ruleId, comment)
    goToNextCard()
  }, [goToNextCard])

  const handleDismissRemoval = useCallback(async () => {
    if (currentCard?.type !== 'position_removed_notification') return
    try {
      await api.cards.dismissPositionRemovedNotification(currentCard.data.positionId)
      goToNextCard()
    } catch (err) {
      console.error('Failed to dismiss removal notification:', err)
    }
  }, [currentCard, goToNextCard])

  const handleAdoptPosition = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.adopt(currentCard.data.id)
      invalidatePositions()
    } catch (err) {
      console.error('Failed to adopt position:', err)
    }
  }, [currentCard, invalidatePositions])

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

  const handleSurveySkip = useCallback(() => { goToNextCard() }, [goToNextCard])

  // Demographic handlers
  const handleDemographicResponse = useCallback(async (field, value) => {
    try {
      await api.users.updateDemographics({ [field]: value })
    } catch (err) {
      console.error('Failed to update demographics:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  const handleDemographicSkip = useCallback(() => { goToNextCard() }, [goToNextCard])

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

  const handlePairwiseSkip = useCallback(() => { goToNextCard() }, [goToNextCard])

  // Diagnostics consent handlers
  const handleDiagnosticsAccept = useCallback(async () => {
    try {
      await api.users.updateDiagnosticsConsent(true)
    } catch (err) {
      console.error('Failed to update diagnostics consent:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  const handleDiagnosticsDecline = useCallback(async () => {
    try {
      await api.users.updateDiagnosticsConsent(false)
    } catch (err) {
      console.error('Failed to update diagnostics consent:', err)
    }
    goToNextCard()
  }, [goToNextCard])

  return {
    pendingChatRequest,
    handleAgree, handleDisagree, handlePass, handleChatRequest,
    handleSubmitReport, handleDismissRemoval, handleAdoptPosition,
    handleAcceptChat, handleDeclineChat,
    handleSurveyResponse, handleSurveySkip,
    handleDemographicResponse, handleDemographicSkip,
    handleSendKudos, handleDismissKudos, handleAcknowledgeKudos,
    handlePairwiseResponse, handlePairwiseSkip,
    handleDiagnosticsAccept, handleDiagnosticsDecline,
  }
}

/**
 * Hook for card-type-specific response handlers in the card queue.
 *
 * Each handler advances optimistically then fires the API in the background.
 */
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useChatContext, useNavigationContext } from '../contexts/UserContext'
import { useToast } from '../components/Toast'
import api from '../lib/api'

const CHAT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000

export default function useCardHandlers({ currentCard, goToNextCard }) {
  const router = useRouter()
  const showToast = useToast()
  const { t } = useTranslation('cards')
  const { pendingChatRequest, setPendingChatRequest } = useChatContext()
  const { invalidatePositions } = useNavigationContext()

  // Position card handlers
  const handleAgree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    goToNextCard()
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'agree' }])
    } catch (err) {
      console.error('Failed to respond:', err)
      showToast(t('errorResponseFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handleDisagree = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    goToNextCard()
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'disagree' }])
    } catch (err) {
      console.error('Failed to respond:', err)
      showToast(t('errorResponseFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handlePass = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    goToNextCard()
    try {
      await api.positions.respond([{ positionId: currentCard.data.id, response: 'pass' }])
    } catch (err) {
      console.error('Failed to respond:', err)
      showToast(t('errorResponseFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handleChatRequest = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    if (pendingChatRequest) return

    if (currentCard.data?.availability === 'none') {
      const isAlreadyInChattingList = currentCard.data?.source === 'chatting_list'
      showToast(t('addedToChattingList'), { position: 'top' })
      goToNextCard()
      if (!isAlreadyInChattingList) {
        try {
          await api.chattingList.addPosition(currentCard.data.id)
        } catch (err) {
          console.error('Failed to add to chatting list:', err)
          showToast(t('errorChattingListFailed'), { position: 'top' })
        }
      }
      return
    }

    goToNextCard()
    try {
      const response = await api.chat.createRequest(currentCard.data.userPositionId)
      const now = new Date()
      const author = currentCard.data.creator || {}
      setPendingChatRequest({
        id: response.id,
        positionId: currentCard.data.id,
        createdTime: now.toISOString(),
        expiresAt: new Date(now.getTime() + CHAT_REQUEST_TIMEOUT_MS).toISOString(),
        positionStatement: currentCard.data.statement,
        session: currentCard.data.session,
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
    } catch (err) {
      console.error('Failed to create chat request:', err)
      showToast(t('errorChatRequestFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, setPendingChatRequest, pendingChatRequest, showToast, t])

  const handleSubmitReport = useCallback(async (positionId, ruleId, comment) => {
    if (!positionId) return
    goToNextCard()
    try {
      await api.positions.report(positionId, ruleId, comment)
    } catch (err) {
      console.error('Failed to submit report:', err)
      showToast(t('errorReportFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  const handleDismissRemoval = useCallback(async () => {
    if (currentCard?.type !== 'position_removed_notification') return
    goToNextCard()
    try {
      await api.cards.dismissPositionRemovedNotification(currentCard.data.positionId)
    } catch (err) {
      console.error('Failed to dismiss removal notification:', err)
      showToast(t('errorDismissFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handleAdoptPosition = useCallback(async () => {
    if (currentCard?.type !== 'position') return
    try {
      await api.positions.adopt(currentCard.data.id)
      invalidatePositions()
    } catch (err) {
      console.error('Failed to adopt position:', err)
      showToast(t('errorAdoptFailed'), { position: 'top' })
    }
  }, [currentCard, invalidatePositions, showToast, t])

  // Chat request handlers
  const handleAcceptChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    goToNextCard()
    try {
      const response = await api.chat.respondToRequest(currentCard.data.id, 'accepted')
      if (response?.chatLogId) {
        router.push(`/chat/${response.chatLogId}`)
      }
    } catch (err) {
      console.error('Failed to accept chat:', err)
      showToast(t('errorChatAcceptFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, router, showToast, t])

  const handleDeclineChat = useCallback(async () => {
    if (currentCard?.type !== 'chat_request') return
    goToNextCard()
    try {
      await api.chat.respondToRequest(currentCard.data.id, 'dismissed')
    } catch (err) {
      // 404 = request already rescinded by sender or expired — not a real error
      const is404 = err?.message?.includes('404') || err?.status === 404
      if (!is404) {
        console.error('Failed to decline chat:', err)
        showToast(t('errorChatDeclineFailed'), { position: 'top' })
      }
    }
  }, [currentCard, goToNextCard, showToast, t])

  // Survey handlers
  const handleSurveyResponse = useCallback(async (surveyId, questionId, optionId) => {
    goToNextCard()
    try {
      await api.surveys.respond(surveyId, questionId, optionId)
    } catch (err) {
      console.error('Failed to submit survey response:', err)
      showToast(t('errorSurveyFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  const handleSurveySkip = useCallback(() => { goToNextCard() }, [goToNextCard])

  // Demographic handlers
  const handleDemographicResponse = useCallback(async (field, value) => {
    goToNextCard()
    try {
      await api.users.updateDemographics({ [field]: value })
    } catch (err) {
      console.error('Failed to update demographics:', err)
      showToast(t('errorDemographicFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  const handleDemographicSkip = useCallback(() => { goToNextCard() }, [goToNextCard])

  // Kudos handlers
  const handleSendKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    goToNextCard()
    try {
      await api.chat.sendKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to send kudos:', err)
      showToast(t('errorKudosFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handleDismissKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    goToNextCard()
    try {
      await api.chat.dismissKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to dismiss kudos:', err)
      showToast(t('errorDismissFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  const handleAcknowledgeKudos = useCallback(async () => {
    if (currentCard?.type !== 'kudos') return
    goToNextCard()
    try {
      await api.chat.acknowledgeKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to acknowledge kudos:', err)
      showToast(t('errorKudosFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  // Pairwise comparison handlers
  const handlePairwiseResponse = useCallback(async (surveyId, winnerItemId, loserItemId) => {
    goToNextCard()
    try {
      await api.surveys.respondToPairwise(surveyId, winnerItemId, loserItemId)
    } catch (err) {
      console.error('Failed to submit pairwise response:', err)
      showToast(t('errorResponseFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  const handlePairwiseSkip = useCallback(() => { goToNextCard() }, [goToNextCard])

  // Bridging kudos handler
  const handleDismissBridgingKudos = useCallback(async () => {
    if (currentCard?.type !== 'bridging_kudos') return
    goToNextCard()
    try {
      await api.cards.dismissBridgingKudos(currentCard.data.id)
    } catch (err) {
      console.error('Failed to dismiss bridging kudos:', err)
      showToast(t('errorDismissFailed'), { position: 'top' })
    }
  }, [currentCard, goToNextCard, showToast, t])

  // Diagnostics consent handlers
  const handleDiagnosticsAccept = useCallback(async () => {
    goToNextCard()
    try {
      await api.users.updateDiagnosticsConsent(true)
    } catch (err) {
      console.error('Failed to update diagnostics consent:', err)
      showToast(t('errorDiagnosticsFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  const handleDiagnosticsDecline = useCallback(async () => {
    goToNextCard()
    try {
      await api.users.updateDiagnosticsConsent(false)
    } catch (err) {
      console.error('Failed to update diagnostics consent:', err)
      showToast(t('errorDiagnosticsFailed'), { position: 'top' })
    }
  }, [goToNextCard, showToast, t])

  return {
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
  }
}

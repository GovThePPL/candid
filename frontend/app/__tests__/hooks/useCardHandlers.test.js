import { renderHook, act } from '@testing-library/react-native'

// Mocks must be set up before imports
const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockShowToast = jest.fn()
jest.mock('../../components/Toast', () => ({
  useToast: () => mockShowToast,
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}))

// Mock UserContext to avoid keycloak/expo-auth-session import
const mockSetPendingChatRequest = jest.fn()
const mockInvalidatePositions = jest.fn()
jest.mock('../../contexts/UserContext', () => ({
  UserContext: {
    _currentValue: {
      pendingChatRequest: null,
      setPendingChatRequest: jest.fn(),
      invalidatePositions: jest.fn(),
    },
  },
}))

// Override useContext to return our mock values
const React = require('react')
const originalUseContext = React.useContext
jest.spyOn(React, 'useContext').mockImplementation((context) => {
  if (context === require('../../contexts/UserContext').UserContext) {
    return {
      pendingChatRequest: null,
      setPendingChatRequest: mockSetPendingChatRequest,
      invalidatePositions: mockInvalidatePositions,
    }
  }
  return originalUseContext(context)
})

const mockRespond = jest.fn()
const mockReport = jest.fn()
const mockAdopt = jest.fn()
const mockCreateRequest = jest.fn()
const mockRespondToRequest = jest.fn()
const mockSurveyRespond = jest.fn()
const mockUpdateDemographics = jest.fn()
const mockSendKudos = jest.fn()
const mockDismissKudos = jest.fn()
const mockAcknowledgeKudos = jest.fn()
const mockRespondToPairwise = jest.fn()
const mockUpdateDiagnosticsConsent = jest.fn()
const mockDismissPositionRemovedNotification = jest.fn()
const mockAddPosition = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    positions: {
      respond: (...args) => mockRespond(...args),
      report: (...args) => mockReport(...args),
      adopt: (...args) => mockAdopt(...args),
    },
    chat: {
      createRequest: (...args) => mockCreateRequest(...args),
      respondToRequest: (...args) => mockRespondToRequest(...args),
      sendKudos: (...args) => mockSendKudos(...args),
      dismissKudos: (...args) => mockDismissKudos(...args),
      acknowledgeKudos: (...args) => mockAcknowledgeKudos(...args),
    },
    surveys: {
      respond: (...args) => mockSurveyRespond(...args),
      respondToPairwise: (...args) => mockRespondToPairwise(...args),
    },
    users: {
      updateDemographics: (...args) => mockUpdateDemographics(...args),
      updateDiagnosticsConsent: (...args) => mockUpdateDiagnosticsConsent(...args),
    },
    cards: {
      dismissPositionRemovedNotification: (...args) => mockDismissPositionRemovedNotification(...args),
    },
    chattingList: {
      addPosition: (...args) => mockAddPosition(...args),
    },
  },
}))

import useCardHandlers from '../../hooks/useCardHandlers'

const positionCard = {
  type: 'position',
  data: { id: 'p1', userPositionId: 'up1', statement: 'test', creator: { displayName: 'User' } },
}

const chatRequestCard = {
  type: 'chat_request',
  data: { id: 'cr1' },
}

const kudosCard = {
  type: 'kudos',
  data: { id: 'k1' },
}

const removedCard = {
  type: 'position_removed_notification',
  data: { positionId: 'p1' },
}

describe('useCardHandlers', () => {
  let goToNextCard

  beforeEach(() => {
    jest.clearAllMocks()
    goToNextCard = jest.fn()
  })

  // Helper to render the hook with a given card
  const setup = (card) =>
    renderHook(() => useCardHandlers({ currentCard: card, goToNextCard }))

  describe('optimistic advance', () => {
    it('handleAgree calls goToNextCard before API resolves', async () => {
      let resolveApi
      mockRespond.mockReturnValue(new Promise((r) => { resolveApi = r }))

      const { result } = setup(positionCard)

      await act(async () => {
        result.current.handleAgree()
      })

      // goToNextCard was called immediately
      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockRespond).toHaveBeenCalledWith([{ positionId: 'p1', response: 'agree' }])

      resolveApi()
    })

    it('handleDisagree calls goToNextCard before API resolves', async () => {
      mockRespond.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDisagree()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockRespond).toHaveBeenCalledWith([{ positionId: 'p1', response: 'disagree' }])
    })

    it('handlePass calls goToNextCard before API resolves', async () => {
      mockRespond.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handlePass()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockRespond).toHaveBeenCalledWith([{ positionId: 'p1', response: 'pass' }])
    })

    it('handleAcceptChat advances then navigates on success', async () => {
      mockRespondToRequest.mockResolvedValue({ chatLogId: 'chat-123' })
      const { result } = setup(chatRequestCard)

      await act(async () => {
        await result.current.handleAcceptChat()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockRespondToRequest).toHaveBeenCalledWith('cr1', 'accepted')
      expect(mockPush).toHaveBeenCalledWith('/chat/chat-123')
    })

    it('handleDeclineChat advances immediately', async () => {
      mockRespondToRequest.mockResolvedValue({})
      const { result } = setup(chatRequestCard)

      await act(async () => {
        await result.current.handleDeclineChat()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockRespondToRequest).toHaveBeenCalledWith('cr1', 'dismissed')
    })

    it('handleSurveyResponse advances immediately', async () => {
      mockSurveyRespond.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleSurveyResponse('s1', 'q1', 'o1')
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handleDemographicResponse advances immediately', async () => {
      mockUpdateDemographics.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDemographicResponse('age', '25-34')
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handleSendKudos advances immediately', async () => {
      mockSendKudos.mockResolvedValue({})
      const { result } = setup(kudosCard)

      await act(async () => {
        await result.current.handleSendKudos()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handleDismissRemoval advances immediately', async () => {
      mockDismissPositionRemovedNotification.mockResolvedValue({})
      const { result } = setup(removedCard)

      await act(async () => {
        await result.current.handleDismissRemoval()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handleDiagnosticsAccept advances immediately', async () => {
      mockUpdateDiagnosticsConsent.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDiagnosticsAccept()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handleSubmitReport advances immediately', async () => {
      mockReport.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleSubmitReport('p1', 'r1', 'comment')
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })

    it('handlePairwiseResponse advances immediately', async () => {
      mockRespondToPairwise.mockResolvedValue({})
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handlePairwiseResponse('s1', 'w1', 'l1')
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleChatRequest', () => {
    it('availability=none: advances + toasts immediately, API fires in background', async () => {
      mockAddPosition.mockResolvedValue({})
      const card = {
        type: 'position',
        data: { id: 'p1', availability: 'none', source: null },
      }
      const { result } = setup(card)

      await act(async () => {
        await result.current.handleChatRequest()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockShowToast).toHaveBeenCalledWith('addedToChattingList')
      expect(mockAddPosition).toHaveBeenCalledWith('p1')
    })

    it('availability=none + already in chatting list: skips API call', async () => {
      const card = {
        type: 'position',
        data: { id: 'p1', availability: 'none', source: 'chatting_list' },
      }
      const { result } = setup(card)

      await act(async () => {
        await result.current.handleChatRequest()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockAddPosition).not.toHaveBeenCalled()
    })

    it('normal: advances immediately, sets pending state after API resolves', async () => {
      mockCreateRequest.mockResolvedValue({ id: 'req-1' })
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleChatRequest()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockCreateRequest).toHaveBeenCalledWith('up1')
      expect(mockSetPendingChatRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1', status: 'pending' })
      )
    })
  })

  describe('error toasts', () => {
    it('handleAgree shows toast on API failure', async () => {
      mockRespond.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleAgree()
      })

      expect(goToNextCard).toHaveBeenCalledTimes(1)
      expect(mockShowToast).toHaveBeenCalledWith('errorResponseFailed')
    })

    it('handleDisagree shows toast on API failure', async () => {
      mockRespond.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDisagree()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorResponseFailed')
    })

    it('handlePass shows toast on API failure', async () => {
      mockRespond.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handlePass()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorResponseFailed')
    })

    it('handleChatRequest shows toast on API failure', async () => {
      mockCreateRequest.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleChatRequest()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorChatRequestFailed')
    })

    it('handleAcceptChat shows toast on API failure', async () => {
      mockRespondToRequest.mockRejectedValue(new Error('fail'))
      const { result } = setup(chatRequestCard)

      await act(async () => {
        await result.current.handleAcceptChat()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorChatAcceptFailed')
    })

    it('handleDeclineChat shows toast on API failure', async () => {
      mockRespondToRequest.mockRejectedValue(new Error('fail'))
      const { result } = setup(chatRequestCard)

      await act(async () => {
        await result.current.handleDeclineChat()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorChatDeclineFailed')
    })

    it('handleSubmitReport shows toast on API failure', async () => {
      mockReport.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleSubmitReport('p1', 'r1', 'comment')
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorReportFailed')
    })

    it('handleDismissRemoval shows toast on API failure', async () => {
      mockDismissPositionRemovedNotification.mockRejectedValue(new Error('fail'))
      const { result } = setup(removedCard)

      await act(async () => {
        await result.current.handleDismissRemoval()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorDismissFailed')
    })

    it('handleAdoptPosition shows toast on API failure', async () => {
      mockAdopt.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleAdoptPosition()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorAdoptFailed')
    })

    it('handleSurveyResponse shows toast on API failure', async () => {
      mockSurveyRespond.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleSurveyResponse('s1', 'q1', 'o1')
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorSurveyFailed')
    })

    it('handleDemographicResponse shows toast on API failure', async () => {
      mockUpdateDemographics.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDemographicResponse('age', '25-34')
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorDemographicFailed')
    })

    it('handleSendKudos shows toast on API failure', async () => {
      mockSendKudos.mockRejectedValue(new Error('fail'))
      const { result } = setup(kudosCard)

      await act(async () => {
        await result.current.handleSendKudos()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorKudosFailed')
    })

    it('handleDiagnosticsAccept shows toast on API failure', async () => {
      mockUpdateDiagnosticsConsent.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handleDiagnosticsAccept()
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorDiagnosticsFailed')
    })

    it('handlePairwiseResponse shows toast on API failure', async () => {
      mockRespondToPairwise.mockRejectedValue(new Error('fail'))
      const { result } = setup(positionCard)

      await act(async () => {
        await result.current.handlePairwiseResponse('s1', 'w1', 'l1')
      })

      expect(mockShowToast).toHaveBeenCalledWith('errorResponseFailed')
    })
  })
})

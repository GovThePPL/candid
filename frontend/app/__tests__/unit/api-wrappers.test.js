import AsyncStorage from '@react-native-async-storage/async-storage'

// Store mock API method references in an object that can be accessed from jest.mock factory.
// We use a global-ish container to avoid the const TDZ problem with jest.mock hoisting.
const _mocks = {}

jest.mock('candid_api', () => {
  // Create mock functions and store them for test access
  _mocks.getCardQueue = jest.fn()
  _mocks.getUserChats = jest.fn()
  _mocks.getActiveSurveys = jest.fn()
  _mocks.getPairwiseSurveys = jest.fn()
  _mocks.searchSimilarPositions = jest.fn()

  const mockAuth = { BearerAuth: { accessToken: null } }
  return {
    ApiClient: jest.fn(() => ({ authentications: mockAuth })),
    UsersApi: jest.fn(() => ({
      getCurrentUser: jest.fn(),
      getCurrentUserPositions: jest.fn(),
      getCurrentUserPositionsMetadata: jest.fn(),
    })),
    CardsApi: jest.fn(() => ({
      getCardQueue: _mocks.getCardQueue,
      dismissPositionRemovedNotification: jest.fn(),
    })),
    PositionsApi: jest.fn(() => ({
      respondToPositions: jest.fn(),
      createPosition: jest.fn(),
      adoptPosition: jest.fn(),
      searchSimilarPositions: _mocks.searchSimilarPositions,
      searchStatsPositions: jest.fn(),
      getPositionAgreedClosures: jest.fn(),
    })),
    ChatApi: jest.fn(() => ({
      createChatRequest: jest.fn(),
      getUserChats: _mocks.getUserChats,
      getUserChatsMetadata: jest.fn(),
      respondToChatRequest: jest.fn(),
      rescindChatRequest: jest.fn(),
      getChatLog: jest.fn(),
      sendKudos: jest.fn(),
      dismissKudos: jest.fn(),
    })),
    SurveysApi: jest.fn(() => ({
      respondToSurveyQuestion: jest.fn(),
      respondToPairwise: jest.fn(),
      getPairwiseSurveys: _mocks.getPairwiseSurveys,
      getActiveSurveys: _mocks.getActiveSurveys,
      getSurveyRankings: jest.fn(),
      getStandardSurveyResults: jest.fn(),
      getQuestionCrosstabs: jest.fn(),
    })),
    CategoriesApi: jest.fn(() => ({
      getAllCategories: jest.fn(),
      suggestCategory: jest.fn(),
    })),
    ChattingListApi: jest.fn(() => ({
      getChattingList: jest.fn(),
      getChattingListMetadata: jest.fn(),
      addToChattingList: jest.fn(),
      updateChattingListItem: jest.fn(),
      removeFromChattingList: jest.fn(),
      markChattingListExplanationSeen: jest.fn(),
      bulkRemoveFromChattingList: jest.fn(),
    })),
    StatsApi: jest.fn(() => ({
      getLocationStats: jest.fn(),
      getStats: jest.fn(),
      getGroupDemographics: jest.fn(),
    })),
    ModerationApi: jest.fn(() => ({
      getRules: jest.fn(),
      getModerationQueue: jest.fn(),
      reportPosition: jest.fn(),
      reportChat: jest.fn(),
      takeModeratorAction: jest.fn(),
      respondToAppeal: jest.fn(),
      createAppeal: jest.fn(),
      dismissAdminResponseNotification: jest.fn(),
      getUserModerationHistory: jest.fn(),
      claimReport: jest.fn(),
      releaseReport: jest.fn(),
    })),
    BugReportsApi: jest.fn(() => ({
      createBugReport: jest.fn(),
    })),
  }
})

jest.mock('../../lib/cache', () => ({
  CacheManager: { clearAll: jest.fn(() => Promise.resolve()) },
}))

jest.mock('../../lib/errorCollector', () => ({
  recordApiError: jest.fn(),
}))

import {
  cardsApiWrapper,
  chatApiWrapper,
  surveysApiWrapper,
} from '../../lib/api'
import { recordApiError } from '../../lib/errorCollector'

beforeEach(() => {
  jest.clearAllMocks()
  AsyncStorage.getItem.mockResolvedValue(null)
})

describe('cardsApiWrapper.getCardQueue', () => {
  it('resolves with response.body on success', async () => {
    const mockCards = [{ type: 'vote', id: 1 }, { type: 'survey', id: 2 }]
    _mocks.getCardQueue.mockImplementation((opts, callback) => {
      callback(null, null, { body: mockCards })
    })

    const result = await cardsApiWrapper.getCardQueue(10)
    expect(result).toEqual(mockCards)
  })

  it('resolves with empty array when no body and no error', async () => {
    _mocks.getCardQueue.mockImplementation((opts, callback) => {
      callback(null, null, {})
    })

    const result = await cardsApiWrapper.getCardQueue()
    expect(result).toEqual([])
  })

  it('rejects on error when no response body', async () => {
    _mocks.getCardQueue.mockImplementation((opts, callback) => {
      callback(new Error('network'), null, null)
    })

    await expect(cardsApiWrapper.getCardQueue()).rejects.toThrow('network')
  })
})

describe('chatApiWrapper.getActiveChat', () => {
  it('returns the first chat without endTime', async () => {
    const chats = [
      { id: 'c1', endTime: '2024-01-01' },
      { id: 'c2', endTime: null },
      { id: 'c3', endTime: null },
    ]
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(null, chats, {})
    })

    const result = await chatApiWrapper.getActiveChat('u1')
    expect(result.id).toBe('c2')
  })

  it('returns null when all chats have ended', async () => {
    const chats = [
      { id: 'c1', endTime: '2024-01-01' },
      { id: 'c2', endTime: '2024-01-02' },
    ]
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(null, chats, {})
    })

    const result = await chatApiWrapper.getActiveChat('u1')
    expect(result).toBeNull()
  })

  it('returns null when no chats exist', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(null, [], {})
    })

    const result = await chatApiWrapper.getActiveChat('u1')
    expect(result).toBeNull()
  })
})

describe('surveysApiWrapper.getAllSurveys', () => {
  it('merges and sorts pairwise and standard surveys', async () => {
    const pairwise = [
      { id: 'p1', isActive: true, endTime: null },
    ]
    const standard = [
      { id: 's1', isActive: false, endTime: '2024-06-01' },
      { id: 's2', isActive: true, endTime: null },
    ]

    _mocks.getPairwiseSurveys.mockImplementation((opts, callback) => {
      callback(null, pairwise, {})
    })
    _mocks.getActiveSurveys.mockImplementation((opts, callback) => {
      callback(null, standard, {})
    })

    const result = await surveysApiWrapper.getAllSurveys('loc1', 'cat1')
    // Active surveys should come first
    expect(result[0].isActive).toBe(true)
    expect(result[1].isActive).toBe(true)
    expect(result[2].isActive).toBe(false)
    expect(result).toHaveLength(3)
  })

  it('sorts inactive surveys by end time descending', async () => {
    const pairwise = []
    const standard = [
      { id: 's1', isActive: false, endTime: '2024-01-01' },
      { id: 's2', isActive: false, endTime: '2024-06-01' },
    ]

    _mocks.getPairwiseSurveys.mockImplementation((opts, callback) => {
      callback(null, pairwise, {})
    })
    _mocks.getActiveSurveys.mockImplementation((opts, callback) => {
      callback(null, standard, {})
    })

    const result = await surveysApiWrapper.getAllSurveys('loc1')
    expect(result[0].id).toBe('s2')
    expect(result[1].id).toBe('s1')
  })
})

describe('promisify error recording', () => {
  it('records API errors on failure', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Not Found', status: 404 },
        null,
        { status: 404, req: { path: '/users/u1/chats' } }
      )
    })

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    expect(recordApiError).toHaveBeenCalledWith('/users/u1/chats', 404, 'Not Found')
  })
})

import AsyncStorage from '@react-native-async-storage/async-storage'

// Mock secureStorage (used by getOrRefreshToken and setToken inside promisify)
const mockGetSecureItem = jest.fn(() => Promise.resolve(null))
const mockSetSecureItem = jest.fn(() => Promise.resolve())
const mockDeleteSecureItem = jest.fn(() => Promise.resolve())

jest.mock('../../lib/secureStorage', () => ({
  getSecureItem: (...args) => mockGetSecureItem(...args),
  setSecureItem: (...args) => mockSetSecureItem(...args),
  deleteSecureItem: (...args) => mockDeleteSecureItem(...args),
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
  loginWithCredentials: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
}))

// Mock atob for JWT decoding (not available in Node test env)
global.atob = (str) => Buffer.from(str, 'base64').toString('binary')

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
      createUserPosition: jest.fn(),
      updatePushToken: jest.fn(),
      getUserById: _mocks.getUserById = jest.fn(),
      getUserActivityById: _mocks.getUserActivityById = jest.fn(),
      getUserActivity: _mocks.getUserActivity = jest.fn(),
    })),
    CardsApi: jest.fn(() => ({
      getCardQueue: _mocks.getCardQueue,
      deletePositionNotification: jest.fn(),
    })),
    PositionsApi: jest.fn(() => ({
      createPositionResponses: jest.fn(),
      createPosition: jest.fn(),
      searchSimilarPositions: _mocks.searchSimilarPositions,
      getPositionsStats: jest.fn(),
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
      deleteKudosPrompt: jest.fn(),
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
    SessionsApi: jest.fn(() => ({
      getAllSessions: jest.fn(),
      getSessionSuggestions: jest.fn(),
    })),
    ChattingListApi: jest.fn(() => ({
      getChattingList: jest.fn(),
      getChattingListMetadata: jest.fn(),
      addToChattingList: jest.fn(),
      updateChattingListItem: jest.fn(),
      removeFromChattingList: jest.fn(),
      markChattingListExplanationSeen: jest.fn(),
      bulkDeleteChattingListItems: jest.fn(),
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
      deleteAdminResponseNotification: jest.fn(),
      getUserModerationHistory: jest.fn(),
      updateReport: jest.fn(),
    })),
    BugReportsApi: jest.fn(() => ({
      createBugReport: jest.fn(),
    })),
    AdminApi: jest.fn(() => ({
      searchUsers: _mocks.adminSearchUsers = jest.fn(),
      listRoles: _mocks.adminListRoles = jest.fn(),
      createRoleRequest: _mocks.adminCreateRoleRequest = jest.fn(),
      getPendingRoleRequests: _mocks.adminGetPendingRoleRequests = jest.fn(),
      getRoleRequests: _mocks.adminGetRoleRequests = jest.fn(),
      updateRoleRequest: _mocks.adminUpdateRoleRequest = jest.fn(),
      createLocation: _mocks.adminCreateLocation = jest.fn(),
      updateLocation: _mocks.adminUpdateLocation = jest.fn(),
      deleteLocation: _mocks.adminDeleteLocation = jest.fn(),
      getLocationSessions: _mocks.adminGetLocationSessions = jest.fn(),
      assignLocationSession: _mocks.adminAssignLocationSession = jest.fn(),
      removeLocationSession: _mocks.adminRemoveLocationSession = jest.fn(),
      createSession: _mocks.adminCreateSession = jest.fn(),
      getSessionLabelSurvey: _mocks.adminGetSessionLabelSurvey = jest.fn(),
      updateUserStatus: _mocks.adminUpdateUserStatus = jest.fn(),
      getSurveys: _mocks.adminGetSurveys = jest.fn(),
      createSurvey: _mocks.adminCreateSurvey = jest.fn(),
      createPairwiseSurvey: _mocks.adminCreatePairwiseSurvey = jest.fn(),
      deleteSurvey: _mocks.adminDeleteSurvey = jest.fn(),
      getAdminActions: _mocks.adminGetAdminActions = jest.fn(),
    })),
    AuthenticationApi: jest.fn(() => ({
      registerUser: _mocks.registerUser = jest.fn(),
    })),
    PostsApi: jest.fn(() => ({
      getPosts: _mocks.getPosts = jest.fn(),
      getPost: jest.fn(),
      createPost: jest.fn(),
      updatePost: jest.fn(),
      deletePost: jest.fn(),
      voteOnPost: _mocks.voteOnPost = jest.fn(),
      patchPost: jest.fn(),
    })),
    CommentsApi: jest.fn(() => ({
      getComments: jest.fn(),
      createComment: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn(),
      voteOnComment: jest.fn(),
    })),
    NotificationsApi: jest.fn(() => ({
      getNotifications: jest.fn(),
      getNotificationsUnreadCount: jest.fn(),
      markNotificationRead: jest.fn(),
      markAllNotificationsRead: jest.fn(),
    })),
    GlossaryApi: jest.fn(() => ({
      getGlossaryTerms: jest.fn(),
      getGlossaryTerm: jest.fn(),
      updateGlossaryTerm: jest.fn(),
      getWikiPages: jest.fn(),
      getWikiPage: jest.fn(),
      getWikiCategories: jest.fn(),
      updateWikiPage: jest.fn(),
      createWikiSuggestion: jest.fn(),
      getWikiSuggestions: jest.fn(),
      getWikiSuggestion: jest.fn(),
      updateWikiSuggestion: jest.fn(),
      getWikiSuggestionCount: jest.fn(),
      getWikiImage: jest.fn(),
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
  authApi,
  cardsApiWrapper,
  chatApiWrapper,
  surveysApiWrapper,
  postsApiWrapper,
  adminApiWrapper,
  usersApiWrapper,
} from '../../lib/api'
import { recordApiError } from '../../lib/errorCollector'
import * as keycloak from '../../lib/keycloak'

beforeEach(() => {
  jest.clearAllMocks()
  AsyncStorage.getItem.mockResolvedValue(null)
  mockGetSecureItem.mockResolvedValue(null)
  mockSetSecureItem.mockResolvedValue()
  mockDeleteSecureItem.mockResolvedValue()
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

  it('passes sessionId in opts when provided', async () => {
    const mockCards = [{ type: 'position', data: { id: 'p1' } }]
    _mocks.getCardQueue.mockImplementation((opts, callback) => {
      callback(null, null, { body: mockCards })
    })

    await cardsApiWrapper.getCardQueue(10, 'sess-123')
    expect(_mocks.getCardQueue).toHaveBeenCalledWith(
      { limit: 10, sessionId: 'sess-123' },
      expect.any(Function)
    )
  })

  it('omits sessionId from opts when null', async () => {
    const mockCards = []
    _mocks.getCardQueue.mockImplementation((opts, callback) => {
      callback(null, null, { body: mockCards })
    })

    await cardsApiWrapper.getCardQueue(10, null)
    expect(_mocks.getCardQueue).toHaveBeenCalledWith(
      { limit: 10 },
      expect.any(Function)
    )
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

    const result = await surveysApiWrapper.getAllSurveys('loc1', 'sess1')
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

describe('postsApiWrapper.getPosts', () => {
  it('passes all filter options to the API', async () => {
    const mockResult = { posts: [{ id: 'p1' }], hasMore: false, nextCursor: null }
    _mocks.getPosts.mockImplementation((locationId, opts, callback) => {
      callback(null, mockResult, {})
    })

    const result = await postsApiWrapper.getPosts('loc1', {
      sessionId: 'sess1',
      postType: 'discussion',
      sort: 'new',
      limit: 10,
      answered: 'true',
    })

    expect(result).toEqual(mockResult)
    expect(_mocks.getPosts).toHaveBeenCalledWith(
      'loc1',
      expect.objectContaining({
        sessionId: 'sess1',
        postType: 'discussion',
        sort: 'new',
        limit: 10,
        answered: 'true',
      }),
      expect.any(Function)
    )
  })

  it('omits sessionId when set to "all"', async () => {
    _mocks.getPosts.mockImplementation((locationId, opts, callback) => {
      callback(null, { posts: [], hasMore: false }, {})
    })

    await postsApiWrapper.getPosts('loc1', { sessionId: 'all' })

    const passedOpts = _mocks.getPosts.mock.calls[0][1]
    expect(passedOpts.sessionId).toBeUndefined()
  })

  it('omits undefined optional params', async () => {
    _mocks.getPosts.mockImplementation((locationId, opts, callback) => {
      callback(null, { posts: [], hasMore: false }, {})
    })

    await postsApiWrapper.getPosts('loc1', {})

    const passedOpts = _mocks.getPosts.mock.calls[0][1]
    expect(passedOpts).toEqual({})
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

describe('authApi.registerAccount', () => {
  it('passes credentials to AuthenticationApi.registerUser', async () => {
    const mockResult = { userId: 'u1', username: 'alice' }
    _mocks.registerUser.mockImplementation((body, callback) => {
      callback(null, mockResult, {})
    })

    const result = await authApi.registerAccount({
      username: 'alice', email: 'alice@example.com', password: 'secret',
    })
    expect(result).toEqual(mockResult)
    expect(_mocks.registerUser).toHaveBeenCalledWith(
      { username: 'alice', email: 'alice@example.com', password: 'secret' },
      expect.any(Function)
    )
  })
})

describe('adminApiWrapper', () => {
  // Helper: simulate a successful promisify callback
  const mockSuccess = (mockFn, result = {}) => {
    mockFn.mockImplementation((...args) => {
      const callback = args[args.length - 1]
      callback(null, result, {})
    })
  }

  describe('searchUsers', () => {
    it('maps query to search param with defaults', async () => {
      mockSuccess(_mocks.adminSearchUsers, [{ id: 'u1' }])

      const result = await adminApiWrapper.searchUsers('alice')
      expect(result).toEqual([{ id: 'u1' }])
      expect(_mocks.adminSearchUsers).toHaveBeenCalledWith(
        { search: 'alice', limit: 20, offset: 0 },
        expect.any(Function)
      )
    })

    it('passes custom limit and offset', async () => {
      mockSuccess(_mocks.adminSearchUsers, [])

      await adminApiWrapper.searchUsers('bob', { limit: 5, offset: 10 })
      expect(_mocks.adminSearchUsers).toHaveBeenCalledWith(
        { search: 'bob', limit: 5, offset: 10 },
        expect.any(Function)
      )
    })
  })

  describe('listRoles', () => {
    it('passes filter options through', async () => {
      mockSuccess(_mocks.adminListRoles, [])

      await adminApiWrapper.listRoles({ userId: 'u1', locationId: 'loc1', role: 'moderator' })
      expect(_mocks.adminListRoles).toHaveBeenCalledWith(
        { userId: 'u1', locationId: 'loc1', role: 'moderator' },
        expect.any(Function)
      )
    })

    it('defaults to empty filter', async () => {
      mockSuccess(_mocks.adminListRoles, [])

      await adminApiWrapper.listRoles()
      expect(_mocks.adminListRoles).toHaveBeenCalledWith(
        { userId: undefined, locationId: undefined, role: undefined },
        expect.any(Function)
      )
    })
  })

  describe('requestRoleRemoval', () => {
    it('wraps userRoleId and reason into body with action: remove', async () => {
      mockSuccess(_mocks.adminCreateRoleRequest)

      await adminApiWrapper.requestRoleRemoval('ur1', 'No longer needed')
      expect(_mocks.adminCreateRoleRequest).toHaveBeenCalledWith(
        { action: 'remove', userRoleId: 'ur1', reason: 'No longer needed' },
        expect.any(Function)
      )
    })
  })

  describe('denyRoleRequest', () => {
    it('wraps reason into status body', async () => {
      mockSuccess(_mocks.adminUpdateRoleRequest)

      await adminApiWrapper.denyRoleRequest('req1', 'Insufficient experience')
      expect(_mocks.adminUpdateRoleRequest).toHaveBeenCalledWith(
        'req1',
        { status: 'denied', reason: 'Insufficient experience' },
        expect.any(Function)
      )
    })
  })

  describe('role request actions', () => {
    it('approveRoleRequest passes requestId with approved status', async () => {
      mockSuccess(_mocks.adminUpdateRoleRequest)

      await adminApiWrapper.approveRoleRequest('req1')
      expect(_mocks.adminUpdateRoleRequest).toHaveBeenCalledWith(
        'req1', { status: 'approved' }, expect.any(Function)
      )
    })

    it('rescindRoleRequest passes requestId with rescinded status', async () => {
      mockSuccess(_mocks.adminUpdateRoleRequest)

      await adminApiWrapper.rescindRoleRequest('req1')
      expect(_mocks.adminUpdateRoleRequest).toHaveBeenCalledWith(
        'req1', { status: 'rescinded' }, expect.any(Function)
      )
    })

    it('getPendingRequests calls getPendingRoleRequests', async () => {
      mockSuccess(_mocks.adminGetPendingRoleRequests, [])

      const result = await adminApiWrapper.getPendingRequests()
      expect(result).toEqual([])
      expect(_mocks.adminGetPendingRoleRequests).toHaveBeenCalledWith(
        expect.any(Function)
      )
    })

    it('getRoleRequests passes view param', async () => {
      mockSuccess(_mocks.adminGetRoleRequests, [])

      await adminApiWrapper.getRoleRequests('all')
      expect(_mocks.adminGetRoleRequests).toHaveBeenCalledWith(
        { view: 'all' }, expect.any(Function)
      )
    })
  })

  describe('location management', () => {
    it('createLocation wraps args into body', async () => {
      mockSuccess(_mocks.adminCreateLocation, { id: 'loc-new' })

      const result = await adminApiWrapper.createLocation('loc-parent', 'Oregon', 'OR')
      expect(result).toEqual({ id: 'loc-new' })
      expect(_mocks.adminCreateLocation).toHaveBeenCalledWith(
        { parentLocationId: 'loc-parent', name: 'Oregon', code: 'OR' },
        expect.any(Function)
      )
    })

    it('updateLocation passes locationId and updates', async () => {
      mockSuccess(_mocks.adminUpdateLocation)

      await adminApiWrapper.updateLocation('loc1', { name: 'Updated' })
      expect(_mocks.adminUpdateLocation).toHaveBeenCalledWith(
        'loc1', { name: 'Updated' }, expect.any(Function)
      )
    })

    it('deleteLocation passes locationId', async () => {
      mockSuccess(_mocks.adminDeleteLocation)

      await adminApiWrapper.deleteLocation('loc1')
      expect(_mocks.adminDeleteLocation).toHaveBeenCalledWith(
        'loc1', expect.any(Function)
      )
    })
  })

  describe('session management', () => {
    it('assignLocationSession wraps sessionId in body', async () => {
      mockSuccess(_mocks.adminAssignLocationSession)

      await adminApiWrapper.assignLocationSession('loc1', 'sess1')
      expect(_mocks.adminAssignLocationSession).toHaveBeenCalledWith(
        'loc1', { sessionId: 'sess1' }, expect.any(Function)
      )
    })

    it('removeLocationSession passes both path params', async () => {
      mockSuccess(_mocks.adminRemoveLocationSession)

      await adminApiWrapper.removeLocationSession('loc1', 'sess1')
      expect(_mocks.adminRemoveLocationSession).toHaveBeenCalledWith(
        'loc1', 'sess1', expect.any(Function)
      )
    })

    it('createSession merges label, parent, and opts into body', async () => {
      mockSuccess(_mocks.adminCreateSession, { id: 'sess-new' })

      await adminApiWrapper.createSession('Climate', 'sess-parent', { description: 'Climate issues' })
      expect(_mocks.adminCreateSession).toHaveBeenCalledWith(
        { label: 'Climate', parentSessionId: 'sess-parent', description: 'Climate issues' },
        expect.any(Function)
      )
    })
  })

  describe('ban/unban', () => {
    it('banUser sends status banned with reason', async () => {
      mockSuccess(_mocks.adminUpdateUserStatus)

      await adminApiWrapper.banUser('u1', 'Spam')
      expect(_mocks.adminUpdateUserStatus).toHaveBeenCalledWith(
        'u1', { status: 'banned', reason: 'Spam' }, expect.any(Function)
      )
    })

    it('unbanUser sends status active with reason', async () => {
      mockSuccess(_mocks.adminUpdateUserStatus)

      await adminApiWrapper.unbanUser('u1', 'Reviewed')
      expect(_mocks.adminUpdateUserStatus).toHaveBeenCalledWith(
        'u1', { status: 'active', reason: 'Reviewed' }, expect.any(Function)
      )
    })
  })

  describe('survey management', () => {
    it('getSurveys passes filter options', async () => {
      mockSuccess(_mocks.adminGetSurveys, [])

      await adminApiWrapper.getSurveys({ title: 'test', status: 'active', locationId: 'loc1' })
      expect(_mocks.adminGetSurveys).toHaveBeenCalledWith(
        { title: 'test', status: 'active', locationId: 'loc1' },
        expect.any(Function)
      )
    })

    it('createSurvey passes body through', async () => {
      const body = { surveyTitle: 'New Survey', questions: [] }
      mockSuccess(_mocks.adminCreateSurvey, { id: 's1' })

      const result = await adminApiWrapper.createSurvey(body)
      expect(result).toEqual({ id: 's1' })
      expect(_mocks.adminCreateSurvey).toHaveBeenCalledWith(
        body, expect.any(Function)
      )
    })

    it('deleteSurvey passes surveyId', async () => {
      mockSuccess(_mocks.adminDeleteSurvey)

      await adminApiWrapper.deleteSurvey('s1')
      expect(_mocks.adminDeleteSurvey).toHaveBeenCalledWith(
        's1', expect.any(Function)
      )
    })
  })

  describe('getAdminActions', () => {
    it('calls with no params', async () => {
      mockSuccess(_mocks.adminGetAdminActions, [{ action: 'ban' }])

      const result = await adminApiWrapper.getAdminActions()
      expect(result).toEqual([{ action: 'ban' }])
      expect(_mocks.adminGetAdminActions).toHaveBeenCalledWith(
        expect.any(Function)
      )
    })
  })

  describe('error handling', () => {
    it('rejects and records errors via promisify', async () => {
      _mocks.adminSearchUsers.mockImplementation((opts, callback) => {
        callback(
          { message: 'Forbidden', status: 403 },
          null,
          { status: 403, req: { path: '/admin/users' } }
        )
      })

      await expect(adminApiWrapper.searchUsers('test')).rejects.toBeTruthy()
      expect(recordApiError).toHaveBeenCalledWith('/admin/users', 403, 'Forbidden')
    })
  })
})

describe('usersApiWrapper.getUserById', () => {
  it('passes userId to the generated method', async () => {
    const mockResult = { id: 'u1', username: 'alice', displayName: 'Alice' }
    _mocks.getUserById.mockImplementation((userId, callback) => {
      callback(null, mockResult, {})
    })

    const result = await usersApiWrapper.getUserById('u1')
    expect(result).toEqual(mockResult)
    expect(_mocks.getUserById).toHaveBeenCalledWith('u1', expect.any(Function))
  })
})

describe('usersApiWrapper.getUserActivityById', () => {
  it('passes userId and opts to the generated method', async () => {
    const mockResult = { items: [{ id: 'a1', type: 'post' }], hasMore: false, nextCursor: null }
    _mocks.getUserActivityById.mockImplementation((userId, opts, callback) => {
      callback(null, mockResult, {})
    })

    const result = await usersApiWrapper.getUserActivityById('u1', { type: 'posts' })
    expect(result).toEqual(mockResult)
    expect(_mocks.getUserActivityById).toHaveBeenCalledWith(
      'u1',
      { type: 'posts' },
      expect.any(Function)
    )
  })

  it('defaults opts to empty object', async () => {
    _mocks.getUserActivityById.mockImplementation((userId, opts, callback) => {
      callback(null, { items: [], hasMore: false }, {})
    })

    await usersApiWrapper.getUserActivityById('u1')
    expect(_mocks.getUserActivityById).toHaveBeenCalledWith(
      'u1',
      {},
      expect.any(Function)
    )
  })
})

describe('promisify 401-retry logic', () => {
  it('resolves normally on success without retrying', async () => {
    const mockChats = [{ id: 'c1', endTime: null }]
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(null, mockChats, {})
    })

    const result = await chatApiWrapper.getUserChats('u1')
    expect(result).toEqual(mockChats)
    // Should only be called once (no retry)
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(1)
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })

  it('retries once on 401 after refreshing token', async () => {
    const successData = [{ id: 'c1', endTime: null }]

    // First call returns 401, second call (retry) succeeds
    let callCount = 0
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callCount++
      if (callCount === 1) {
        callback(
          { message: 'Unauthorized', status: 401 },
          null,
          { status: 401, req: { path: '/users/u1/chats' } }
        )
      } else {
        callback(null, successData, {})
      }
    })

    // Mock keycloak.refreshToken to return a new token
    keycloak.refreshToken.mockResolvedValue({ accessToken: 'new-fresh-token' })

    const result = await chatApiWrapper.getUserChats('u1')
    expect(result).toEqual(successData)
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(2)
    expect(keycloak.refreshToken).toHaveBeenCalledTimes(1)
    // Verify the new token was stored
    expect(mockSetSecureItem).toHaveBeenCalledWith('candid_auth_token', 'new-fresh-token')
  })

  it('does not retry more than once on repeated 401', async () => {
    // Both first call and retry return 401
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Unauthorized', status: 401 },
        null,
        { status: 401, req: { path: '/users/u1/chats' } }
      )
    })

    keycloak.refreshToken.mockResolvedValue({ accessToken: 'new-token' })

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    // Called twice: original + one retry (not infinite)
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(2)
    expect(keycloak.refreshToken).toHaveBeenCalledTimes(1)
  })

  it('does not retry on non-401 errors', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Internal Server Error', status: 500 },
        null,
        { status: 500, req: { path: '/users/u1/chats' } }
      )
    })

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    // Should only be called once — no retry for non-401
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(1)
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })

  it('does not retry on 403 errors', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Forbidden', status: 403 },
        null,
        { status: 403, req: { path: '/users/u1/chats' } }
      )
    })

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(1)
    expect(keycloak.refreshToken).not.toHaveBeenCalled()
  })

  it('rejects without retry when refresh returns no token on 401', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Unauthorized', status: 401 },
        null,
        { status: 401, req: { path: '/users/u1/chats' } }
      )
    })

    // refreshToken returns null (no new token available)
    keycloak.refreshToken.mockResolvedValue(null)

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    // Only the original call — no retry because refresh yielded no token
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(1)
    expect(keycloak.refreshToken).toHaveBeenCalledTimes(1)
  })

  it('rejects without retry when refresh throws on 401', async () => {
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Unauthorized', status: 401 },
        null,
        { status: 401, req: { path: '/users/u1/chats' } }
      )
    })

    // refreshToken throws an error
    keycloak.refreshToken.mockRejectedValue(new Error('Refresh failed'))

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    expect(_mocks.getUserChats).toHaveBeenCalledTimes(1)
    expect(keycloak.refreshToken).toHaveBeenCalledTimes(1)
  })

  it('records API error on retry failure', async () => {
    // Both calls return 401
    _mocks.getUserChats.mockImplementation((userId, opts, callback) => {
      callback(
        { message: 'Unauthorized', status: 401 },
        null,
        { status: 401, req: { path: '/users/u1/chats' } }
      )
    })

    keycloak.refreshToken.mockResolvedValue({ accessToken: 'new-token' })

    await expect(chatApiWrapper.getUserChats('u1')).rejects.toBeTruthy()
    // recordApiError should be called for the retry failure
    expect(recordApiError).toHaveBeenCalledWith('/users/u1/chats', 401, 'Unauthorized')
  })
})

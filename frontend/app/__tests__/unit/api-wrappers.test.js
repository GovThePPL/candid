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
    AdminApi: jest.fn(() => ({
      searchUsers: _mocks.adminSearchUsers = jest.fn(),
      listRoles: _mocks.adminListRoles = jest.fn(),
      requestRoleAssignment: _mocks.adminRequestRoleAssignment = jest.fn(),
      requestRoleRemoval: _mocks.adminRequestRoleRemoval = jest.fn(),
      getPendingRoleRequests: _mocks.adminGetPendingRoleRequests = jest.fn(),
      getRoleRequests: _mocks.adminGetRoleRequests = jest.fn(),
      rescindRoleRequest: _mocks.adminRescindRoleRequest = jest.fn(),
      approveRoleRequest: _mocks.adminApproveRoleRequest = jest.fn(),
      denyRoleRequest: _mocks.adminDenyRoleRequest = jest.fn(),
      createLocation: _mocks.adminCreateLocation = jest.fn(),
      updateLocation: _mocks.adminUpdateLocation = jest.fn(),
      deleteLocation: _mocks.adminDeleteLocation = jest.fn(),
      getLocationCategories: _mocks.adminGetLocationCategories = jest.fn(),
      assignLocationCategory: _mocks.adminAssignLocationCategory = jest.fn(),
      removeLocationCategory: _mocks.adminRemoveLocationCategory = jest.fn(),
      createCategory: _mocks.adminCreateCategory = jest.fn(),
      getCategoryLabelSurvey: _mocks.adminGetCategoryLabelSurvey = jest.fn(),
      banUser: _mocks.adminBanUser = jest.fn(),
      unbanUser: _mocks.adminUnbanUser = jest.fn(),
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
      lockPost: jest.fn(),
    })),
    CommentsApi: jest.fn(() => ({
      getComments: jest.fn(),
      createComment: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn(),
      voteOnComment: jest.fn(),
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

describe('postsApiWrapper.getPosts', () => {
  it('passes all filter options to the API', async () => {
    const mockResult = { posts: [{ id: 'p1' }], hasMore: false, nextCursor: null }
    _mocks.getPosts.mockImplementation((locationId, opts, callback) => {
      callback(null, mockResult, {})
    })

    const result = await postsApiWrapper.getPosts('loc1', {
      categoryId: 'cat1',
      postType: 'discussion',
      sort: 'new',
      limit: 10,
      answered: 'true',
    })

    expect(result).toEqual(mockResult)
    expect(_mocks.getPosts).toHaveBeenCalledWith(
      'loc1',
      expect.objectContaining({
        categoryId: 'cat1',
        postType: 'discussion',
        sort: 'new',
        limit: 10,
        answered: 'true',
      }),
      expect.any(Function)
    )
  })

  it('omits categoryId when set to "all"', async () => {
    _mocks.getPosts.mockImplementation((locationId, opts, callback) => {
      callback(null, { posts: [], hasMore: false }, {})
    })

    await postsApiWrapper.getPosts('loc1', { categoryId: 'all' })

    const passedOpts = _mocks.getPosts.mock.calls[0][1]
    expect(passedOpts.categoryId).toBeUndefined()
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
    it('wraps userRoleId and reason into body object', async () => {
      mockSuccess(_mocks.adminRequestRoleRemoval)

      await adminApiWrapper.requestRoleRemoval('ur1', 'No longer needed')
      expect(_mocks.adminRequestRoleRemoval).toHaveBeenCalledWith(
        { userRoleId: 'ur1', reason: 'No longer needed' },
        expect.any(Function)
      )
    })
  })

  describe('denyRoleRequest', () => {
    it('wraps reason in nested denyRoleRequestRequest', async () => {
      mockSuccess(_mocks.adminDenyRoleRequest)

      await adminApiWrapper.denyRoleRequest('req1', 'Insufficient experience')
      expect(_mocks.adminDenyRoleRequest).toHaveBeenCalledWith(
        'req1',
        { denyRoleRequestRequest: { reason: 'Insufficient experience' } },
        expect.any(Function)
      )
    })
  })

  describe('role request actions', () => {
    it('approveRoleRequest passes requestId', async () => {
      mockSuccess(_mocks.adminApproveRoleRequest)

      await adminApiWrapper.approveRoleRequest('req1')
      expect(_mocks.adminApproveRoleRequest).toHaveBeenCalledWith(
        'req1', expect.any(Function)
      )
    })

    it('rescindRoleRequest passes requestId', async () => {
      mockSuccess(_mocks.adminRescindRoleRequest)

      await adminApiWrapper.rescindRoleRequest('req1')
      expect(_mocks.adminRescindRoleRequest).toHaveBeenCalledWith(
        'req1', expect.any(Function)
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

  describe('category management', () => {
    it('assignLocationCategory wraps categoryId in body', async () => {
      mockSuccess(_mocks.adminAssignLocationCategory)

      await adminApiWrapper.assignLocationCategory('loc1', 'cat1')
      expect(_mocks.adminAssignLocationCategory).toHaveBeenCalledWith(
        'loc1', { positionCategoryId: 'cat1' }, expect.any(Function)
      )
    })

    it('removeLocationCategory passes both path params', async () => {
      mockSuccess(_mocks.adminRemoveLocationCategory)

      await adminApiWrapper.removeLocationCategory('loc1', 'cat1')
      expect(_mocks.adminRemoveLocationCategory).toHaveBeenCalledWith(
        'loc1', 'cat1', expect.any(Function)
      )
    })

    it('createCategory merges label, parent, and opts into body', async () => {
      mockSuccess(_mocks.adminCreateCategory, { id: 'cat-new' })

      await adminApiWrapper.createCategory('Climate', 'cat-parent', { description: 'Climate issues' })
      expect(_mocks.adminCreateCategory).toHaveBeenCalledWith(
        { label: 'Climate', parentPositionCategoryId: 'cat-parent', description: 'Climate issues' },
        expect.any(Function)
      )
    })
  })

  describe('ban/unban', () => {
    it('banUser wraps reason in body', async () => {
      mockSuccess(_mocks.adminBanUser)

      await adminApiWrapper.banUser('u1', 'Spam')
      expect(_mocks.adminBanUser).toHaveBeenCalledWith(
        'u1', { reason: 'Spam' }, expect.any(Function)
      )
    })

    it('unbanUser wraps reason in body', async () => {
      mockSuccess(_mocks.adminUnbanUser)

      await adminApiWrapper.unbanUser('u1', 'Reviewed')
      expect(_mocks.adminUnbanUser).toHaveBeenCalledWith(
        'u1', { reason: 'Reviewed' }, expect.any(Function)
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

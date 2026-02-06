import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ApiClient,
  AuthenticationApi,
  UsersApi,
  CardsApi,
  PositionsApi,
  ChatApi,
  SurveysApi,
  CategoriesApi,
  ChattingListApi,
  StatsApi,
  LoginUserRequest,
  RegisterUserRequest,
} from 'candid_api'
import { CacheManager } from './cache'

// API configuration
export const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api/v1'  // Development
  : 'https://api.candid.app/api/v1' // Production (placeholder)

const TOKEN_KEY = 'candid_auth_token'
const USER_KEY = 'candid_user'

// Create and configure the API client
const apiClient = new ApiClient(API_BASE_URL)

// Create API instances
const authenticationApi = new AuthenticationApi(apiClient)
const usersApi = new UsersApi(apiClient)
const cardsApi = new CardsApi(apiClient)
const positionsApi = new PositionsApi(apiClient)
const chatApi = new ChatApi(apiClient)
const surveysApi = new SurveysApi(apiClient)
const categoriesApi = new CategoriesApi(apiClient)
const chattingListApi = new ChattingListApi(apiClient)
const statsApi = new StatsApi(apiClient)

// Token management
export async function getToken() {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setToken(token) {
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token)
      // Set the token on the API client for authenticated requests
      apiClient.authentications['BearerAuth'].accessToken = token
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY)
      apiClient.authentications['BearerAuth'].accessToken = null
    }
  } catch (error) {
    console.error('Error saving token:', error)
  }
}

export async function getStoredUser() {
  try {
    const userJson = await AsyncStorage.getItem(USER_KEY)
    return userJson ? JSON.parse(userJson) : null
  } catch {
    return null
  }
}

export async function setStoredUser(user) {
  try {
    if (user) {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      await AsyncStorage.removeItem(USER_KEY)
    }
  } catch (error) {
    console.error('Error saving user:', error)
  }
}

// Initialize token from storage on app start
export async function initializeAuth() {
  const token = await getToken()
  if (token) {
    apiClient.authentications['BearerAuth'].accessToken = token
  }
}

// Helper to promisify the callback-based API methods
function promisify(apiMethod, ...args) {
  return new Promise((resolve, reject) => {
    apiMethod(...args, (error, data, response) => {
      if (error) {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Promisify variant that returns both data and response object.
 * Used for endpoints that need cache header inspection (ETag, Last-Modified, 304).
 * @returns {Promise<{data: any, response: object}>}
 */
function promisifyWithResponse(apiMethod, ...args) {
  return new Promise((resolve, reject) => {
    apiMethod(...args, (error, data, response) => {
      if (error && response?.status !== 304) {
        reject(error)
      } else {
        resolve({ data, response })
      }
    })
  })
}

// Auth API
export const authApi = {
  async login(username, password) {
    const request = new LoginUserRequest(username, password)
    const data = await promisify(
      authenticationApi.loginUser.bind(authenticationApi),
      request
    )

    if (data.token) {
      await setToken(data.token)
      await setStoredUser(data.user)
    }

    return data
  },

  async register(username, displayName, password, email = null) {
    const request = new RegisterUserRequest(username, displayName, password)
    if (email) request.email = email

    const data = await promisify(
      authenticationApi.registerUser.bind(authenticationApi),
      request
    )

    return data
  },

  async logout() {
    await setToken(null)
    await setStoredUser(null)
    // Clear all cached data on logout
    await CacheManager.clearAll()
  },

  async getCurrentUser() {
    return await promisify(usersApi.getCurrentUser.bind(usersApi))
  },
}

// Users API
export const usersApiWrapper = {
  async getProfile() {
    return await promisify(usersApi.getCurrentUser.bind(usersApi))
  },

  async updateProfile(data) {
    return await promisify(
      usersApi.updateUserProfile.bind(usersApi),
      data
    )
  },

  async getDemographics() {
    return await promisify(usersApi.getUserDemographics.bind(usersApi))
  },

  async updateDemographics(data) {
    return await promisify(
      usersApi.updateUserDemographics.bind(usersApi),
      data
    )
  },

  async getSettings() {
    return await promisify(usersApi.getUserSettings.bind(usersApi))
  },

  async updateSettings(data) {
    return await promisify(
      usersApi.updateUserSettings.bind(usersApi),
      data
    )
  },

  async getLocations() {
    return await promisify(usersApi.getUserLocations.bind(usersApi))
  },

  async getAllLocations() {
    return await promisify(usersApi.getAllLocations.bind(usersApi))
  },

  async setLocation(locationId) {
    return await promisify(
      usersApi.setUserLocation.bind(usersApi),
      { locationId }
    )
  },

  async getMyPositions(status = 'all') {
    const opts = { status }
    return await promisify(
      usersApi.getCurrentUserPositions.bind(usersApi),
      opts
    )
  },

  async updatePosition(userPositionId, status) {
    return await promisify(
      usersApi.updateUserPosition.bind(usersApi),
      userPositionId,
      { status }
    )
  },

  async deletePosition(userPositionId) {
    return await promisify(
      usersApi.deleteUserPosition.bind(usersApi),
      userPositionId
    )
  },

  /**
   * Get positions metadata for cache validation
   * @returns {Promise<{count: number, lastUpdatedTime: string|null}>}
   */
  async getPositionsMetadata() {
    return await promisify(
      usersApi.getCurrentUserPositionsMetadata.bind(usersApi)
    )
  },

  /**
   * Get positions with raw response for caching (includes headers)
   * @param {string} status - Filter by status
   * @param {object} conditionalHeaders - Cache headers (If-None-Match, If-Modified-Since)
   * @returns {Promise<{data: any, response: object}>}
   */
  async getMyPositionsRaw(status = 'all', conditionalHeaders = {}) {
    const opts = { status }
    if (conditionalHeaders['If-None-Match']) {
      opts.ifNoneMatch = conditionalHeaders['If-None-Match']
    }
    if (conditionalHeaders['If-Modified-Since']) {
      opts.ifModifiedSince = conditionalHeaders['If-Modified-Since']
    }
    return promisifyWithResponse(
      usersApi.getCurrentUserPositions.bind(usersApi),
      opts
    )
  },

  async changePassword(currentPassword, newPassword) {
    return await promisify(
      usersApi.changePassword.bind(usersApi),
      { currentPassword, newPassword }
    )
  },

  async deleteAccount(password) {
    return await promisify(
      usersApi.deleteCurrentUser.bind(usersApi),
      { password }
    )
  },

  async getAvailableAvatars() {
    return await promisify(usersApi.getAvailableAvatars.bind(usersApi))
  },

  async uploadAvatar(imageBase64) {
    return await promisify(
      usersApi.uploadAvatar.bind(usersApi),
      { imageBase64 }
    )
  },
}

// Cards API
export const cardsApiWrapper = {
  async getCardQueue(limit = 10) {
    // Use a custom callback that ignores oneOf deserialization errors and returns
    // response.body (raw JSON) directly. The generated client's deserialize step
    // throws because the oneOf/discriminator validation rejects valid cards whose
    // nested data doesn't exactly match the spec schemas.
    return new Promise((resolve, reject) => {
      cardsApi.getCardQueue({ limit }, (error, data, response) => {
        if (response?.body) {
          resolve(response.body)
        } else if (error) {
          reject(error)
        } else {
          resolve([])
        }
      })
    })
  },
}

// Positions API
export const positionsApiWrapper = {
  async respond(responses) {
    return await promisify(
      positionsApi.respondToPositions.bind(positionsApi),
      { responses }
    )
  },

  async create(statement, categoryId, locationId) {
    return await promisify(
      positionsApi.createPosition.bind(positionsApi),
      { statement, categoryId, locationId }
    )
  },

  async report(positionId, ruleId, comment = null) {
    const body = { ruleId }
    if (comment) body.comment = comment

    return await promisify(
      positionsApi.reportPosition.bind(positionsApi),
      positionId,
      body
    )
  },

  async adopt(positionId) {
    return await promisify(
      positionsApi.adoptPosition.bind(positionsApi),
      positionId
    )
  },

  async searchSimilar(statement, options = {}) {
    const { categoryId, locationId, limit = 5 } = options
    const body = { statement }
    if (categoryId) body.categoryId = categoryId
    if (locationId) body.locationId = locationId
    if (limit) body.limit = limit

    return await promisify(
      positionsApi.searchSimilarPositions.bind(positionsApi),
      body
    )
  },

  async getAgreedClosures(positionId) {
    return await promisify(
      positionsApi.getPositionAgreedClosures.bind(positionsApi),
      positionId
    )
  },
}

// Chat API
export const chatApiWrapper = {
  async createRequest(userPositionId) {
    return await promisify(
      chatApi.createChatRequest.bind(chatApi),
      { userPositionId }
    )
  },

  async getUserChats(userId, options = {}) {
    const { limit = 20, offset = 0 } = options
    return await promisify(
      chatApi.getUserChats.bind(chatApi),
      userId,
      { limit, offset }
    )
  },

  /**
   * Get user chats metadata for cache validation
   * @param {string} userId
   * @returns {Promise<{count: number, lastActivityTime: string|null}>}
   */
  async getUserChatsMetadata(userId) {
    return await promisify(
      chatApi.getUserChatsMetadata.bind(chatApi),
      userId
    )
  },

  /**
   * Get user chats with raw response for caching
   * @param {string} userId
   * @param {object} options - {limit, offset}
   * @param {object} conditionalHeaders - Cache headers
   * @returns {Promise<{data: any, response: object}>}
   */
  async getUserChatsRaw(userId, options = {}, conditionalHeaders = {}) {
    const { limit = 20, offset = 0 } = options
    const opts = { limit, offset }
    if (conditionalHeaders['If-None-Match']) {
      opts.ifNoneMatch = conditionalHeaders['If-None-Match']
    }
    if (conditionalHeaders['If-Modified-Since']) {
      opts.ifModifiedSince = conditionalHeaders['If-Modified-Since']
    }
    return promisifyWithResponse(
      chatApi.getUserChats.bind(chatApi),
      userId,
      opts
    )
  },

  async getActiveChat(userId) {
    // Get user's chats and find any that are still active (no endTime)
    const chats = await this.getUserChats(userId, { limit: 10 })
    console.log('[api.getActiveChat] Chats:', chats.map(c => ({ id: c.id, endTime: c.endTime })))
    const activeChat = chats.find(chat => !chat.endTime) || null
    console.log('[api.getActiveChat] Active chat:', activeChat?.id || 'none')
    return activeChat
  },

  async respondToRequest(requestId, response) {
    return await promisify(
      chatApi.respondToChatRequest.bind(chatApi),
      requestId,
      { response }
    )
  },

  async rescindChatRequest(requestId) {
    return await promisify(
      chatApi.rescindChatRequest.bind(chatApi),
      requestId
    )
  },

  async getChatLog(chatId) {
    return await promisify(
      chatApi.getChatLog.bind(chatApi),
      chatId,
      {}  // opts parameter required before callback
    )
  },

  /**
   * Get chat log with raw response for caching (includes ETag, Last-Modified headers)
   * @param {string} chatId
   * @param {object} conditionalHeaders - Cache headers (If-None-Match, If-Modified-Since)
   * @returns {Promise<{data: any, response: object}>}
   */
  async getChatLogRaw(chatId, conditionalHeaders = {}) {
    const opts = {}
    if (conditionalHeaders['If-None-Match']) {
      opts.ifNoneMatch = conditionalHeaders['If-None-Match']
    }
    if (conditionalHeaders['If-Modified-Since']) {
      opts.ifModifiedSince = conditionalHeaders['If-Modified-Since']
    }
    return promisifyWithResponse(
      chatApi.getChatLog.bind(chatApi),
      chatId,
      opts
    )
  },

  async sendKudos(chatId) {
    return await promisify(
      chatApi.sendKudos.bind(chatApi),
      chatId
    )
  },

  async dismissKudos(chatId) {
    return await promisify(
      chatApi.dismissKudos.bind(chatApi),
      chatId
    )
  },

  async acknowledgeKudos(chatId) {
    // Acknowledge is the same as dismiss - just marks the kudos notification as seen
    return await promisify(
      chatApi.dismissKudos.bind(chatApi),
      chatId
    )
  },
}

// Surveys API
export const surveysApiWrapper = {
  async respond(surveyId, questionId, optionId) {
    return await promisify(
      surveysApi.respondToSurveyQuestion.bind(surveysApi),
      surveyId,
      questionId,
      { optionId }
    )
  },

  async respondToPairwise(surveyId, winnerItemId, loserItemId) {
    return await promisify(
      surveysApi.respondToPairwise.bind(surveysApi),
      surveyId,
      { winnerItemId, loserItemId }
    )
  },

  async getPairwiseSurveys(locationId, categoryId) {
    const opts = {}
    if (locationId) opts.locationId = locationId
    if (categoryId && categoryId !== 'all') opts.categoryId = categoryId

    return await promisify(
      surveysApi.getPairwiseSurveys.bind(surveysApi),
      opts
    )
  },

  async getStandardSurveys(locationId, categoryId) {
    const opts = {}
    if (locationId) opts.locationId = locationId
    if (categoryId && categoryId !== 'all') opts.categoryId = categoryId

    return await promisify(
      surveysApi.getActiveSurveys.bind(surveysApi),
      opts
    )
  },

  async getAllSurveys(locationId, categoryId) {
    const [pairwise, standard] = await Promise.all([
      this.getPairwiseSurveys(locationId, categoryId),
      this.getStandardSurveys(locationId, categoryId),
    ])

    const combined = [...pairwise, ...standard]
    combined.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      if (a.endTime && b.endTime) {
        return new Date(b.endTime) - new Date(a.endTime)
      }
      return 0
    })

    return combined
  },

  async getSurveyRankings(surveyId, filterLocationId, groupId, polisConversationId) {
    const opts = {}
    if (filterLocationId) opts.filterLocationId = filterLocationId
    if (groupId && groupId !== 'majority') opts.groupId = groupId
    if (polisConversationId) opts.polisConversationId = polisConversationId

    return await promisify(
      surveysApi.getSurveyRankings.bind(surveysApi),
      surveyId,
      opts
    )
  },

  async getStandardSurveyResults(surveyId, filterLocationId, groupId, polisConversationId) {
    const opts = {}
    if (filterLocationId) opts.filterLocationId = filterLocationId
    if (groupId && groupId !== 'majority') opts.groupId = groupId
    if (polisConversationId) opts.polisConversationId = polisConversationId

    return await promisify(
      surveysApi.getStandardSurveyResults.bind(surveysApi),
      surveyId,
      opts
    )
  },

  async getQuestionCrosstabs(surveyId, questionId, filterLocationId, groupId, polisConversationId) {
    const opts = {}
    if (filterLocationId) opts.filterLocationId = filterLocationId
    if (groupId && groupId !== 'majority') opts.groupId = groupId
    if (polisConversationId) opts.polisConversationId = polisConversationId

    return await promisify(
      surveysApi.getQuestionCrosstabs.bind(surveysApi),
      surveyId,
      questionId,
      opts
    )
  },
}

// Categories API
export const categoriesApiWrapper = {
  async getAll() {
    return await promisify(
      categoriesApi.getAllCategories.bind(categoriesApi)
    )
  },

  async suggest(statement, limit = 3) {
    return await promisify(
      categoriesApi.suggestCategory.bind(categoriesApi),
      { statement, limit }
    )
  },
}

// Chatting List API
export const chattingListApiWrapper = {
  async getList() {
    return await promisify(
      chattingListApi.getChattingList.bind(chattingListApi),
      {}
    )
  },

  /**
   * Get chatting list metadata for cache validation
   * @returns {Promise<{count: number, lastUpdatedTime: string|null}>}
   */
  async getListMetadata() {
    return await promisify(
      chattingListApi.getChattingListMetadata.bind(chattingListApi)
    )
  },

  /**
   * Get chatting list with raw response for caching
   * @param {object} conditionalHeaders - Cache headers
   * @returns {Promise<{data: any, response: object}>}
   */
  async getListRaw(conditionalHeaders = {}) {
    const opts = {}
    if (conditionalHeaders['If-None-Match']) {
      opts.ifNoneMatch = conditionalHeaders['If-None-Match']
    }
    if (conditionalHeaders['If-Modified-Since']) {
      opts.ifModifiedSince = conditionalHeaders['If-Modified-Since']
    }
    return promisifyWithResponse(
      chattingListApi.getChattingList.bind(chattingListApi),
      opts
    )
  },

  async addPosition(positionId) {
    return await promisify(
      chattingListApi.addToChattingList.bind(chattingListApi),
      { positionId }
    )
  },

  async toggleActive(id, isActive) {
    return await promisify(
      chattingListApi.updateChattingListItem.bind(chattingListApi),
      id,
      { isActive }
    )
  },

  async remove(id) {
    return await promisify(
      chattingListApi.removeFromChattingList.bind(chattingListApi),
      id
    )
  },

  async markExplanationSeen() {
    return await promisify(
      chattingListApi.markChattingListExplanationSeen.bind(chattingListApi)
    )
  },

  async bulkRemove({ categoryId, locationCode, itemIds }) {
    const body = {}
    if (categoryId) body.categoryId = categoryId
    if (locationCode) body.locationCode = locationCode
    if (itemIds) body.itemIds = itemIds

    return await promisify(
      chattingListApi.bulkRemoveFromChattingList.bind(chattingListApi),
      body
    )
  },
}

// Stats API
export const statsApiWrapper = {
  async getStats(locationId, categoryId) {
    if (categoryId === 'all' || !categoryId) {
      return await promisify(
        statsApi.getLocationStats.bind(statsApi),
        locationId
      )
    }
    return await promisify(
      statsApi.getStats.bind(statsApi),
      locationId,
      categoryId
    )
  },

  async getGroupDemographics(locationId, categoryId, groupId) {
    const catId = categoryId === 'all' || !categoryId ? 'all' : categoryId
    return await promisify(
      statsApi.getGroupDemographics.bind(statsApi),
      locationId,
      catId,
      groupId
    )
  },
}

export default {
  auth: authApi,
  users: usersApiWrapper,
  cards: cardsApiWrapper,
  positions: positionsApiWrapper,
  chat: chatApiWrapper,
  surveys: surveysApiWrapper,
  categories: categoriesApiWrapper,
  stats: statsApiWrapper,
  chattingList: chattingListApiWrapper,
  initializeAuth,
}

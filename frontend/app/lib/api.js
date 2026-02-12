import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ApiClient,
  UsersApi,
  CardsApi,
  PositionsApi,
  ChatApi,
  SurveysApi,
  CategoriesApi,
  ChattingListApi,
  StatsApi,
  ModerationApi,
  BugReportsApi,
} from 'candid_api'
import { CacheManager } from './cache'
import { recordApiError } from './errorCollector'
import enErrors from '../i18n/locales/en/errors.json'

// Build reverse lookup: English error string → i18n key
const errorStringToKey = Object.fromEntries(
  Object.entries(enErrors).map(([key, value]) => [value, key])
)

/**
 * Translate a backend error message using the errors namespace.
 * Falls back to the original message if no translation exists.
 * @param {string} message - Raw error message from the backend
 * @param {function} t - i18next t function
 * @returns {string} Translated message or original
 */
export function translateError(message, t) {
  if (!message || !t) return message
  const key = errorStringToKey[message]
  if (key) return t(`errors:${key}`)
  return message
}

// API configuration
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
  || (__DEV__ ? 'http://localhost:8000/api/v1' : 'https://api.candid.app/api/v1')

const TOKEN_KEY = 'candid_auth_token'
const USER_KEY = 'candid_user'

// Create and configure the API client
const apiClient = new ApiClient(API_BASE_URL)

// Create API instances
const usersApi = new UsersApi(apiClient)
const cardsApi = new CardsApi(apiClient)
const positionsApi = new PositionsApi(apiClient)
const chatApi = new ChatApi(apiClient)
const surveysApi = new SurveysApi(apiClient)
const categoriesApi = new CategoriesApi(apiClient)
const chattingListApi = new ChattingListApi(apiClient)
const statsApi = new StatsApi(apiClient)
const moderationApi = new ModerationApi(apiClient)
const bugReportsApi = new BugReportsApi(apiClient)

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
        const status = response?.status || error?.status || 0
        const path = response?.req?.path || ''
        recordApiError(path, status, error?.message || String(error))
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

// Auth API (Keycloak OIDC - login/register handled by UserContext via keycloak.js)
export const authApi = {
  async logout() {
    await setToken(null)
    await setStoredUser(null)
    // Clear all cached data on logout
    await CacheManager.clearAll()
  },

  async getCurrentUser() {
    return await promisify(usersApi.getCurrentUser.bind(usersApi))
  },

  async registerAccount({ username, email, password }) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || 'Registration failed')
    }
    return data
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
      usersApi.updateUserDemographicsPartial.bind(usersApi),
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

  async heartbeat() {
    return await promisify(usersApi.heartbeat.bind(usersApi))
  },

  async registerPushToken(token, platform) {
    return await promisify(
      usersApi.registerPushToken.bind(usersApi),
      { token, platform }
    )
  },

  async deleteAccount() {
    return await promisify(
      usersApi.deleteCurrentUser.bind(usersApi)
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

  async updateDiagnosticsConsent(consent) {
    return await promisify(
      usersApi.updateDiagnosticsConsent.bind(usersApi),
      { consent }
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

  async dismissPositionRemovedNotification(positionId) {
    return await promisify(
      cardsApi.dismissPositionRemovedNotification.bind(cardsApi),
      positionId
    )
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
      moderationApi.reportPosition.bind(moderationApi),
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

  async searchStats(query, locationId, { offset = 0, limit = 20 } = {}) {
    const body = { query, locationId, offset, limit }
    return await promisify(
      positionsApi.searchStatsPositions.bind(positionsApi),
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

// Moderation API
export const moderationApiWrapper = {
  async getRules() {
    return await promisify(moderationApi.getRules.bind(moderationApi))
  },

  async getQueue() {
    // Use raw response.body pattern (like cards) since queue returns oneOf items
    return new Promise((resolve, reject) => {
      moderationApi.getModerationQueue((error, data, response) => {
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

  async reportChat(chatId, ruleId, comment = null) {
    const body = { ruleId }
    if (comment) body.comment = comment

    return await promisify(
      moderationApi.reportChat.bind(moderationApi),
      chatId,
      body
    )
  },

  async takeAction(reportId, body) {
    return await promisify(
      moderationApi.takeModeratorAction.bind(moderationApi),
      reportId,
      body
    )
  },

  async respondToAppeal(appealId, body) {
    return await promisify(
      moderationApi.respondToAppeal.bind(moderationApi),
      appealId,
      body
    )
  },

  async createAppeal(actionId, appealText) {
    return await promisify(
      moderationApi.createAppeal.bind(moderationApi),
      actionId,
      { appealText }
    )
  },

  async dismissAdminResponseNotification(appealId) {
    return await promisify(
      moderationApi.dismissAdminResponseNotification.bind(moderationApi),
      appealId
    )
  },

  async getUserModerationHistory(userId) {
    return await promisify(
      moderationApi.getUserModerationHistory.bind(moderationApi),
      userId
    )
  },

  async claimReport(reportId) {
    return await promisify(
      moderationApi.claimReport.bind(moderationApi),
      reportId
    )
  },

  async releaseReport(reportId) {
    return await promisify(
      moderationApi.releaseReport.bind(moderationApi),
      reportId
    )
  },
}

// Admin API (direct fetch — no generated client available)
export const adminApiWrapper = {
  async _fetch(path, options = {}) {
    const token = await getToken()
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed: ${res.status}`)
    }
    if (res.status === 204) return null
    return res.json()
  },

  async searchUsers(query, { limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (query) params.set('search', query)
    params.set('limit', limit)
    params.set('offset', offset)
    return this._fetch(`/admin/users?${params}`)
  },

  async listRoles({ userId, locationId, role } = {}) {
    const params = new URLSearchParams()
    if (userId) params.set('userId', userId)
    if (locationId) params.set('locationId', locationId)
    if (role) params.set('role', role)
    return this._fetch(`/admin/roles?${params}`)
  },

  async requestRoleAssignment(body) {
    return this._fetch('/admin/roles', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async requestRoleRemoval(userRoleId, reason) {
    return this._fetch('/admin/roles/remove', {
      method: 'POST',
      body: JSON.stringify({ userRoleId, reason }),
    })
  },

  async getPendingRequests() {
    return this._fetch('/admin/roles/pending')
  },

  async getRoleRequests(view = 'pending') {
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    return this._fetch(`/admin/roles/requests?${params}`)
  },

  async rescindRoleRequest(requestId) {
    return this._fetch(`/admin/roles/requests/${requestId}/rescind`, {
      method: 'POST',
    })
  },

  async approveRoleRequest(requestId) {
    return this._fetch(`/admin/roles/requests/${requestId}/approve`, {
      method: 'POST',
    })
  },

  async denyRoleRequest(requestId, reason) {
    return this._fetch(`/admin/roles/requests/${requestId}/deny`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  async createLocation(parentLocationId, name, code) {
    return this._fetch('/admin/locations', {
      method: 'POST',
      body: JSON.stringify({ parentLocationId, name, code }),
    })
  },

  async updateLocation(locationId, updates) {
    return this._fetch(`/admin/locations/${locationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  async deleteLocation(locationId) {
    return this._fetch(`/admin/locations/${locationId}`, {
      method: 'DELETE',
    })
  },

  async getAllCategories() {
    return this._fetch('/categories')
  },

  async getLocationCategories(locationId) {
    return this._fetch(`/admin/locations/${locationId}/categories`)
  },

  async assignLocationCategory(locationId, categoryId) {
    return this._fetch(`/admin/locations/${locationId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ positionCategoryId: categoryId }),
    })
  },

  async removeLocationCategory(locationId, categoryId) {
    return this._fetch(`/admin/locations/${locationId}/categories/${categoryId}`, {
      method: 'DELETE',
    })
  },

  async createCategory(label, parentPositionCategoryId, opts = {}) {
    return this._fetch('/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ label, parentPositionCategoryId, ...opts }),
    })
  },

  async getCategoryLabelSurvey(categoryId) {
    return this._fetch(`/admin/categories/${categoryId}/label-survey`)
  },

  async banUser(userId, reason) {
    return this._fetch(`/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  async unbanUser(userId, reason) {
    return this._fetch(`/admin/users/${userId}/unban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  async getSurveys({ title, status, locationId } = {}) {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (status) params.set('status', status)
    if (locationId) params.set('locationId', locationId)
    return this._fetch(`/admin/surveys?${params}`)
  },

  async createSurvey(body) {
    return this._fetch('/admin/surveys', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async createPairwiseSurvey(body) {
    return this._fetch('/admin/surveys/pairwise', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async deleteSurvey(surveyId) {
    return this._fetch(`/admin/surveys/${surveyId}`, {
      method: 'DELETE',
    })
  },

  async getAdminActions() {
    return this._fetch('/admin/actions')
  },
}

// Bug Reports API
export const bugReportsApiWrapper = {
  async createReport(body) {
    return await promisify(
      bugReportsApi.createBugReport.bind(bugReportsApi),
      body
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
  moderation: moderationApiWrapper,
  admin: adminApiWrapper,
  bugReports: bugReportsApiWrapper,
  initializeAuth,
}

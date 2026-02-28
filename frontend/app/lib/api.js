import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStorage'
import * as keycloak from './keycloak'
import {
  ApiClient,
  UsersApi,
  CardsApi,
  PositionsApi,
  ChatApi,
  SurveysApi,
  SessionsApi,
  ChattingListApi,
  StatsApi,
  ModerationApi,
  BugReportsApi,
  AdminApi,
  AuthenticationApi,
  PostsApi,
  CommentsApi,
  NotificationsApi,
  GlossaryApi,
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
const sessionsApi = new SessionsApi(apiClient)
const chattingListApi = new ChattingListApi(apiClient)
const statsApi = new StatsApi(apiClient)
const moderationApi = new ModerationApi(apiClient)
const bugReportsApi = new BugReportsApi(apiClient)
const adminApi = new AdminApi(apiClient)
const authenticationApi = new AuthenticationApi(apiClient)
const postsApi = new PostsApi(apiClient)
const commentsApi = new CommentsApi(apiClient)
const notificationsApi = new NotificationsApi(apiClient)
const glossaryApi = new GlossaryApi(apiClient)

// Token management — stored in secure storage (Keychain/Keystore on native)
export async function getToken() {
  try {
    return await getSecureItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setToken(token) {
  try {
    if (token) {
      await setSecureItem(TOKEN_KEY, token)
      // Set the token on the API client for authenticated requests
      apiClient.authentications['BearerAuth'].accessToken = token
    } else {
      await deleteSecureItem(TOKEN_KEY)
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

/**
 * Return a valid token, refreshing via Keycloak if close to expiry.
 * Decodes the JWT payload (no verification) to check the `exp` claim.
 * If >60s remaining, returns as-is. If <=60s, refreshes and stores the new token.
 * On any failure, returns the existing token (graceful degradation).
 * @returns {Promise<string|null>}
 */
export async function getOrRefreshToken() {
  try {
    const token = await getSecureItem(TOKEN_KEY)
    if (!token) return null

    // Decode JWT payload (base64url, no verification)
    const parts = token.split('.')
    if (parts.length !== 3) return token

    // base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp - now <= 60) {
      // Token expires within 60s — try refreshing
      const tokens = await keycloak.refreshToken()
      if (tokens?.accessToken) {
        await setToken(tokens.accessToken)
        return tokens.accessToken
      }
    }

    return token
  } catch {
    // Graceful degradation: return whatever we have
    try {
      return await getSecureItem(TOKEN_KEY)
    } catch {
      return null
    }
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

  async registerAccount({ username, email, password, phoneNumber, phoneVerifyToken }) {
    return await promisify(
      authenticationApi.registerUser.bind(authenticationApi),
      { username, email, password, phoneNumber, phoneVerifyToken }
    )
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
      usersApi.updatePushToken.bind(usersApi),
      { token, platform }
    )
  },

  async deleteAccount() {
    return await promisify(
      usersApi.deleteCurrentUser.bind(usersApi)
    )
  },

  async updateNotificationMute(body) {
    return await promisify(usersApi.updateNotificationMute.bind(usersApi), body)
  },

  async getNotificationMuteStatus(opts) {
    return await promisify(usersApi.getNotificationMuteStatus.bind(usersApi), opts.targetType, opts.targetId)
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

  async getActivity(opts = {}) {
    return await promisify(usersApi.getUserActivity.bind(usersApi), opts)
  },

  async getUserById(userId) {
    return await promisify(usersApi.getUserById.bind(usersApi), userId)
  },

  async getUserByUsername(username) {
    return await promisify(usersApi.getUserByUsername.bind(usersApi), username)
  },

  async getUserActivityById(userId, opts = {}) {
    return await promisify(usersApi.getUserActivityById.bind(usersApi), userId, opts)
  },
}

// Cards API
export const cardsApiWrapper = {
  async getCardQueue(limit = 10, sessionId = null, phase = null, browseAll = false) {
    // Use a custom callback that ignores oneOf deserialization errors and returns
    // response.body (raw JSON) directly. The generated client's deserialize step
    // throws because the oneOf/discriminator validation rejects valid cards whose
    // nested data doesn't exactly match the spec schemas.
    const opts = { limit }
    if (sessionId) opts.sessionId = sessionId
    if (phase) opts.phase = phase
    if (browseAll) opts.browseAll = browseAll
    return new Promise((resolve, reject) => {
      cardsApi.getCardQueue(opts, (error, data, response) => {
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
      cardsApi.deletePositionNotification.bind(cardsApi),
      positionId
    )
  },

  async dismissBridgingKudos(awardId) {
    return await promisify(
      cardsApi.dismissBridgingKudos.bind(cardsApi),
      awardId
    )
  },

}

// Positions API
export const positionsApiWrapper = {
  async respond(responses) {
    return await promisify(
      positionsApi.createPositionResponses.bind(positionsApi),
      { responses }
    )
  },

  async create(statement, sessionId, locationId, chatsDisabled = false) {
    return await promisify(
      positionsApi.createPosition.bind(positionsApi),
      { statement, sessionId, locationId, chatsDisabled }
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
      usersApi.createUserPosition.bind(usersApi),
      { positionId }
    )
  },

  async searchSimilar(statement, options = {}) {
    const { sessionId, locationId, limit = 5 } = options
    const body = { statement }
    if (sessionId) body.sessionId = sessionId
    if (locationId) body.locationId = locationId
    if (limit) body.limit = limit

    return await promisify(
      positionsApi.searchSimilarPositions.bind(positionsApi),
      body
    )
  },

  async searchStats(query, locationId, { offset = 0, limit = 20 } = {}) {
    return await promisify(
      positionsApi.getPositionsStats.bind(positionsApi),
      query, locationId, { offset, limit }
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
    console.debug('[api.getActiveChat] Chats:', chats.map(c => ({ id: c.id, endTime: c.endTime })))
    const activeChat = chats.find(chat => !chat.endTime) || null
    console.debug('[api.getActiveChat] Active chat:', activeChat?.id || 'none')
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
      chatApi.deleteKudosPrompt.bind(chatApi),
      chatId
    )
  },

  async acknowledgeKudos(chatId) {
    // Acknowledge is the same as dismiss - just marks the kudos notification as seen
    return await promisify(
      chatApi.deleteKudosPrompt.bind(chatApi),
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

  async getPairwiseSurveys(locationId, sessionId) {
    const opts = {}
    if (locationId) opts.locationId = locationId
    if (sessionId && sessionId !== 'all') opts.sessionId = sessionId

    return await promisify(
      surveysApi.getPairwiseSurveys.bind(surveysApi),
      opts
    )
  },

  async getStandardSurveys(locationId, sessionId) {
    const opts = {}
    if (locationId) opts.locationId = locationId
    if (sessionId && sessionId !== 'all') opts.sessionId = sessionId

    return await promisify(
      surveysApi.getActiveSurveys.bind(surveysApi),
      opts
    )
  },

  async getAllSurveys(locationId, sessionId) {
    const [pairwise, standard] = await Promise.all([
      this.getPairwiseSurveys(locationId, sessionId),
      this.getStandardSurveys(locationId, sessionId),
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

// Sessions API
export const sessionsApiWrapper = {
  async getAll(locationId) {
    return await promisify(
      sessionsApi.getAllSessions.bind(sessionsApi),
      locationId ? { locationId } : {}
    )
  },

  async suggest(statement, limit = 3) {
    return await promisify(
      sessionsApi.getSessionSuggestions.bind(sessionsApi),
      statement, { limit }
    )
  },

  async get(sessionId) {
    return await promisify(
      sessionsApi.getSession.bind(sessionsApi),
      sessionId
    )
  },

  async update(sessionId, data) {
    return await promisify(
      sessionsApi.updateSession.bind(sessionsApi),
      sessionId,
      data
    )
  },

  async getVotingRound(sessionId, { roundType } = {}) {
    return await promisify(
      sessionsApi.getVotingRound.bind(sessionsApi),
      sessionId,
      { roundType }
    )
  },

  async advanceVotingRound(sessionId) {
    return await promisify(
      sessionsApi.advanceVotingRound.bind(sessionsApi),
      sessionId
    )
  },

  async createVotingRound(sessionId, opts = {}) {
    return await promisify(
      sessionsApi.createVotingRound.bind(sessionsApi),
      sessionId,
      { createVotingRoundRequest: opts }
    )
  },

  async getEndorsements(sessionId, { roundType } = {}) {
    return await promisify(
      sessionsApi.getEndorsements.bind(sessionsApi),
      sessionId,
      { roundType }
    )
  },

  async createEndorsement(sessionId, proposalPostId) {
    return await promisify(
      sessionsApi.createEndorsement.bind(sessionsApi),
      sessionId,
      { proposalPostId }
    )
  },

  async deleteEndorsement(sessionId, endorsementId) {
    return await promisify(
      sessionsApi.deleteEndorsement.bind(sessionsApi),
      sessionId,
      endorsementId
    )
  },

  async getBallot(sessionId, { roundType } = {}) {
    return await promisify(
      sessionsApi.getBallot.bind(sessionsApi),
      sessionId,
      { roundType }
    )
  },

  async submitBallot(sessionId, rankings) {
    return await promisify(
      sessionsApi.submitBallot.bind(sessionsApi),
      sessionId,
      { rankings }
    )
  },

  async getCandidates(sessionId, { roundType } = {}) {
    return await promisify(
      sessionsApi.getCandidates.bind(sessionsApi),
      sessionId,
      { roundType }
    )
  },

  async getResults(sessionId, { roundType } = {}) {
    return await promisify(
      sessionsApi.getResults.bind(sessionsApi),
      sessionId,
      { roundType }
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

  async bulkRemove({ sessionId, locationCode, itemIds }) {
    const body = {}
    if (sessionId) body.sessionId = sessionId
    if (locationCode) body.locationCode = locationCode
    if (itemIds) body.itemIds = itemIds

    return await promisify(
      chattingListApi.bulkDeleteChattingListItems.bind(chattingListApi),
      body
    )
  },
}

// Stats API
export const statsApiWrapper = {
  async getStats(locationId, sessionId, opts = {}) {
    if (sessionId === 'all' || !sessionId) {
      return await promisify(
        statsApi.getLocationStats.bind(statsApi),
        locationId
      )
    }
    // Pass phase as query parameter if provided
    // The generated client doesn't have opts yet, so we call callApi directly
    const { phase } = opts
    if (phase) {
      return new Promise((resolve, reject) => {
        const StatsResponse = require('candid_api').StatsResponse
        statsApi.apiClient.callApi(
          '/stats/{locationId}/{sessionId}', 'GET',
          { locationId, sessionId },
          { phase },
          {}, {}, null,
          ['BearerAuth'], [], ['application/json'],
          StatsResponse, null,
          (error, data, response) => {
            if (error) {
              const status = response?.status || error?.status || 0
              const path = response?.req?.path || ''
              recordApiError(path, status, error?.message || String(error))
              reject(error)
            } else {
              resolve(data)
            }
          }
        )
      })
    }
    return await promisify(
      statsApi.getStats.bind(statsApi),
      locationId,
      sessionId
    )
  },

  async getGroupDemographics(locationId, sessionId, groupId) {
    const sessId = sessionId === 'all' || !sessionId ? 'all' : sessionId
    return await promisify(
      statsApi.getGroupDemographics.bind(statsApi),
      locationId,
      sessId,
      groupId
    )
  },
}

// Moderation API
export const moderationApiWrapper = {
  async getRules(contentType, { locationId, sessionId, postType } = {}) {
    const opts = {}
    if (contentType) opts.contentType = contentType
    if (locationId) opts.locationId = locationId
    if (sessionId) opts.sessionId = sessionId
    if (postType) opts.postType = postType
    return await promisify(moderationApi.getRules.bind(moderationApi), opts)
  },

  async getQueue() {
    // Use raw response.body pattern (like cards) since queue returns oneOf items
    return new Promise((resolve, reject) => {
      moderationApi.getModerationQueue({}, (error, data, response) => {
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

  async reportPost(postId, ruleId, comment = null) {
    const body = { ruleId }
    if (comment) body.comment = comment

    return await promisify(
      moderationApi.reportPost.bind(moderationApi),
      postId,
      body
    )
  },

  async reportComment(commentId, ruleId, comment = null) {
    const body = { ruleId }
    if (comment) body.comment = comment

    return await promisify(
      moderationApi.reportComment.bind(moderationApi),
      commentId,
      body
    )
  },

  async createAction(body) {
    return await promisify(
      moderationApi.createModerationAction.bind(moderationApi),
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
      moderationApi.deleteAdminResponseNotification.bind(moderationApi),
      appealId
    )
  },

  async getUserModerationHistory(userId) {
    return await promisify(
      moderationApi.getUserModerationHistory.bind(moderationApi),
      userId
    )
  },

  async checkToxicity(text) {
    return await promisify(
      moderationApi.checkToxicity.bind(moderationApi),
      { text }
    )
  },

  async claimReport(reportId, userId) {
    return await promisify(
      moderationApi.updateReport.bind(moderationApi),
      reportId,
      { claimedBy: userId }
    )
  },

  async releaseReport(reportId) {
    return await promisify(
      moderationApi.updateReport.bind(moderationApi),
      reportId,
      { claimedBy: null }
    )
  },
}

// Admin API
export const adminApiWrapper = {
  async searchUsers(query, { limit = 20, offset = 0 } = {}) {
    return await promisify(
      adminApi.searchUsers.bind(adminApi),
      { search: query, limit, offset }
    )
  },

  async listRoles({ userId, locationId, role, sessionId } = {}) {
    return await promisify(
      adminApi.listRoles.bind(adminApi),
      { userId, locationId, role, sessionId }
    )
  },

  async requestRoleAssignment(body) {
    return await promisify(
      adminApi.createRoleRequest.bind(adminApi),
      { action: 'assign', ...body }
    )
  },

  async requestRoleRemoval(userRoleId, reason) {
    return await promisify(
      adminApi.createRoleRequest.bind(adminApi),
      { action: 'remove', userRoleId, reason }
    )
  },

  async getPendingRequests() {
    return await promisify(
      adminApi.getPendingRoleRequests.bind(adminApi)
    )
  },

  async getRoleRequests(view = 'pending') {
    return await promisify(
      adminApi.getRoleRequests.bind(adminApi),
      { view }
    )
  },

  async rescindRoleRequest(requestId) {
    return await promisify(
      adminApi.updateRoleRequest.bind(adminApi),
      requestId,
      { status: 'rescinded' }
    )
  },

  async approveRoleRequest(requestId) {
    return await promisify(
      adminApi.updateRoleRequest.bind(adminApi),
      requestId,
      { status: 'approved' }
    )
  },

  async denyRoleRequest(requestId, reason) {
    return await promisify(
      adminApi.updateRoleRequest.bind(adminApi),
      requestId,
      { status: 'denied', reason }
    )
  },

  async createLocation(parentLocationId, name, code) {
    return await promisify(
      adminApi.createLocation.bind(adminApi),
      { parentLocationId, name, code }
    )
  },

  async updateLocation(locationId, updates) {
    return await promisify(
      adminApi.updateLocation.bind(adminApi),
      locationId,
      updates
    )
  },

  async deleteLocation(locationId) {
    return await promisify(
      adminApi.deleteLocation.bind(adminApi),
      locationId
    )
  },

  async getAllSessions() {
    return await promisify(
      sessionsApi.getAllSessions.bind(sessionsApi),
      {}
    )
  },

  async getAdminSessions() {
    return await promisify(
      adminApi.getAdminSessions.bind(adminApi),
    )
  },

  async getLocationSessions(locationId) {
    return await promisify(
      adminApi.getLocationSessions.bind(adminApi),
      locationId
    )
  },

  async assignLocationSession(locationId, sessionId) {
    return await promisify(
      adminApi.assignLocationSession.bind(adminApi),
      locationId,
      { sessionId }
    )
  },

  async removeLocationSession(locationId, sessionId) {
    return await promisify(
      adminApi.removeLocationSession.bind(adminApi),
      locationId,
      sessionId
    )
  },

  async createSession(label, parentSessionId, opts = {}) {
    return await promisify(
      adminApi.createSession.bind(adminApi),
      { label, parentSessionId, ...opts }
    )
  },

  async getSessionLabelSurvey(sessionId) {
    return await promisify(
      adminApi.getSessionLabelSurvey.bind(adminApi),
      sessionId
    )
  },

  async banUser(userId, reason) {
    return await promisify(
      adminApi.updateUserStatus.bind(adminApi),
      userId,
      { status: 'banned', reason }
    )
  },

  async unbanUser(userId, reason) {
    return await promisify(
      adminApi.updateUserStatus.bind(adminApi),
      userId,
      { status: 'active', reason }
    )
  },

  async getSurveys({ title, status, locationId, sessionId } = {}) {
    return await promisify(
      adminApi.getSurveys.bind(adminApi),
      { title, status, locationId, sessionId }
    )
  },

  async createSurvey(body) {
    return await promisify(
      adminApi.createSurvey.bind(adminApi),
      body
    )
  },

  async createPairwiseSurvey(body) {
    return await promisify(
      adminApi.createPairwiseSurvey.bind(adminApi),
      body
    )
  },

  async deleteSurvey(surveyId) {
    return await promisify(
      adminApi.deleteSurvey.bind(adminApi),
      surveyId
    )
  },

  async getAdminActions() {
    return await promisify(
      adminApi.getAdminActions.bind(adminApi)
    )
  },

  // Rule management
  async getAdminRules({ status, locationId, contentType } = {}) {
    return await promisify(
      adminApi.getAdminRules.bind(adminApi),
      { status, locationId, contentType }
    )
  },

  async createRuleRequest(body) {
    return await promisify(
      adminApi.createRuleRequest.bind(adminApi),
      body
    )
  },

  async getRuleRequests(view = 'pending') {
    return await promisify(
      adminApi.getRuleRequests.bind(adminApi),
      { view }
    )
  },

  async approveRuleRequest(requestId) {
    return await promisify(
      adminApi.updateRuleRequest.bind(adminApi),
      requestId,
      { status: 'approved' }
    )
  },

  async denyRuleRequest(requestId, reason) {
    return await promisify(
      adminApi.updateRuleRequest.bind(adminApi),
      requestId,
      { status: 'denied', reason }
    )
  },

  async rescindRuleRequest(requestId) {
    return await promisify(
      adminApi.updateRuleRequest.bind(adminApi),
      requestId,
      { status: 'rescinded' }
    )
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

// Posts API
export const postsApiWrapper = {
  async getPosts(locationId, { sessionId, postType, sort, cursor, limit, answered, phase } = {}) {
    const opts = {}
    if (sessionId && sessionId !== 'all') opts.sessionId = sessionId
    if (postType) opts.postType = postType
    if (sort) opts.sort = sort
    if (cursor) opts.cursor = cursor
    if (limit) opts.limit = limit
    if (answered != null) opts.answered = answered
    if (phase) opts.phase = phase
    return await promisify(postsApi.getPosts.bind(postsApi), locationId, opts)
  },

  async getPost(postId) {
    return await promisify(postsApi.getPost.bind(postsApi), postId)
  },

  async createPost(body) {
    return await promisify(postsApi.createPost.bind(postsApi), body)
  },

  async updatePost(postId, body) {
    return await promisify(postsApi.updatePost.bind(postsApi), postId, body)
  },

  async deletePost(postId) {
    return await promisify(postsApi.deletePost.bind(postsApi), postId)
  },

  async voteOnPost(postId, body) {
    return await promisify(postsApi.voteOnPost.bind(postsApi), postId, body)
  },

  async lockPost(postId, locked = true) {
    return await promisify(postsApi.patchPost.bind(postsApi), postId, { locked })
  },

  async patchPost(postId, body) {
    return await promisify(postsApi.patchPost.bind(postsApi), postId, body)
  },

  async pinComment(postId, commentId) {
    return await promisify(postsApi.patchPost.bind(postsApi), postId, { pinnedCommentId: commentId || null })
  },

  async proposalAssist(body) {
    return await promisify(postsApi.proposalAssist.bind(postsApi), body)
  },

  async finalizeProposal(postId) {
    return await promisify(postsApi.patchPost.bind(postsApi), postId, { proposalStatus: 'finalized' })
  },
}

// Comments API
export const commentsApiWrapper = {
  async getComments(postId, opts = {}) {
    const { cursor, limit } = opts
    return await promisify(commentsApi.getComments.bind(commentsApi), postId, { cursor, limit })
  },

  async createComment(postId, body) {
    return await promisify(commentsApi.createComment.bind(commentsApi), postId, body)
  },

  async updateComment(commentId, body) {
    return await promisify(commentsApi.updateComment.bind(commentsApi), commentId, body)
  },

  async deleteComment(commentId) {
    return await promisify(commentsApi.deleteComment.bind(commentsApi), commentId)
  },

  async voteOnComment(commentId, body) {
    return await promisify(commentsApi.voteOnComment.bind(commentsApi), commentId, body)
  },

  async patchComment(commentId, body) {
    return await promisify(commentsApi.patchComment.bind(commentsApi), commentId, body)
  },

  async getCommentThread(postId, commentId, opts = {}) {
    const { maxDescendants, includeAncestors } = opts
    return await promisify(commentsApi.getCommentThread.bind(commentsApi), postId, commentId, { maxDescendants, includeAncestors })
  },
}

// Notifications API
export const notificationsApiWrapper = {
  async getNotifications(opts = {}) {
    return await promisify(notificationsApi.getNotifications.bind(notificationsApi), opts)
  },

  async getUnreadCount() {
    return await promisify(notificationsApi.getNotificationsUnreadCount.bind(notificationsApi))
  },

  async markRead(notificationId) {
    return await promisify(notificationsApi.markNotificationRead.bind(notificationsApi), notificationId)
  },

  async markAllRead() {
    return await promisify(notificationsApi.markAllNotificationsRead.bind(notificationsApi))
  },
}

// Glossary API
export const glossaryApiWrapper = {
  async getTerms(opts = {}) {
    return await promisify(glossaryApi.getGlossaryTerms.bind(glossaryApi), opts)
  },

  async getTerm(slug) {
    return await promisify(glossaryApi.getGlossaryTerm.bind(glossaryApi), slug)
  },

  async updateTerm(slug, body) {
    return await promisify(glossaryApi.updateGlossaryTerm.bind(glossaryApi), slug, body)
  },

  async createTerm(body) {
    return await promisify(glossaryApi.createGlossaryTerm.bind(glossaryApi), body)
  },

  async getTermHistory(slug) {
    return await promisify(glossaryApi.getGlossaryTermHistory.bind(glossaryApi), slug)
  },

  async getTermVersion(slug, versionId) {
    return await promisify(glossaryApi.getGlossaryTermVersion.bind(glossaryApi), slug, versionId)
  },
}

// Wiki API (browsable knowledgebase — all routed through GlossaryApi by Connexion first-tag)
export const wikiApiWrapper = {
  async getPages(opts = {}) {
    return await promisify(glossaryApi.getWikiPages.bind(glossaryApi), opts)
  },

  async getPage(slug) {
    return await promisify(glossaryApi.getWikiPage.bind(glossaryApi), slug)
  },

  async getCategories() {
    return await promisify(glossaryApi.getWikiCategories.bind(glossaryApi))
  },

  async createSuggestion(body) {
    return await promisify(glossaryApi.createWikiSuggestion.bind(glossaryApi), body)
  },

  async getSuggestions(opts = {}) {
    return await promisify(glossaryApi.getWikiSuggestions.bind(glossaryApi), opts)
  },

  async getSuggestion(suggestionId) {
    return await promisify(glossaryApi.getWikiSuggestion.bind(glossaryApi), suggestionId)
  },

  async updateSuggestion(suggestionId, body) {
    return await promisify(glossaryApi.updateWikiSuggestion.bind(glossaryApi), suggestionId, body)
  },

  async getSuggestionCount() {
    return await promisify(glossaryApi.getWikiSuggestionCount.bind(glossaryApi))
  },

  async updatePage(slug, body) {
    return await promisify(glossaryApi.updateWikiPage.bind(glossaryApi), slug, body)
  },

  async createPage(body) {
    return await promisify(glossaryApi.createWikiPage.bind(glossaryApi), body)
  },

  async checkCreateAuthority(scopes) {
    const locationIds = (scopes || []).filter(s => s.type === 'location').map(s => s.id)
    const sessionIds = (scopes || []).filter(s => s.type === 'session').map(s => s.id)
    return await promisify(glossaryApi.getWikiAuthority.bind(glossaryApi), { locationIds, sessionIds })
  },

  async getPageHistory(slug) {
    return await promisify(glossaryApi.getWikiPageHistory.bind(glossaryApi), slug)
  },

  async getPageVersion(versionId, slug) {
    return await promisify(glossaryApi.getWikiPageVersion.bind(glossaryApi), versionId, slug)
  },

  async uploadImage(formData) {
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/wiki/images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.detail || 'Image upload failed')
    }
    const data = await response.json()
    // Backend returns relative URL like "/api/v1/wiki/images/{id}"
    // Make it absolute so it works in rendered markdown on any platform
    if (data.url?.startsWith('/')) {
      const origin = new URL(API_BASE_URL).origin
      return origin + data.url
    }
    return data.url
  },
}

export default {
  auth: authApi,
  users: usersApiWrapper,
  cards: cardsApiWrapper,
  positions: positionsApiWrapper,
  chat: chatApiWrapper,
  surveys: surveysApiWrapper,
  sessions: sessionsApiWrapper,
  stats: statsApiWrapper,
  chattingList: chattingListApiWrapper,
  moderation: moderationApiWrapper,
  admin: adminApiWrapper,
  bugReports: bugReportsApiWrapper,
  posts: postsApiWrapper,
  comments: commentsApiWrapper,
  notifications: notificationsApiWrapper,
  glossary: glossaryApiWrapper,
  wiki: wikiApiWrapper,
  initializeAuth,
}

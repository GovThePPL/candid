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
  LoginUserRequest,
  RegisterUserRequest,
} from 'candid_api'

// API configuration
const API_BASE_URL = __DEV__
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
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/users/me/locations`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch locations')
    }

    return response.json()
  },

  async getMyPositions(status = 'all') {
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/users/me/positions?status=${status}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch positions')
    }

    return response.json()
  },

  async updatePosition(userPositionId, status) {
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/users/me/positions/${userPositionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to update position')
    }

    return response.json()
  },

  async deletePosition(userPositionId) {
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/users/me/positions/${userPositionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to delete position')
    }
  },
}

// Cards API
export const cardsApiWrapper = {
  async getCardQueue(limit = 10) {
    // WORKAROUND: Bypass the generated client's oneOf validation
    //
    // The OpenAPI JavaScript generator has a bug with oneOf discriminators.
    // When validating JSON, it checks if data matches ANY schema rather than
    // using the discriminator field ('type') to select the correct one first.
    // This causes "Multiple matches found" errors for card queue responses.
    //
    // Issue: openapi-generator doesn't properly validate discriminator enum values
    // See: https://github.com/OpenAPITools/openapi-generator/issues/10010
    //
    // Future options:
    // 1. Patch generated *CardItem.js files to check discriminator value first
    // 2. Switch to typescript-fetch or typescript-axios generator (better discriminator support)
    // 3. Keep this direct fetch workaround
    //
    const token = await getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/card-queue?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    } catch (networkError) {
      throw new Error(`Network error: ${networkError.message}`)
    }

    if (!response.ok) {
      let errorMessage = 'Failed to fetch card queue'
      try {
        const error = await response.json()
        errorMessage = error.message || errorMessage
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMessage)
    }

    return response.json()
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
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/positions/${positionId}/adopt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to adopt position')
    }

    return response.json()
  },

  async searchSimilar(statement, options = {}) {
    const { categoryId, locationId, limit = 5 } = options
    const token = await getToken()

    const body = { statement }
    if (categoryId) body.categoryId = categoryId
    if (locationId) body.locationId = locationId
    if (limit) body.limit = limit

    const response = await fetch(`${API_BASE_URL}/positions/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to search positions')
    }

    return response.json()
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
    const token = await getToken()
    const response = await fetch(
      `${API_BASE_URL}/chats/user/${userId}?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch user chats')
    }

    return response.json()
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
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/chats/requests/${requestId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to rescind chat request')
    }

    return response.json()
  },

  async getChatLog(chatId) {
    // WORKAROUND: Bypass generated client which drops extra fields
    // The generated GetChatLog200Response model only has 'id' and 'chatLog'
    // but backend returns more fields (otherUser, positionStatement, etc.)
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/chats/${chatId}/log`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch chat log')
    }

    return response.json()
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
}

// Categories API
export const categoriesApiWrapper = {
  async getAll() {
    return await promisify(categoriesApi.getAllCategories.bind(categoriesApi))
  },

  async suggest(statement, limit = 3) {
    const token = await getToken()
    const response = await fetch(`${API_BASE_URL}/categories/suggest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statement, limit }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to suggest category')
    }

    return response.json()
  },
}

// Stats API
export const statsApiWrapper = {
  async getStats(locationId, categoryId) {
    const token = await getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    // Use location-only endpoint for "all" categories
    const url = categoryId === 'all' || !categoryId
      ? `${API_BASE_URL}/stats/${locationId}`
      : `${API_BASE_URL}/stats/${locationId}/${categoryId}`

    const response = await fetch(
      url,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch stats')
    }

    return response.json()
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
  initializeAuth,
}

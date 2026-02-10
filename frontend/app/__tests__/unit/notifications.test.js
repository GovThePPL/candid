// notifications.js lazy-loads expo-notifications/expo-device via require() in try/catch,
// so we must use virtual: true for modules that aren't actually installed.

const mockGetPermissions = jest.fn()
const mockRequestPermissions = jest.fn()
const mockGetExpoPushToken = jest.fn()
const mockSetNotificationHandler = jest.fn()
const mockAddResponseListener = jest.fn()
const mockRegisterPushToken = jest.fn(() => Promise.resolve())

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: mockGetPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  getExpoPushTokenAsync: mockGetExpoPushToken,
  setNotificationHandler: mockSetNotificationHandler,
  addNotificationResponseReceivedListener: mockAddResponseListener,
}), { virtual: true })

jest.mock('expo-device', () => ({
  isDevice: true,
}), { virtual: true })

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    users: {
      registerPushToken: mockRegisterPushToken,
    },
  },
}))

let registerForPushNotifications, setupNotificationHandler, addNotificationResponseListener

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()

  // Re-mock after resetModules
  jest.mock('expo-notifications', () => ({
    getPermissionsAsync: mockGetPermissions,
    requestPermissionsAsync: mockRequestPermissions,
    getExpoPushTokenAsync: mockGetExpoPushToken,
    setNotificationHandler: mockSetNotificationHandler,
    addNotificationResponseReceivedListener: mockAddResponseListener,
  }), { virtual: true })

  jest.mock('expo-device', () => ({
    isDevice: true,
  }), { virtual: true })

  jest.mock('../../lib/api', () => ({
    __esModule: true,
    default: {
      users: { registerPushToken: mockRegisterPushToken },
    },
  }))

  const mod = require('../../lib/notifications')
  registerForPushNotifications = mod.registerForPushNotifications
  setupNotificationHandler = mod.setupNotificationHandler
  addNotificationResponseListener = mod.addNotificationResponseListener
})

describe('registerForPushNotifications', () => {
  it('returns null when modules are unavailable', async () => {
    jest.resetModules()
    jest.mock('expo-notifications', () => {
      throw new Error('not installed')
    }, { virtual: true })
    jest.mock('expo-device', () => {
      throw new Error('not installed')
    }, { virtual: true })
    jest.mock('../../lib/api', () => ({
      __esModule: true,
      default: { users: { registerPushToken: jest.fn() } },
    }))

    const mod = require('../../lib/notifications')
    const result = await mod.registerForPushNotifications()
    expect(result).toBeNull()
  })

  it('returns null on non-device (simulator)', async () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ isDevice: false }), { virtual: true })
    jest.mock('expo-notifications', () => ({
      getPermissionsAsync: mockGetPermissions,
      requestPermissionsAsync: mockRequestPermissions,
      getExpoPushTokenAsync: mockGetExpoPushToken,
      setNotificationHandler: mockSetNotificationHandler,
      addNotificationResponseReceivedListener: mockAddResponseListener,
    }), { virtual: true })
    jest.mock('../../lib/api', () => ({
      __esModule: true,
      default: { users: { registerPushToken: jest.fn() } },
    }))

    const mod = require('../../lib/notifications')
    const result = await mod.registerForPushNotifications()
    expect(result).toBeNull()
  })

  it('returns null when permission is denied', async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: 'undetermined' })
    mockRequestPermissions.mockResolvedValueOnce({ status: 'denied' })

    const result = await registerForPushNotifications()
    expect(result).toBeNull()
  })

  it('returns token on success with existing permission', async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: 'granted' })
    mockGetExpoPushToken.mockResolvedValueOnce({ data: 'ExponentPushToken[abc]' })

    const result = await registerForPushNotifications()
    expect(result).toBe('ExponentPushToken[abc]')
  })

  it('requests permission if not already granted', async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: 'undetermined' })
    mockRequestPermissions.mockResolvedValueOnce({ status: 'granted' })
    mockGetExpoPushToken.mockResolvedValueOnce({ data: 'ExponentPushToken[def]' })

    const result = await registerForPushNotifications()
    expect(result).toBe('ExponentPushToken[def]')
    expect(mockRequestPermissions).toHaveBeenCalled()
  })

  it('registers token with backend', async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: 'granted' })
    mockGetExpoPushToken.mockResolvedValueOnce({ data: 'ExponentPushToken[xyz]' })

    await registerForPushNotifications()
    expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[xyz]', expect.any(String))
  })
})

describe('setupNotificationHandler', () => {
  it('calls setNotificationHandler', () => {
    setupNotificationHandler()
    expect(mockSetNotificationHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handleNotification: expect.any(Function),
      })
    )
  })

  it('handler returns shouldShowAlert: true', async () => {
    setupNotificationHandler()
    const config = mockSetNotificationHandler.mock.calls[0][0]
    const result = await config.handleNotification()
    expect(result.shouldShowAlert).toBe(true)
    expect(result.shouldPlaySound).toBe(true)
  })
})

describe('addNotificationResponseListener', () => {
  it('returns cleanup function', () => {
    const mockRemove = jest.fn()
    mockAddResponseListener.mockReturnValueOnce({ remove: mockRemove })

    const cleanup = addNotificationResponseListener(jest.fn())
    expect(typeof cleanup).toBe('function')

    cleanup()
    expect(mockRemove).toHaveBeenCalled()
  })
})

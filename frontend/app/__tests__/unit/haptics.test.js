import { Platform } from 'react-native'

// Must mock expo-haptics before importing haptics module
const mockImpactAsync = jest.fn(() => Promise.resolve())
const mockNotificationAsync = jest.fn(() => Promise.resolve())

jest.mock('expo-haptics', () => ({
  impactAsync: mockImpactAsync,
  notificationAsync: mockNotificationAsync,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

describe('haptics on native', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Platform.OS = 'ios'
  })

  afterAll(() => {
    Platform.OS = 'ios'
  })

  it('hapticTap calls impactAsync with Light', () => {
    // Re-require to pick up Platform.OS = 'ios'
    jest.resetModules()
    Platform.OS = 'ios'
    const { hapticTap } = require('../../lib/haptics')
    hapticTap()
    expect(mockImpactAsync).toHaveBeenCalledWith('light')
  })

  it('hapticSuccess calls notificationAsync with Success', () => {
    jest.resetModules()
    Platform.OS = 'ios'
    const { hapticSuccess } = require('../../lib/haptics')
    hapticSuccess()
    expect(mockNotificationAsync).toHaveBeenCalledWith('success')
  })
})

describe('haptics on web', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
    Platform.OS = 'web'
  })

  afterAll(() => {
    Platform.OS = 'ios'
  })

  it('hapticTap is a no-op', () => {
    const { hapticTap } = require('../../lib/haptics')
    hapticTap() // Should not throw
    expect(mockImpactAsync).not.toHaveBeenCalled()
  })

  it('hapticSuccess is a no-op', () => {
    const { hapticSuccess } = require('../../lib/haptics')
    hapticSuccess() // Should not throw
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })
})

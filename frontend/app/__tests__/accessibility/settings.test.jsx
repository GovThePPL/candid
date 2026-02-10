import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Mock theme and user hooks
const mockColors = {
  primary: '#5C005C', text: '#2C3842', title: '#5C005C',
  secondaryText: '#666666', placeholderText: '#999999', pass: '#CCCCCC',
  cardBackground: '#FFFFFF', cardBorder: '#E0E0E0', background: '#F5F5F5',
  badgeText: '#FFFFFF', buttonDefault: '#E0E0E0', buttonSelected: '#5C005C',
  buttonDefaultText: '#333', buttonSelectedText: '#FFF', badgeBg: '#E0E0E0',
  iconColor: '#888', iconColorFocused: '#5C005C', tabInactive: '#999',
  navBackground: '#FFF', chat: '#9B59B6', uiBackground: '#FFF',
  errorBannerBg: '#FDE8E8',
}

jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockColors,
    theme: 'light',
    themePreference: 'light',
    setThemePreference: jest.fn(),
  }),
}))

jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({
    user: { displayName: 'TestUser', username: 'test', kudosCount: 5 },
    refreshUser: jest.fn(),
  }),
}))

jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext({
    user: { displayName: 'TestUser', username: 'test', kudosCount: 5 },
    logout: jest.fn(),
    pendingChatRequest: null,
    clearPendingChatRequest: jest.fn(),
  }),
}))

// Mock navigation
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

// Mock components
jest.mock('../../components/Header', () => {
  const { View } = require('react-native')
  return () => <View testID="header" />
})
jest.mock('../../components/Avatar', () => {
  const { View } = require('react-native')
  return () => <View testID="avatar" />
})
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    users: { updateUser: jest.fn(() => Promise.resolve()), deleteAccount: jest.fn(() => Promise.resolve()) },
    moderation: { getRules: jest.fn() },
  },
}))
jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
}))
jest.mock('../../lib/keycloak', () => ({
  clearTokens: jest.fn(() => Promise.resolve()),
}))
jest.mock('../../components/BugReportModal', () => {
  const { View } = require('react-native')
  return () => <View testID="bug-modal" />
})
jest.mock('../../lib/avatarUtils', () => ({
  getTrustBadgeColor: () => '#FFD700',
}))
jest.mock('../../components/ChatRequestIndicator', () => {
  const { View } = require('react-native')
  return () => <View testID="chat-indicator" />
})
jest.mock('../../components/Sidebar', () => {
  const { View } = require('react-native')
  return () => <View testID="sidebar" />
})
jest.mock('../../components/LocationPicker', () => {
  const { View } = require('react-native')
  return () => <View testID="location-picker" />
})
jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return ({ children, visible }) => visible ? <View>{children}</View> : null
})

import SettingsHub from '../../app/(dashboard)/settings/index'

describe('Settings Hub accessibility', () => {
  test('profile button has label with user name', () => {
    render(<SettingsHub />)
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeTruthy()
  })

  test('theme options have radio role', () => {
    render(<SettingsHub />)
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(3) // light, dark, system
  })

  test('light theme radio is checked when active', () => {
    render(<SettingsHub />)
    expect(screen.getByRole('radio', { name: /light/i })).toBeChecked()
  })

  test('menu items have button role and label', () => {
    render(<SettingsHub />)
    expect(screen.getByRole('button', { name: 'Demographics' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preferences' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy()
  })
})

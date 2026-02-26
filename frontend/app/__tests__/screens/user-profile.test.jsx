import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = {
  primary: '#5C005C', primarySurface: '#5C005C', text: '#2C3842', title: '#5C005C',
  secondaryText: '#666666', placeholderText: '#999999', pass: '#CCCCCC',
  cardBackground: '#FFFFFF', cardBorder: '#E0E0E0', background: '#F5F5F5',
  badgeText: '#FFFFFF', buttonDefault: '#E0E0E0', buttonSelected: '#5C005C',
  buttonDefaultText: '#333', buttonSelectedText: '#FFF', badgeBg: '#E0E0E0',
  iconColor: '#888', iconColorFocused: '#5C005C', tabInactive: '#999',
  navBackground: '#FFF', chat: '#9B59B6', uiBackground: '#FFF',
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

jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext({
    user: { id: 'u1', displayName: 'Me', username: 'me', kudosCount: 0, roles: [] },
    logout: jest.fn(),
    pendingChatRequest: null,
    clearPendingChatRequest: jest.fn(),
    positionsVersion: 0,
    isBanned: false,
  }),
  useAuth: () => ({
    user: { id: 'u1', displayName: 'Me', username: 'me', kudosCount: 0, roles: [] },
    logout: jest.fn(),
    isBanned: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/user/otheruser',
  useLocalSearchParams: () => ({ username: 'otheruser' }),
  useSegments: () => [],
  useFocusEffect: jest.fn(),
}))

jest.mock('../../components/Header', () => {
  const { View } = require('react-native')
  return (props) => <View testID="header" {...props} />
})
jest.mock('../../components/Avatar', () => {
  const { View } = require('react-native')
  return () => <View testID="avatar" />
})
jest.mock('../../components/PostsContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader, userId }) => <View testID="posts-content" userId={userId}>{listHeader}{stickyHeader}</View>
})
jest.mock('../../components/CommentsContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader, userId }) => <View testID="comments-content" userId={userId}>{listHeader}{stickyHeader}</View>
})

const mockGetUserByUsername = jest.fn(() => Promise.resolve({
  id: 'u2',
  displayName: 'Other User',
  username: 'otheruser',
  kudosCount: 3,
  roles: [],
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    users: { getUserByUsername: (...args) => mockGetUserByUsername(...args) },
  },
  translateError: (msg) => msg,
}))
jest.mock('../../lib/avatarUtils', () => ({
  getTrustBadgeInfo: () => ({ color: '#FFD700', tier: 'gold' }),
}))
jest.mock('../../components/ChatRequestIndicator', () => {
  const { View } = require('react-native')
  return () => <View testID="chat-indicator" />
})
jest.mock('../../components/discuss/RoleBadge', () => {
  const { Text } = require('react-native')
  return ({ role, location, session }) => (
    <Text testID="role-badge">{[location, session, role].filter(Boolean).join(' · ')}</Text>
  )
})

import UserProfileScreen from '../../app/(dashboard)/user/[username]'

beforeEach(() => {
  mockGetUserByUsername.mockClear()
  mockGetUserByUsername.mockResolvedValue({
    id: 'u2',
    displayName: 'Other User',
    username: 'otheruser',
    kudosCount: 3,
    roles: [],
  })
})

describe('User profile screen (/user/[username])', () => {
  test('fetches user by username', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    expect(mockGetUserByUsername).toHaveBeenCalledWith('otheruser')
  })

  test('displays user display name and username', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.getByText('@otheruser')).toBeTruthy()
  })

  test('shows only 2 tabs (posts and comments)', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
  })

  test('posts tab active by default', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.getByTestId('posts-content')).toBeTruthy()
  })

  test('passes user ID to PostsContent', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    const postsContent = screen.getByTestId('posts-content')
    expect(postsContent.props.userId).toBe('u2')
  })

  test('shows not found screen when user does not exist', async () => {
    mockGetUserByUsername.mockRejectedValue(new Error('Not Found'))
    render(<UserProfileScreen />)
    await screen.findByText('userProfileNotFound')
  })

  test('does not show admin button', async () => {
    render(<UserProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.queryByRole('button', { name: /adminButtonA11y/i })).toBeNull()
  })
})

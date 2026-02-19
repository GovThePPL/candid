import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

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

// Start with admin user so admin tests work; non-admin tests check queryBy
const mockUser = {
  id: 'u1',
  displayName: 'TestUser',
  username: 'testuser',
  kudosCount: 5,
  roles: [{ role: 'admin', locationId: 1, locationCode: 'US', categoryLabel: null }],
}

jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext({
    user: {
      id: 'u1',
      displayName: 'TestUser',
      username: 'testuser',
      kudosCount: 5,
      roles: [{ role: 'admin', locationId: 1, locationCode: 'US', categoryLabel: null }],
    },
    logout: jest.fn(),
    pendingChatRequest: null,
    clearPendingChatRequest: jest.fn(),
    positionsVersion: 0,
    isBanned: false,
  }),
}))

let mockSearchParams = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/profile',
  useLocalSearchParams: () => mockSearchParams,
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
jest.mock('../../components/PositionManagerContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader }) => <View testID="position-manager-content">{listHeader}{stickyHeader}</View>
})
jest.mock('../../components/PostsContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader, userId }) => <View testID="posts-content" userId={userId}>{listHeader}{stickyHeader}</View>
})
jest.mock('../../components/CommentsContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader, userId }) => <View testID="comments-content" userId={userId}>{listHeader}{stickyHeader}</View>
})
jest.mock('../../components/ChatHistoryContent', () => {
  const { View } = require('react-native')
  return ({ listHeader, stickyHeader }) => <View testID="chat-history-content">{listHeader}{stickyHeader}</View>
})
const mockGetUserById = jest.fn(() => Promise.resolve({
  id: 'u2',
  displayName: 'Other User',
  username: 'otheruser',
  kudosCount: 3,
  roles: [],
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    admin: { getPendingRequests: jest.fn(() => Promise.resolve([])) },
    users: { getUserById: (...args) => mockGetUserById(...args) },
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
  return ({ role, location, category }) => (
    <Text testID="role-badge">{[location, category, role].filter(Boolean).join(' · ')}</Text>
  )
})

import ProfileScreen from '../../app/(dashboard)/profile'

beforeEach(() => {
  mockSearchParams = {}
  mockGetUserById.mockClear()
})

describe('Profile screen', () => {
  test('renders profile card with display name and username', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('TestUser')).toBeTruthy()
    expect(screen.getByText('@testuser')).toBeTruthy()
  })

  test('renders 4 icon tabs with positions active by default', () => {
    render(<ProfileScreen />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(4)
    expect(tabs[0]).toBeSelected()
  })

  test('positions tab renders PositionManagerContent by default', () => {
    render(<ProfileScreen />)
    expect(screen.getByTestId('position-manager-content')).toBeTruthy()
  })

  test('switching to posts tab renders PostsContent', () => {
    render(<ProfileScreen />)
    const postsTab = screen.getByRole('tab', { name: /activityTabPostsA11y/i })
    fireEvent.press(postsTab)
    expect(screen.getByTestId('posts-content')).toBeTruthy()
  })

  test('switching to comments tab renders CommentsContent', () => {
    render(<ProfileScreen />)
    const commentsTab = screen.getByRole('tab', { name: /activityTabCommentsA11y/i })
    fireEvent.press(commentsTab)
    expect(screen.getByTestId('comments-content')).toBeTruthy()
  })

  test('switching to chats tab renders ChatHistoryContent', () => {
    render(<ProfileScreen />)
    const chatsTab = screen.getByRole('tab', { name: /activityTabChatsA11y/i })
    fireEvent.press(chatsTab)
    expect(screen.getByTestId('chat-history-content')).toBeTruthy()
  })

  test('admin button shown when user has admin role', () => {
    render(<ProfileScreen />)
    expect(screen.getByRole('button', { name: /adminButtonA11y/i })).toBeTruthy()
  })

  test('header shows settings button on own profile', () => {
    render(<ProfileScreen />)
    const header = screen.getByTestId('header')
    expect(header.props.showSettingsButton).toBe(true)
    expect(header.props.showAvatar).toBe(false)
  })
})

describe('Public profile', () => {
  beforeEach(() => {
    mockSearchParams = { userId: 'u2' }
    mockGetUserById.mockResolvedValue({
      id: 'u2',
      displayName: 'Other User',
      username: 'otheruser',
      kudosCount: 3,
      roles: [],
    })
  })

  test('shows only 2 tabs (posts and comments)', async () => {
    render(<ProfileScreen />)
    // Wait for user fetch to resolve
    await screen.findByText('Other User')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
  })

  test('fetches target user via getUserById', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Other User')
    expect(mockGetUserById).toHaveBeenCalledWith('u2')
  })

  test('does not show admin button for public profile', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.queryByRole('button', { name: /adminButtonA11y/i })).toBeNull()
  })

  test('displays other user display name and username', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.getByText('@otheruser')).toBeTruthy()
  })

  test('posts tab active by default for public profile', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Other User')
    expect(screen.getByTestId('posts-content')).toBeTruthy()
  })

  test('shows not found screen when user does not exist', async () => {
    mockGetUserById.mockRejectedValue(new Error('Not Found'))
    render(<ProfileScreen />)
    await screen.findByText('userProfileNotFound')
  })
})

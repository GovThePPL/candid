import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Mock theme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#5C005C', primarySurface: '#5C005C',
    text: '#2C3842',
    title: '#5C005C',
    secondaryText: '#666666',
    placeholderText: '#999999',
    pass: '#CCCCCC',
    cardBackground: '#FFFFFF',
    cardBorder: '#E0E0E0',
    badgeText: '#FFFFFF',
    buttonDefault: '#E0E0E0',
    buttonSelected: '#5C005C',
    buttonSelectedText: '#FFFFFF',
    iconColor: '#888888',
    chat: '#9B59B6',
  }),
}))

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {}, theme: 'light', setTheme: jest.fn() }),
}))

// Mock navigation
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/cards',
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

// Mock dependencies
jest.mock('../../components/Avatar', () => {
  const { View } = require('react-native')
  return (props) => <View testID="avatar" />
})

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { chat: { rescindChatRequest: jest.fn() } },
  translateError: (msg) => msg,
}))

jest.mock('../../lib/avatarUtils', () => ({
  getTrustBadgeInfo: () => ({ color: '#FFD700', tier: 'gold' }),
}))

jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext({
    user: { displayName: 'Test User', username: 'testuser', kudosCount: 5 },
    logout: jest.fn(),
    pendingChatRequest: null,
    clearPendingChatRequest: jest.fn(),
  }),
}))

jest.mock('../../components/ChatRequestIndicator', () => {
  const { View } = require('react-native')
  return () => <View testID="chat-indicator" />
})

jest.mock('../../contexts/NotificationContext', () => ({
  useNotificationCount: () => ({ unreadCount: 0 }),
}))

import Header from '../../components/Header'
import GroupTabBar from '../../components/stats/GroupTabBar'
import PositionListManager from '../../components/PositionListManager'

describe('Header accessibility', () => {
  test('avatar button has viewProfile accessible label', () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: /viewProfile/i })).toBeTruthy()
  })

  test('showAvatar=false hides avatar button', () => {
    render(<Header showAvatar={false} />)
    expect(screen.queryByRole('button', { name: /viewProfile/i })).toBeNull()
  })
})

describe('GroupTabBar accessibility', () => {
  const groups = [
    { id: 'group_a', label: 'A' },
    { id: 'group_b', label: 'B' },
  ]

  test('container has tablist role', () => {
    const { UNSAFE_getByProps } = render(
      <GroupTabBar groups={groups} activeTab="majority" onTabChange={jest.fn()} />
    )
    expect(UNSAFE_getByProps({ accessibilityRole: 'tablist' })).toBeTruthy()
  })

  test('each tab has tab role', () => {
    render(
      <GroupTabBar groups={groups} activeTab="majority" onTabChange={jest.fn()} />
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(4) // All, A, B, My Positions
  })

  test('active tab is selected', () => {
    render(
      <GroupTabBar groups={groups} activeTab="majority" onTabChange={jest.fn()} />
    )
    expect(screen.getByRole('tab', { name: /^all$/i })).toBeSelected()
  })

  test('inactive tab is not selected', () => {
    render(
      <GroupTabBar groups={groups} activeTab="majority" onTabChange={jest.fn()} />
    )
    const tabA = screen.getByRole('tab', { name: 'A' })
    expect(tabA).not.toBeSelected()
  })
})

describe('PositionListManager expand headers accessibility', () => {
  // Generate 25+ items to trigger collapsible mode (grouped by location → category)
  function makeItems(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      statement: `Position ${i}`,
      isActive: true,
      locationName: i < 15 ? 'USA' : 'Canada',
      locationCode: i < 15 ? 'US' : 'CA',
      categoryName: i % 2 === 0 ? 'Politics' : 'Science',
      categoryId: i % 2 === 0 ? 'cat1' : 'cat2',
    }))
  }

  const defaultProps = {
    items: makeItems(30),
    onToggleActive: jest.fn(),
    onDeleteItems: jest.fn(),
    onBulkToggle: jest.fn(),
    onFloatingBarChange: jest.fn(),
  }

  test('location headers have expanded state and label with count', () => {
    render(<PositionListManager {...defaultProps} />)
    const usaHeader = screen.getByRole('button', { name: /locationGroupA11y.*USA.*15/ })
    expect(usaHeader).toBeTruthy()
    expect(usaHeader).toBeExpanded()
  })

  test('category headers have expanded state and label with count', () => {
    render(<PositionListManager {...defaultProps} />)
    // Under USA: 8 Politics (0,2,4,6,8,10,12,14), 7 Science (1,3,5,7,9,11,13)
    const politicsHeader = screen.getByRole('button', { name: /categoryGroupA11y.*Politics.*8/ })
    expect(politicsHeader).toBeTruthy()
    expect(politicsHeader).toBeExpanded()
  })
})

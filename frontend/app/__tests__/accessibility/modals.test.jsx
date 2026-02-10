import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Mock theme
const mockColors = {
  primary: '#5C005C', text: '#2C3842', title: '#5C005C',
  secondaryText: '#666666', placeholderText: '#999999', pass: '#CCCCCC',
  cardBackground: '#FFFFFF', cardBorder: '#E0E0E0', background: '#F5F5F5',
  badgeText: '#FFFFFF', buttonDefault: '#E0E0E0', buttonSelected: '#5C005C',
  buttonDefaultText: '#333', buttonSelectedText: '#FFF', badgeBg: '#E0E0E0',
  iconColor: '#888', iconColorFocused: '#5C005C', tabInactive: '#999',
  navBackground: '#FFF', chat: '#9B59B6', uiBackground: '#FFF',
  errorBannerBg: '#FDE8E8', darkText: '#2C3842',
  severityLowBg: '#E0E0E0', severityHighBg: '#FDE8E8', severityMediumBg: '#FFF3CD',
  severityLowText: '#666', severityMediumText: '#856404',
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
    user: { id: 'u1', displayName: 'TestUser', username: 'test', kudosCount: 5 },
    refreshUser: jest.fn(),
  }),
}))

jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext({
    user: { id: 'u1', displayName: 'TestUser', username: 'test', kudosCount: 5 },
    logout: jest.fn(),
    pendingChatRequest: null,
    clearPendingChatRequest: jest.fn(),
    positionsVersion: 0,
    isBanned: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  useFocusEffect: jest.fn(),
}))

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
    users: { getMyPositions: jest.fn(() => Promise.resolve([])), updatePosition: jest.fn(), deletePosition: jest.fn() },
    positions: { searchSimilar: jest.fn(() => Promise.resolve([])), create: jest.fn(), adopt: jest.fn() },
    moderation: { getRules: jest.fn(() => Promise.resolve([
      { id: 'r1', title: 'No Hate Speech', text: 'Do not use hateful language', severity: 'high' },
      { id: 'r2', title: 'Stay On Topic', text: 'Keep discussions relevant', severity: 'medium' },
    ])) },
    chattingList: { getList: jest.fn(() => Promise.resolve([])), addPosition: jest.fn(), toggleActive: jest.fn(), bulkRemove: jest.fn() },
  },
}))
jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(), remove: jest.fn(), invalidate: jest.fn() },
  CacheManager: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(), invalidate: jest.fn(), isStale: jest.fn(() => true) },
  CacheKeys: { userPositions: jest.fn(() => 'pos'), chattingList: jest.fn(() => 'chat') },
  CacheDurations: { POSITIONS: 300000, CHATTING_LIST: 300000 },
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
// ChatRequestIndicator is tested directly - not mocked
jest.mock('../../components/Sidebar', () => {
  const { View } = require('react-native')
  return () => <View testID="sidebar" />
})
jest.mock('../../components/LocationPicker', () => {
  const { View } = require('react-native')
  return () => <View testID="location-picker" />
})
jest.mock('../../components/LocationCategorySelector', () => {
  const { View } = require('react-native')
  return () => <View testID="location-category-selector" />
})
jest.mock('../../components/PositionListManager', () => {
  const React = require('react')
  const { View } = require('react-native')
  return React.forwardRef((props, ref) => <View testID="position-list-manager" />)
})
jest.mock('../../components/InfoModal', () => {
  const { View } = require('react-native')
  return () => <View testID="info-modal" />
})
jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return ({ children, visible }) => visible ? <View testID="bottom-drawer">{children}</View> : null
})
jest.mock('../../components/CardShell', () => {
  const { View } = require('react-native')
  return ({ children }) => <View testID="card-shell">{children}</View>
})
jest.mock('../../components/PositionInfoCard', () => {
  const { View } = require('react-native')
  return () => <View testID="position-info-card" />
})
jest.mock('../../constants/SharedStyles', () => ({
  createSharedStyles: () => ({
    modalOverlay: {},
    modalContent: {},
  }),
}))
jest.mock('react-native-svg', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props) => <View {...props} />,
    Circle: (props) => <View {...props} />,
    G: (props) => <View {...props} />,
  }
})

import ChatRequestIndicator from '../../components/ChatRequestIndicator'
import ReportModal from '../../components/ReportModal'
import ModerationActionModal from '../../components/ModerationActionModal'

describe('ChatRequestIndicator accessibility', () => {
  const pendingRequest = {
    status: 'pending',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    createdTime: new Date(Date.now() - 60000).toISOString(),
    positionStatement: 'Test position',
    author: { displayName: 'Alice', username: 'alice' },
    category: { label: 'Politics' },
    location: { name: 'USA' },
  }

  test('main touchable has label with user name', () => {
    render(<ChatRequestIndicator pendingRequest={pendingRequest} onTimeout={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('button', { name: /chat request.*pending.*alice/i })).toBeTruthy()
  })

  test('main touchable has hint about cancellation', () => {
    render(<ChatRequestIndicator pendingRequest={pendingRequest} onTimeout={jest.fn()} onCancel={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /alice/i })
    expect(btn.props.accessibilityHint).toMatch(/cancel/i)
  })

  test('declined request label reflects declined state', () => {
    const declined = { ...pendingRequest, status: 'declined' }
    render(<ChatRequestIndicator pendingRequest={declined} onTimeout={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('button', { name: /declined/i })).toBeTruthy()
  })
})

describe('ReportModal accessibility', () => {
  test('rule items have radio role', async () => {
    const { findAllByRole } = render(
      <ReportModal visible={true} onClose={jest.fn()} onSubmit={jest.fn()} />
    )
    const radios = await findAllByRole('radio')
    expect(radios.length).toBe(2) // 2 mock rules
  })

  test('rule items have accessible labels', async () => {
    const { findByRole } = render(
      <ReportModal visible={true} onClose={jest.fn()} onSubmit={jest.fn()} />
    )
    expect(await findByRole('radio', { name: 'No Hate Speech' })).toBeTruthy()
    expect(await findByRole('radio', { name: 'Stay On Topic' })).toBeTruthy()
  })

  test('submit button has label and disabled state', async () => {
    const { findByRole } = render(
      <ReportModal visible={true} onClose={jest.fn()} onSubmit={jest.fn()} />
    )
    const btn = await findByRole('button', { name: 'Submit Report' })
    expect(btn).toBeTruthy()
    expect(btn).toBeDisabled()
  })

  test('comment input has accessible label', async () => {
    const { findByLabelText } = render(
      <ReportModal visible={true} onClose={jest.fn()} onSubmit={jest.fn()} />
    )
    expect(await findByLabelText('Additional details')).toBeTruthy()
  })
})

describe('ModerationActionModal accessibility', () => {
  const rule = {
    id: 'r1',
    title: 'No Hate Speech',
    text: 'Do not use hateful language',
    severity: 'high',
    sentencingGuidelines: 'First offense: warning',
    defaultActions: [],
  }

  test('dropdown triggers have button role with current value', () => {
    render(
      <ModerationActionModal
        visible={true}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        reportType="position"
        rule={rule}
      />
    )
    // 3 position user classes: Creator, Active Adopters, Passive Adopters
    expect(screen.getByRole('button', { name: /Creator: None/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Active Adopters: None/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Passive Adopters: None/i })).toBeTruthy()
  })

  test('confirm button has label and disabled state', () => {
    render(
      <ModerationActionModal
        visible={true}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        reportType="position"
        rule={rule}
      />
    )
    const btn = screen.getByRole('button', { name: 'Confirm Action' })
    expect(btn).toBeTruthy()
    expect(btn).toBeDisabled()
  })

  test('moderator notes input has accessible label', () => {
    render(
      <ModerationActionModal
        visible={true}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        reportType="position"
        rule={rule}
      />
    )
    expect(screen.getByLabelText('Moderator notes')).toBeTruthy()
  })
})

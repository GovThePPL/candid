import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

// Mock UserContext values
const mockUserContext = {
  user: { id: 'u1', username: 'alice' },
  positionsVersion: 0,
  isBanned: false,
}
jest.mock('../../contexts/UserContext', () => ({
  UserContext: require('react').createContext(null),
}))

const { UserContext } = require('../../contexts/UserContext')

const mockCreate = jest.fn()
const mockGetMyPositions = jest.fn()
const mockGetRules = jest.fn()
const mockSearchSimilar = jest.fn()
const mockGetList = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {
    positions: {
      create: (...args) => mockCreate(...args),
      searchSimilar: (...args) => mockSearchSimilar(...args),
      adopt: jest.fn(),
    },
    users: {
      getMyPositions: (...args) => mockGetMyPositions(...args),
      updatePosition: jest.fn(),
      deletePosition: jest.fn(),
    },
    moderation: {
      getRules: (...args) => mockGetRules(...args),
    },
    chattingList: {
      getList: (...args) => mockGetList(...args),
      addPosition: jest.fn(),
      toggleActive: jest.fn(),
      bulkRemove: jest.fn(),
    },
  },
}))

jest.mock('../../lib/cache', () => ({
  CacheManager: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
    invalidate: jest.fn(() => Promise.resolve()),
    isStale: jest.fn(() => true),
    clearAll: jest.fn(() => Promise.resolve()),
  },
  CacheKeys: {
    userPositions: (id) => `positions:${id}`,
    chattingList: (id) => `chatting:${id}`,
  },
  CacheDurations: {
    POSITIONS: 300000,
    CHATTING_LIST: 300000,
  },
}))

// Mock heavy child components to keep tests focused
jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader() {
    return <Text>Header</Text>
  }
})

jest.mock('../../components/LocationCategorySelector', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  return function MockLocationCategorySelector({ onLocationChange, onCategoryChange }) {
    React.useEffect(() => {
      onLocationChange?.('loc-1')
      onCategoryChange?.('cat-1')
    }, [])
    return (
      <View>
        <Text>LocationCategorySelector</Text>
      </View>
    )
  }
})

jest.mock('../../components/PositionListManager', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return React.forwardRef(function MockPositionListManager(props, ref) {
    React.useImperativeHandle(ref, () => ({
      cancelDelete: jest.fn(),
      confirmDelete: jest.fn(),
    }))
    return <Text>PositionListManager</Text>
  })
})

jest.mock('../../components/InfoModal', () => {
  const { Text } = require('react-native')
  return function MockInfoModal({ visible }) {
    return visible ? <Text>InfoModal</Text> : null
  }
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View, Text } = require('react-native')
  return function MockBottomDrawerModal({ visible, children, title }) {
    return visible ? <View><Text>{title}</Text>{children}</View> : null
  }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title }) {
    return <Text>{title}</Text>
  }
})

// Mock useFocusEffect to call the callback via useEffect
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  useFocusEffect: (cb) => {
    const React = require('react')
    React.useEffect(() => { cb() }, [])
  },
  Link: 'Link',
  Stack: { Screen: 'Screen' },
}))

import Create from '../../app/(dashboard)/create'

function renderCreate(contextOverrides = {}) {
  const contextValue = { ...mockUserContext, ...contextOverrides }
  // Suppress act() warnings from async effects — these are expected in smoke tests
  const errSpy = jest.spyOn(console, 'error').mockImplementation((msg) => {
    if (typeof msg === 'string' && msg.includes('not wrapped in act')) return
    // eslint-disable-next-line no-console
    console.error(msg)
  })
  const result = render(
    <UserContext.Provider value={contextValue}>
      <Create />
    </UserContext.Provider>
  )
  // Restore spy after initial render; async updates may still log later
  errSpy.mockRestore()
  return result
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetMyPositions.mockResolvedValue([])
  mockGetList.mockResolvedValue([])
  mockCreate.mockResolvedValue()
  mockGetRules.mockResolvedValue([])
  mockSearchSimilar.mockResolvedValue([])
})

describe('Create screen', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('shows character count', () => {
    renderCreate()
    expect(screen.getByText('charsRemaining 140')).toBeTruthy()
  })

  it('updates character count as user types', () => {
    renderCreate()
    fireEvent.changeText(screen.getByPlaceholderText('positionPlaceholder'), 'Hello world')
    // 140 - 11 = 129
    expect(screen.getByText('charsRemaining 129')).toBeTruthy()
  })

  it('disables submit button when statement is empty', () => {
    renderCreate()
    // The button parent (ThemedButton/TouchableOpacity) should be disabled
    const button = screen.getByText('createPosition')
    // With empty statement, the create API should never be called
    fireEvent.press(button)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls API to create position on valid submit', async () => {
    renderCreate()

    fireEvent.changeText(screen.getByPlaceholderText('positionPlaceholder'), 'My position statement')

    await act(async () => {
      fireEvent.press(screen.getByText('createPosition'))
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('My position statement', 'cat-1', 'loc-1')
    })
  })

  it('shows banned state when user is banned', () => {
    renderCreate({ isBanned: true })
    expect(screen.getByText('bannedTitle')).toBeTruthy()
    expect(screen.queryByPlaceholderText('positionPlaceholder')).toBeNull()
  })

  it('renders my positions section', () => {
    renderCreate()
    expect(screen.getByText('myPositions')).toBeTruthy()
  })

  it('renders chatting list section', () => {
    renderCreate()
    expect(screen.getByText('chattingList')).toBeTruthy()
  })
})

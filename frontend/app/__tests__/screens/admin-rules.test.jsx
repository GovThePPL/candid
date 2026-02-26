import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockUser = {
  id: 'u1',
  username: 'admin1',
  displayName: 'Admin 1',
  roles: [
    { role: 'admin', locationId: 'loc1', sessionId: null, locationName: 'United States' },
  ],
}
const mockUserState = { user: mockUser }
jest.mock('../../hooks/useUser', () => ({
  useUser: () => mockUserState,
}))

const mockGetAdminRules = jest.fn()
const mockGetAllLocations = jest.fn()
const mockGetAllSessions = jest.fn()
const mockCreateRuleRequest = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {
    admin: {
      getAdminRules: (...args) => mockGetAdminRules(...args),
      getAllSessions: (...args) => mockGetAllSessions(...args),
      createRuleRequest: (...args) => mockCreateRuleRequest(...args),
    },
    users: {
      getAllLocations: (...args) => mockGetAllLocations(...args),
    },
  },
}))

jest.mock('../../lib/roles', () => ({
  getHighestRole: () => 'admin',
  canManageRuleScope: () => true,
  getDescendantLocationIds: (locationId, allLocations) => {
    const result = new Set([locationId])
    const queue = [locationId]
    while (queue.length > 0) {
      const current = queue.shift()
      for (const loc of allLocations) {
        if (loc.parentLocationId === current && !result.has(loc.id)) {
          result.add(loc.id)
          queue.push(loc.id)
        }
      }
    }
    return result
  },
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader() {
    return <Text>Header</Text>
  }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title, subtitle }) {
    return <Text>{title} {subtitle}</Text>
  }
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return function MockModal({ children, visible }) {
    return visible ? <View>{children}</View> : null
  }
})

jest.mock('../../components/LocationPicker', () => {
  const { View } = require('react-native')
  return function MockLocationPicker({ visible }) {
    return visible ? <View testID="location-picker" /> : null
  }
})

const mockToast = jest.fn()
jest.mock('../../components/Toast', () => ({
  useToast: () => mockToast,
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

import RulesScreen from '../../app/(dashboard)/admin/rules'

const makeRule = (id, overrides = {}) => ({
  id,
  title: `Rule ${id}`,
  text: `Description for rule ${id}`,
  severity: 3,
  status: 'active',
  applicableContentTypes: ['position', 'chat_log', 'post', 'comment'],
  locationId: null,
  sessionId: null,
  locationName: null,
  sessionLabel: null,
  sentencingGuidelines: null,
  defaultActions: null,
  ...overrides,
})

const testLocations = [
  { id: 'loc1', name: 'United States', code: 'US', parentLocationId: null },
  { id: 'loc2', name: 'Oregon', code: 'OR', parentLocationId: 'loc1' },
  { id: 'loc3', name: 'California', code: 'CA', parentLocationId: 'loc1' },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAdminRules.mockResolvedValue([])
  mockGetAllLocations.mockResolvedValue(testLocations)
  mockGetAllSessions.mockResolvedValue([])
})

describe('Admin Rules screen', () => {
  it('renders page title and create button', async () => {
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('rulesTitle')).toBeTruthy()
      expect(screen.getByText('createRule')).toBeTruthy()
    })
  })

  it('shows empty state when no rules and no locations', async () => {
    mockGetAllLocations.mockResolvedValue([])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText(/noRulesFound/)).toBeTruthy()
    })
  })

  it('fetches rules, locations, and sessions on mount', async () => {
    render(<RulesScreen />)

    await waitFor(() => {
      expect(mockGetAdminRules).toHaveBeenCalled()
      expect(mockGetAllLocations).toHaveBeenCalled()
      expect(mockGetAllSessions).toHaveBeenCalled()
    })
  })

  it('renders global rules section when global rules exist', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { title: 'Global Rule 1' }),
      makeRule('r2', { title: 'Global Rule 2' }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('ruleLocationGlobal')).toBeTruthy()
      expect(screen.getByText('Global Rule 1')).toBeTruthy()
      expect(screen.getByText('Global Rule 2')).toBeTruthy()
    })
  })

  it('renders location tree with root locations', async () => {
    mockGetAdminRules.mockResolvedValue([])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('United States')).toBeTruthy()
    })
  })

  it('shows rule cards with severity badges', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { title: 'Test Rule', severity: 4 }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('Test Rule')).toBeTruthy()
      expect(screen.getByText('severity4')).toBeTruthy()
    })
  })

  it('shows inactive badge for inactive rules', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { title: 'Inactive Rule', status: 'inactive' }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('Inactive Rule')).toBeTruthy()
      expect(screen.getByText('ruleStatusInactive')).toBeTruthy()
    })
  })

  it('shows content type chips when not all types selected', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { applicableContentTypes: ['position'] }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('contentTypePosition')).toBeTruthy()
    })
  })

  it('hides content type chips when all 4 types are selected', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { applicableContentTypes: ['position', 'chat_log', 'post', 'comment'] }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText(makeRule('r1').title)).toBeTruthy()
    })
    // All 4 content types should not show chips
    expect(screen.queryByText('contentTypePosition')).toBeNull()
  })

  it('opens create modal when create button is pressed', async () => {
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('createRule')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('createRule'))

    await waitFor(() => {
      expect(screen.getByText('requestCreate')).toBeTruthy()
    })
  })

  it('shows session chip on rule card when session exists', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { sessionLabel: 'Healthcare' }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      expect(screen.getByText('Healthcare')).toBeTruthy()
    })
  })

  it('shows location-scoped rules under the correct location when expanded', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { locationId: 'loc1', title: 'US-scoped Rule' }),
    ])
    render(<RulesScreen />)

    // The user's location (loc1) should be auto-expanded
    await waitFor(() => {
      expect(screen.getByText('US-scoped Rule')).toBeTruthy()
    })
  })

  it('create button has correct accessibility role', async () => {
    render(<RulesScreen />)

    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('submits create request with correct body', async () => {
    mockCreateRuleRequest.mockResolvedValue({ id: 'req1', status: 'pending' })
    render(<RulesScreen />)

    await waitFor(() => expect(screen.getByText('createRule')).toBeTruthy())

    // Open create modal
    fireEvent.press(screen.getByText('createRule'))

    await waitFor(() => expect(screen.getByText('requestCreate')).toBeTruthy())

    // Fill title
    const titleInput = screen.getByLabelText('ruleTitleA11y')
    fireEvent.changeText(titleInput, 'New Rule')

    // Fill description
    const descInput = screen.getByLabelText('ruleDescriptionA11y')
    fireEvent.changeText(descInput, 'New rule description')

    // Submit
    fireEvent.press(screen.getByText('requestCreate'))

    await waitFor(() => {
      expect(mockCreateRuleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          proposedRule: expect.objectContaining({
            title: 'New Rule',
            text: 'New rule description',
            severity: 3,
          }),
        })
      )
    })
  })

  it('shows rule count badge on location headers', async () => {
    mockGetAdminRules.mockResolvedValue([
      makeRule('r1', { locationId: 'loc1' }),
      makeRule('r2', { locationId: 'loc1' }),
    ])
    render(<RulesScreen />)

    await waitFor(() => {
      // The count badge should show "2"
      expect(screen.getByText('2')).toBeTruthy()
    })
  })
})

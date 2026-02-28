import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockAdminUser = {
  id: 'u1', username: 'admin1', displayName: 'Admin 1',
  roles: [{ role: 'admin', locationId: 'loc1', sessionId: null, locationName: 'United States' }],
}
const mockFacilitatorUser = {
  id: 'u2', username: 'facil1', displayName: 'Facilitator 1',
  roles: [{ role: 'facilitator', locationId: 'loc1', sessionId: 'sess1', locationName: 'United States' }],
}
let mockUserRef = { user: mockAdminUser }
jest.mock('../../hooks/useUser', () => ({
  useUser: () => mockUserRef,
}))

const mockSessions = [
  {
    id: 'sess1', label: 'Healthcare Access', locationId: 'loc1',
    locationCode: 'US', locationName: 'United States', stage: 'proposal_qualify',
    status: 'active', proposalMethod: 'user_driven',
  },
  {
    id: 'sess2', label: 'Education Reform', locationId: 'loc2',
    locationCode: 'OR', locationName: 'Oregon', stage: 'consensus',
    status: 'active', proposalMethod: 'admin_provided',
  },
  {
    id: 'sess3', label: 'Transit Planning', locationId: 'loc1',
    locationCode: 'US', locationName: 'United States', stage: 'opinion_discussion',
    status: 'active', proposalMethod: 'user_driven',
  },
  {
    id: 'sess4', label: 'Archived Policy', locationId: 'loc1',
    locationCode: 'US', locationName: 'United States', stage: 'proposal_qualify',
    status: 'archived', proposalMethod: 'user_driven',
  },
]

const mockLocations = [
  { id: 'loc1', name: 'United States', code: 'US' },
  { id: 'loc2', name: 'Oregon', code: 'OR', parentLocationId: 'loc1' },
]

const mockFetchSessions = jest.fn()
const mockHandleCreateSession = jest.fn()
const mockResetCreateForm = jest.fn()

jest.mock('../../hooks/useAdminSessions', () => ({
  __esModule: true,
  default: () => ({
    sessions: mockSessions,
    loading: false,
    locations: mockLocations,
    sessionLabelSurveys: {},
    fetchSessions: mockFetchSessions,
    createVisible: false, setCreateVisible: jest.fn(),
    newLabel: '', setNewLabel: jest.fn(),
    newLocationId: null, setNewLocationId: jest.fn(),
    newProposalMethod: 'user_driven', setNewProposalMethod: jest.fn(),
    createLabelSurvey: true, setCreateLabelSurvey: jest.fn(),
    labelSurveyItems: ['', ''], setLabelSurveyItems: jest.fn(),
    labelSurveyComparisonQuestion: '', setLabelSurveyComparisonQuestion: jest.fn(),
    creating: false, handleCreateSession: mockHandleCreateSession,
    resetCreateForm: mockResetCreateForm,
    fetchSessionRoles: jest.fn(),
    fetchSessionLabelSurvey: jest.fn(),
    handleAdvanceStage: jest.fn(),
    inlineLabelPhase: null, setInlineLabelPhase: jest.fn(),
    inlineLabelItems: ['', ''], setInlineLabelItems: jest.fn(),
    inlineLabelComparison: '', setInlineLabelComparison: jest.fn(),
    inlineLabelCreating: false,
    handleCreateLabelSurvey: jest.fn(), handleDeleteLabelSurvey: jest.fn(),
    resetInlineLabelForm: jest.fn(),
    proposals: [{ title: '', body: '' }, { title: '', body: '' }], setProposals: jest.fn(),
  }),
}))

jest.mock('../../lib/roles', () => ({
  hasRole: (user, role) => {
    if (!user?.roles) return false
    return user.roles.some(r => r.role === role || r.role === 'admin')
  },
  ROLE_LABEL_KEYS: {
    admin: 'roleAdmin', facilitator: 'roleFacilitator',
    expert: 'roleExpert', liaison: 'roleLiaison',
    assistant_moderator: 'roleAssistantModerator',
  },
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader() { return <Text>Header</Text> }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title, subtitle }) { return <Text>{title} {subtitle}</Text> }
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return function MockModal({ children, visible }) { return visible ? <View>{children}</View> : null }
})

jest.mock('../../components/LocationSessionBadge', () => {
  const { Text } = require('react-native')
  return function MockBadge({ location, session }) {
    return <Text>{location?.code || 'No location'} {session?.label || ''}</Text>
  }
})

jest.mock('../../components/SessionProgressBar', () => {
  const { Text } = require('react-native')
  return function MockProgressBar({ stage }) {
    return <Text>Stage: {stage}</Text>
  }
})

jest.mock('../../components/LocationFilterButton', () => {
  const { Text, TouchableOpacity } = require('react-native')
  return function MockLocationFilterButton({ onSelect, allLocations, selectedLocationId }) {
    return (
      <TouchableOpacity
        testID="location-filter-button"
        onPress={() => onSelect(allLocations[0]?.id)}
        accessibilityRole="button"
      >
        <Text>{selectedLocationId ? `Filtered: ${selectedLocationId}` : 'selectLocation'}</Text>
      </TouchableOpacity>
    )
  }
})

jest.mock('../../components/LocationPicker', () => { return function() { return null } })
jest.mock('../../components/Toast', () => ({ useToast: () => jest.fn() }))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {},
}))

import AdminSessionsScreen from '../../app/(dashboard)/admin/sessions/index'

beforeEach(() => {
  jest.clearAllMocks()
  mockUserRef = { user: mockAdminUser }
})

describe('Admin Sessions screen', () => {
  it('renders page title', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('sessionsTitle')).toBeTruthy()
  })

  it('shows create button for admin users', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('createNewSession')).toBeTruthy()
  })

  it('displays active session cards', () => {
    render(<AdminSessionsScreen />)
    // Session labels rendered via LocationSessionBadge mock
    expect(screen.getByText(/Healthcare Access/)).toBeTruthy()
    expect(screen.getByText(/Transit Planning/)).toBeTruthy()
  })

  it('does not show advance stage button', () => {
    render(<AdminSessionsScreen />)
    expect(screen.queryByText('advanceStage')).toBeNull()
  })

  it('shows proposal method badges', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getAllByText('proposalMethodUserDriven').length).toBeGreaterThanOrEqual(1)
  })

  it('shows stage progress bars', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('Stage: proposal_qualify')).toBeTruthy()
    expect(screen.getByText('Stage: opinion_discussion')).toBeTruthy()
  })

  it('shows manage button for each active session', () => {
    render(<AdminSessionsScreen />)
    // 2 active sessions visible by default (completed is collapsed)
    const manageButtons = screen.getAllByText('manageSession')
    expect(manageButtons.length).toBe(2)
  })

  it('calls fetchSessions on mount', () => {
    render(<AdminSessionsScreen />)
    expect(mockFetchSessions).toHaveBeenCalled()
  })

  it('navigates to detail page when manage button is pressed', () => {
    render(<AdminSessionsScreen />)
    const manageButtons = screen.getAllByText('manageSession')
    fireEvent.press(manageButtons[0])
    expect(mockPush).toHaveBeenCalledWith('/admin/sessions/sess1')
  })

  it('interactive elements have accessibilityRole button', () => {
    render(<AdminSessionsScreen />)
    const buttons = screen.getAllByRole('button')
    // create + manage x2 + location filter + completed header = at least 4
    expect(buttons.length).toBeGreaterThanOrEqual(4)
  })

  it('hides create button for facilitator users', () => {
    mockUserRef = { user: mockFacilitatorUser }
    render(<AdminSessionsScreen />)
    expect(screen.queryByText('createNewSession')).toBeNull()
  })

  it('facilitator only sees sessions they have a role for', () => {
    mockUserRef = { user: mockFacilitatorUser }
    render(<AdminSessionsScreen />)
    // Facilitator has role for sess1 (Healthcare), not sess2 or sess3
    expect(screen.getByText(/Healthcare Access/)).toBeTruthy()
    expect(screen.queryByText(/Education Reform/)).toBeNull()
    expect(screen.queryByText(/Transit Planning/)).toBeNull()
  })

  describe('completed sessions section', () => {
    it('shows completed section header with count', () => {
      render(<AdminSessionsScreen />)
      // 2 completed: consensus session + archived session
      expect(screen.getByText('completedSessionsCount 2')).toBeTruthy()
    })

    it('hides completed session cards by default', () => {
      render(<AdminSessionsScreen />)
      // Education Reform is at consensus (completed) and section is collapsed
      expect(screen.queryByText(/Education Reform/)).toBeNull()
      expect(screen.queryByText(/Archived Policy/)).toBeNull()
    })

    it('reveals completed session cards when header is pressed', () => {
      render(<AdminSessionsScreen />)
      const header = screen.getByText('completedSessionsCount 2')
      fireEvent.press(header)
      expect(screen.getByText(/Education Reform/)).toBeTruthy()
      expect(screen.getByText(/Archived Policy/)).toBeTruthy()
    })

    it('collapses completed section on second press', () => {
      render(<AdminSessionsScreen />)
      const header = screen.getByText('completedSessionsCount 2')
      fireEvent.press(header) // expand
      fireEvent.press(header) // collapse
      expect(screen.queryByText(/Education Reform/)).toBeNull()
    })
  })

  describe('archived sessions', () => {
    it('shows archived badge on archived sessions', () => {
      render(<AdminSessionsScreen />)
      const header = screen.getByText('completedSessionsCount 2')
      fireEvent.press(header) // expand completed section
      expect(screen.getByText('statusArchived')).toBeTruthy()
    })

    it('does not show archived sessions in active section', () => {
      render(<AdminSessionsScreen />)
      // Archived Policy should not appear in active section
      expect(screen.queryByText(/Archived Policy/)).toBeNull()
    })
  })

  describe('location filter', () => {
    it('renders location filter button', () => {
      render(<AdminSessionsScreen />)
      expect(screen.getByTestId('location-filter-button')).toBeTruthy()
    })

    it('filters sessions by location when filter is applied', () => {
      render(<AdminSessionsScreen />)
      const filterButton = screen.getByTestId('location-filter-button')
      fireEvent.press(filterButton) // selects loc1 (United States)
      // Healthcare Access (loc1) and Transit Planning (loc1) should remain visible
      expect(screen.getByText(/Healthcare Access/)).toBeTruthy()
      expect(screen.getByText(/Transit Planning/)).toBeTruthy()
    })

    it('shows clear button when filter is active', () => {
      render(<AdminSessionsScreen />)
      const filterButton = screen.getByTestId('location-filter-button')
      fireEvent.press(filterButton) // selects loc1
      expect(screen.getByLabelText('clearLocationFilterA11y')).toBeTruthy()
    })
  })
})

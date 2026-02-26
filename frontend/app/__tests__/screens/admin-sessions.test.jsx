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
]

const mockLocations = [{ id: 'loc1', name: 'United States', code: 'US' }]

const mockFetchSessions = jest.fn()
const mockHandleAdvanceStage = jest.fn()
const mockHandleCreateSession = jest.fn()
const mockResetCreateForm = jest.fn()

jest.mock('../../hooks/useAdminSessions', () => ({
  __esModule: true,
  getNextStage: (stage) => {
    const order = ['proposal_issue', 'proposal_qualify', 'proposal_stakeholders', 'opinion_discussion', 'opinion_curation', 'opinion_proposals', 'reflection', 'consensus']
    const idx = order.indexOf(stage)
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  },
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
    handleAdvanceStage: mockHandleAdvanceStage,
    inlineLabelPhase: null, setInlineLabelPhase: jest.fn(),
    inlineLabelItems: ['', ''], setInlineLabelItems: jest.fn(),
    inlineLabelComparison: '', setInlineLabelComparison: jest.fn(),
    inlineLabelCreating: false,
    handleCreateLabelSurvey: jest.fn(), handleDeleteLabelSurvey: jest.fn(),
    resetInlineLabelForm: jest.fn(),
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
  return function MockBadge({ location }) { return <Text>{location?.code || 'No location'}</Text> }
})

jest.mock('../../components/SessionProgressBar', () => {
  const { Text } = require('react-native')
  return function MockProgressBar({ stage, showStageLabel }) {
    return <Text>Stage: {stage}</Text>
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

  it('displays session cards with labels', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('Healthcare Access')).toBeTruthy()
    expect(screen.getByText('Education Reform')).toBeTruthy()
  })

  it('shows proposal method badges', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('proposalMethodUserDriven')).toBeTruthy()
    expect(screen.getByText('proposalMethodAdminProvided')).toBeTruthy()
  })

  it('shows stage progress bars', () => {
    render(<AdminSessionsScreen />)
    expect(screen.getByText('Stage: proposal_qualify')).toBeTruthy()
    expect(screen.getByText('Stage: consensus')).toBeTruthy()
  })

  it('shows advance button for sessions with a next stage (not at consensus)', () => {
    render(<AdminSessionsScreen />)
    // Healthcare is at proposal_qualify (has next stage), Education is at consensus (no next)
    const advanceButtons = screen.getAllByText('advanceStage')
    expect(advanceButtons.length).toBe(1) // Only Healthcare
  })

  it('shows manage button for each session', () => {
    render(<AdminSessionsScreen />)
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

  it('calls handleAdvanceStage when advance button is pressed', () => {
    render(<AdminSessionsScreen />)
    const advanceButton = screen.getByText('advanceStage')
    fireEvent.press(advanceButton)
    expect(mockHandleAdvanceStage).toHaveBeenCalledWith(mockSessions[0])
  })

  it('interactive elements have accessibilityRole button', () => {
    render(<AdminSessionsScreen />)
    const buttons = screen.getAllByRole('button')
    // create + manage x2 + advance x1 = at least 4
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
    // Facilitator has role for sess1 (Healthcare), not sess2 (Education)
    expect(screen.getByText('Healthcare Access')).toBeTruthy()
    expect(screen.queryByText('Education Reform')).toBeNull()
  })

  it('facilitator still sees advance button for their sessions', () => {
    mockUserRef = { user: mockFacilitatorUser }
    render(<AdminSessionsScreen />)
    // Healthcare is at proposal_qualify (has next stage) and facilitator can manage
    const advanceButtons = screen.getAllByText('advanceStage')
    expect(advanceButtons.length).toBe(1)
  })
})

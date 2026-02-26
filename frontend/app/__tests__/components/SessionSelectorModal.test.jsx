import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../hooks/useIsDesktop', () => ({
  __esModule: true,
  default: () => false,
}))

jest.mock('../../components/LocationSessionBadge', () => {
  const { Text } = require('react-native')
  return function MockLocationSessionBadge({ location, session }) {
    return <Text>{location?.code} {session?.label}</Text>
  }
})

jest.mock('../../components/SessionProgressBar', () => {
  const { View, Text } = require('react-native')
  return function MockSessionProgressBar({ stage }) {
    return <View testID="progress-bar"><Text>{stage}</Text></View>
  }
})

const mockSetSelectedLocation = jest.fn()
const mockSetSelectedSession = jest.fn()
const mockCloseSessionSelector = jest.fn()
let mockSelectedSession = 'sess-1'

jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => ({
    selectedLocation: 'loc-1',
    selectedSession: mockSelectedSession,
    setSelectedLocation: mockSetSelectedLocation,
    setSelectedSession: mockSetSelectedSession,
    closeSessionSelector: mockCloseSessionSelector,
  }),
}))

const mockGetLocations = jest.fn()
const mockGetSessions = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  usersApiWrapper: {
    getLocations: (...args) => mockGetLocations(...args),
  },
  sessionsApiWrapper: {
    getAll: (...args) => mockGetSessions(...args),
  },
}))

import SessionSelectorModal from '../../components/SessionSelectorModal'

const sampleLocations = [
  { id: 'loc-1', name: 'United States', code: 'US', parentLocationId: null },
  { id: 'loc-2', name: 'Oregon', code: 'OR', parentLocationId: 'loc-1' },
]

const usSessions = [
  { id: 'sess-1', label: 'Healthcare', status: 'active', stage: 'opinion_discussion' },
  { id: 'sess-2', label: 'Education', status: 'archived', stage: 'consensus' },
]

const orSessions = [
  { id: 'sess-3', label: 'Housing', status: 'active', stage: 'proposal_issue' },
  { id: 'sess-4', label: 'Old Topic', status: 'cancelled', stage: 'consensus' },
]

describe('SessionSelectorModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSelectedSession = 'sess-1'
    mockGetLocations.mockResolvedValue(sampleLocations)
    mockGetSessions.mockImplementation((locId) => {
      if (locId === 'loc-1') return Promise.resolve(usSessions)
      if (locId === 'loc-2') return Promise.resolve(orSessions)
      return Promise.resolve([])
    })
  })

  it('renders location sections from mock data', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('United States (US)')).toBeTruthy()
      expect(screen.getByText('Oregon (OR)')).toBeTruthy()
    })
  })

  it('shows active sessions with LocationSessionBadge', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      // LocationSessionBadge mock renders "CODE label"
      expect(screen.getByText('US Healthcare')).toBeTruthy()
      expect(screen.getByText('OR Housing')).toBeTruthy()
    })
  })

  it('renders progress bars for active sessions', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('US Healthcare')).toBeTruthy()
    })

    // Progress bar mock renders the stage text
    expect(screen.getByText('opinion_discussion')).toBeTruthy()
    expect(screen.getByText('proposal_issue')).toBeTruthy()
  })

  it('hides past sessions by default', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('US Healthcare')).toBeTruthy()
    })

    // Past sessions should not be visible
    expect(screen.queryByText('US Education')).toBeNull()
    expect(screen.queryByText('OR Old Topic')).toBeNull()
  })

  it('expands past sessions on toggle press', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('US Healthcare')).toBeTruthy()
    })

    // Find and press the "Show past sessions" toggle for US (has 1 past session)
    const toggleButtons = screen.getAllByLabelText('sessionSelectorShowPast')
    fireEvent.press(toggleButtons[0])

    await waitFor(() => {
      expect(screen.getByText('US Education')).toBeTruthy()
    })
  })

  it('calls setSelectedSession + setSelectedLocation + closeSessionSelector on session press', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Housing')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Housing'))

    expect(mockSetSelectedLocation).toHaveBeenCalledWith('loc-2')
    expect(mockSetSelectedSession).toHaveBeenCalledWith('sess-3')
    expect(mockCloseSessionSelector).toHaveBeenCalled()
  })

  it('shows empty state when no sessions', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('sessionSelectorNoSessions')).toBeTruthy()
      expect(screen.getByText('sessionSelectorNoSessionsSubtitle')).toBeTruthy()
    })
  })

  it('highlights currently selected session', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Healthcare')).toBeTruthy()
    })

    const healthcareItem = screen.getByLabelText('Healthcare')
    expect(healthcareItem.props.accessibilityState).toEqual({ selected: true })
  })

  it('does not render when not visible', () => {
    render(<SessionSelectorModal visible={false} onClose={jest.fn()} />)

    expect(screen.queryByText('sessionSelectorTitle')).toBeNull()
  })

  it('shows title and close button', async () => {
    render(<SessionSelectorModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('sessionSelectorTitle')).toBeTruthy()
    })
    expect(screen.getByLabelText('close')).toBeTruthy()
  })

  it('calls onClose when close button pressed', async () => {
    const onClose = jest.fn()
    render(<SessionSelectorModal visible={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByLabelText('close')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('close'))
    expect(onClose).toHaveBeenCalled()
  })
})

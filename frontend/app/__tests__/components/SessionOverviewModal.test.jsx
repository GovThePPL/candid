import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../components/LocationSessionBadge', () => {
  const { Text } = require('react-native')
  return function MockBadge({ location, session }) {
    return <Text>{location?.code} {session?.label}</Text>
  }
})

const mockRefreshSessionData = jest.fn()
const mockSetViewingStage = jest.fn()
const mockCloseSessionOverview = jest.fn()
let mockSessionOverviewVisible = false
let mockViewingStage = null
const mockSessionData = {
  stage: 'opinion_discussion',
  proposalMethod: 'user_driven',
  locationCode: 'US',
  locationName: 'United States',
  label: 'Healthcare',
}

jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => ({
    sessionData: mockSessionData,
    currentStage: 'opinion_discussion',
    viewingStage: mockViewingStage,
    sessionOverviewVisible: mockSessionOverviewVisible,
    closeSessionOverview: mockCloseSessionOverview,
    setViewingStage: mockSetViewingStage,
    acceptedProposal: null,
    openProposalModal: jest.fn(),
    votingRound: null,
    openSessionSelector: jest.fn(),
    refreshSessionData: mockRefreshSessionData,
  }),
}))

import SessionOverviewModal from '../../components/SessionOverviewModal'

describe('SessionOverviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSessionOverviewVisible = false
    mockViewingStage = null
  })

  it('calls refreshSessionData with silent option when modal becomes visible', async () => {
    mockSessionOverviewVisible = true

    render(<SessionOverviewModal />)

    await waitFor(() => {
      expect(mockRefreshSessionData).toHaveBeenCalledWith({ silent: true })
    })
  })

  it('does not call refreshSessionData when modal is not visible', () => {
    mockSessionOverviewVisible = false

    render(<SessionOverviewModal />)

    expect(mockRefreshSessionData).not.toHaveBeenCalled()
  })

  it('shows "Return to Current Stage" button when viewing archived stage', () => {
    mockSessionOverviewVisible = true
    mockViewingStage = 'proposal_issue'

    render(<SessionOverviewModal />)

    expect(screen.getByText('sessionOverviewReturnCurrent')).toBeTruthy()
  })

  it('does not show "Return to Current Stage" button when not viewing archived', () => {
    mockSessionOverviewVisible = true
    mockViewingStage = null

    render(<SessionOverviewModal />)

    expect(screen.queryByText('sessionOverviewReturnCurrent')).toBeNull()
  })

  it('clears viewingStage and closes modal when return button is pressed', () => {
    mockSessionOverviewVisible = true
    mockViewingStage = 'proposal_issue'

    render(<SessionOverviewModal />)

    const returnElements = screen.getAllByLabelText('sessionOverviewReturnCurrentA11y')
    // Press the standalone button (last element)
    fireEvent.press(returnElements[returnElements.length - 1])

    expect(mockSetViewingStage).toHaveBeenCalledWith(null)
    expect(mockCloseSessionOverview).toHaveBeenCalled()
  })

  it('shows "Viewing" badge on the phase containing viewingStage', () => {
    mockSessionOverviewVisible = true
    mockViewingStage = 'proposal_issue'

    render(<SessionOverviewModal />)

    expect(screen.getByText('sessionOverviewViewingStage')).toBeTruthy()
  })

  it('does not show "Viewing" badge when viewingStage is null', () => {
    mockSessionOverviewVisible = true
    mockViewingStage = null

    render(<SessionOverviewModal />)

    expect(screen.queryByText('sessionOverviewViewingStage')).toBeNull()
  })
})

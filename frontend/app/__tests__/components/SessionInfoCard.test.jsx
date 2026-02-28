import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

let mockSessionContext = {}
jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => mockSessionContext,
}))

jest.mock('../../components/LocationSessionBadge', () => {
  const { Text } = require('react-native')
  return function MockLocationSessionBadge({ location, session }) {
    return <Text>{location?.code} {session?.label}</Text>
  }
})

import SessionInfoCard from '../../components/SessionInfoCard'

describe('SessionInfoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSessionContext = {
      sessionData: null,
      sessionLoading: false,
      selectedSession: null,
      currentStage: null,
      effectiveStage: null,
      viewingStage: null,
      openSessionOverview: jest.fn(),
    }
  })

  it('renders nothing when sessionData is null', () => {
    const { toJSON } = render(<SessionInfoCard />)
    expect(toJSON()).toBeNull()
  })

  it('shows current stage phase and action', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', locationCode: 'US', locationName: 'United States' },
      currentStage: 'opinion_discussion',
      effectiveStage: 'opinion_discussion',
      selectedSession: 'sess-1',
    }

    render(<SessionInfoCard />)

    expect(screen.getByText(/phaseOpinion/)).toBeTruthy()
    expect(screen.getByText('stageActionOpinionDiscussion')).toBeTruthy()
  })

  it('shows archived stage phase and action when viewing archived stage', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', locationCode: 'US', locationName: 'United States' },
      currentStage: 'reflection_curation',
      effectiveStage: 'proposal_issue',
      viewingStage: 'proposal_issue',
      selectedSession: 'sess-1',
    }

    render(<SessionInfoCard />)

    // Should show the archived stage's phase and action, not the current stage
    expect(screen.getByText(/phaseProposal/)).toBeTruthy()
    expect(screen.getByText('stageActionProposalIssue')).toBeTruthy()
    // Should NOT show the current stage's action
    expect(screen.queryByText('stageActionReflectionCuration')).toBeNull()
  })

  it('shows archived indicator pill when viewing archived stage', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', locationCode: 'US', locationName: 'United States' },
      currentStage: 'opinion_discussion',
      effectiveStage: 'proposal_issue',
      viewingStage: 'proposal_issue',
      selectedSession: 'sess-1',
    }

    render(<SessionInfoCard />)

    expect(screen.getByText('stageArchiveViewing')).toBeTruthy()
  })

  it('does not show archived indicator when viewing current stage', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', locationCode: 'US', locationName: 'United States' },
      currentStage: 'opinion_discussion',
      effectiveStage: 'opinion_discussion',
      viewingStage: null,
      selectedSession: 'sess-1',
    }

    render(<SessionInfoCard />)

    expect(screen.queryByText('stageArchiveViewing')).toBeNull()
  })

  it('calls openSessionOverview on press', () => {
    const mockOpen = jest.fn()
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', locationCode: 'US', locationName: 'United States' },
      currentStage: 'opinion_discussion',
      effectiveStage: 'opinion_discussion',
      selectedSession: 'sess-1',
      openSessionOverview: mockOpen,
    }

    render(<SessionInfoCard />)

    fireEvent.press(screen.getByLabelText('sessionInfoA11y'))
    expect(mockOpen).toHaveBeenCalledTimes(1)
  })
})

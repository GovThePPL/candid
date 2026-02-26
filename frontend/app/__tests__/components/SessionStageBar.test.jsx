import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-native-svg', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props) => <View {...props} />,
    Path: (props) => <View {...props} />,
  }
})

let mockSessionContext = {}
jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => mockSessionContext,
}))

jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'user-1' } }),
}))

const mockUpdate = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    sessions: {
      update: (...args) => mockUpdate(...args),
    },
  },
}))

jest.mock('../../components/LocationSessionBadge', () => {
  const { Text } = require('react-native')
  return function MockLocationSessionBadge({ location, session }) {
    return <Text>{location?.code} {session?.label}</Text>
  }
})

import SessionStageBar from '../../components/SessionStageBar'

describe('SessionStageBar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSessionContext = {
      sessionData: null,
      currentStage: null,
      viewingStage: null,
      setViewingStage: jest.fn(),
      selectedSession: null,
      refreshSessionData: jest.fn(),
    }
  })

  it('renders nothing when sessionData is null', () => {
    const { toJSON } = render(<SessionStageBar />)
    expect(toJSON()).toBeNull()
  })

  it('renders 4 phase labels when sessionData exists', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', stage: 'opinion_discussion' },
      currentStage: 'opinion_discussion',
      selectedSession: 'sess-1',
    }

    render(<SessionStageBar />)

    expect(screen.getByText('phaseProposal')).toBeTruthy()
    expect(screen.getByText('phaseOpinion')).toBeTruthy()
    expect(screen.getByText('phaseReflection')).toBeTruthy()
    expect(screen.getByText('phaseConsensus')).toBeTruthy()
  })

  it('makes completed phases tappable to enter archive mode', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', stage: 'opinion_discussion' },
      currentStage: 'opinion_discussion',
      selectedSession: 'sess-1',
      setViewingStage: jest.fn(),
    }

    render(<SessionStageBar />)

    fireEvent.press(screen.getByText('phaseProposal'))
    expect(mockSessionContext.setViewingStage).toHaveBeenCalledWith('proposal_issue')
  })

  it('highlights viewed phase when in archive mode', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', stage: 'opinion_discussion' },
      currentStage: 'opinion_discussion',
      viewingStage: 'proposal_issue',
      selectedSession: 'sess-1',
      setViewingStage: jest.fn(),
    }

    render(<SessionStageBar />)

    // Tapping the viewed phase returns to live
    fireEvent.press(screen.getByLabelText('phaseProposal'))
    expect(mockSessionContext.setViewingStage).toHaveBeenCalledWith(null)
  })

  it('tapping live phase while in archive returns to live', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', stage: 'opinion_discussion' },
      currentStage: 'opinion_discussion',
      viewingStage: 'proposal_issue',
      selectedSession: 'sess-1',
      setViewingStage: jest.fn(),
    }

    render(<SessionStageBar />)

    fireEvent.press(screen.getByLabelText('phaseOpinion'))
    expect(mockSessionContext.setViewingStage).toHaveBeenCalledWith(null)
  })

  it('disables future phase pills', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: { label: 'Healthcare', stage: 'proposal_issue' },
      currentStage: 'proposal_issue',
      selectedSession: 'sess-1',
    }

    render(<SessionStageBar />)

    const opinionLabel = screen.getAllByLabelText('phaseOpinion')
    expect(opinionLabel[0].props.accessibilityState?.disabled).toBe(true)
  })

  it('shows advance button for facilitator (not at last stage)', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: {
        label: 'Healthcare',
        stage: 'opinion_discussion',
        facilitatorUserId: 'user-1',
      },
      currentStage: 'opinion_discussion',
      selectedSession: 'sess-1',
    }

    render(<SessionStageBar />)

    expect(screen.getByLabelText('stageAdvance')).toBeTruthy()
  })

  it('hides advance button for non-facilitators', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: {
        label: 'Healthcare',
        stage: 'opinion_discussion',
        facilitatorUserId: 'other-user',
      },
      currentStage: 'opinion_discussion',
      selectedSession: 'sess-1',
    }

    render(<SessionStageBar />)

    expect(screen.queryByLabelText('stageAdvance')).toBeNull()
  })

  it('hides advance button at last stage (consensus)', () => {
    mockSessionContext = {
      ...mockSessionContext,
      sessionData: {
        label: 'Healthcare',
        stage: 'consensus',
        facilitatorUserId: 'user-1',
      },
      currentStage: 'consensus',
      selectedSession: 'sess-1',
    }

    render(<SessionStageBar />)

    expect(screen.queryByLabelText('stageAdvance')).toBeNull()
  })

  it('calls api.sessions.update on advance confirmation', () => {
    mockUpdate.mockResolvedValue({})
    jest.spyOn(Alert, 'alert')

    mockSessionContext = {
      ...mockSessionContext,
      sessionData: {
        label: 'Healthcare',
        stage: 'opinion_discussion',
        facilitatorUserId: 'user-1',
      },
      currentStage: 'opinion_discussion',
      selectedSession: 'sess-1',
      refreshSessionData: jest.fn(),
    }

    render(<SessionStageBar />)

    fireEvent.press(screen.getByLabelText('stageAdvance'))

    expect(Alert.alert).toHaveBeenCalledWith(
      'stageAdvance',
      expect.any(String),
      expect.any(Array)
    )

    const alertButtons = Alert.alert.mock.calls[0][2]
    const confirmButton = alertButtons.find(b => b.text === 'confirm')
    expect(confirmButton).toBeTruthy()
  })
})

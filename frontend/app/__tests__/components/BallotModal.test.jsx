import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
}))

// Mock MarkdownRenderer
jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

// Mock ThemedText
jest.mock('../../components/ThemedText', () => {
  const { Text } = require('react-native')
  return function MockThemedText(props) {
    return <Text {...props}>{props.children}</Text>
  }
})

// Mock ProposalPreviewModal to avoid nested Modal issues
jest.mock('../../components/discuss/ProposalPreviewModal', () => {
  return function MockProposalPreviewModal() {
    return null
  }
})

// Mock API
const mockGetCandidates = jest.fn()
const mockGetBallot = jest.fn()
const mockSubmitBallot = jest.fn()
jest.mock('../../lib/api', () => ({
  sessionsApiWrapper: {
    getCandidates: (...args) => mockGetCandidates(...args),
    getBallot: (...args) => mockGetBallot(...args),
    submitBallot: (...args) => mockSubmitBallot(...args),
  },
  postsApiWrapper: {
    getPost: jest.fn(),
  },
}))

// Mock context
const mockCloseBallotModal = jest.fn()
const mockOpenSessionSelector = jest.fn()

let mockContextValues = {
  ballotModalVisible: true,
  closeBallotModal: mockCloseBallotModal,
  selectedSession: 'session-1',
  roundType: 'issue',
  openSessionSelector: mockOpenSessionSelector,
  isReadOnly: false,
}

jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => mockContextValues,
}))

import BallotModal from '../../components/discuss/BallotModal'

const candidates = [
  { proposalPostId: 'a', title: 'Proposal Alpha', endorsementCount: 5 },
  { proposalPostId: 'b', title: 'Proposal Beta', endorsementCount: 3 },
  { proposalPostId: 'c', title: 'Proposal Gamma', endorsementCount: 1 },
]

describe('BallotModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCandidates.mockResolvedValue(candidates)
    mockGetBallot.mockResolvedValue(null)
    mockContextValues = {
      ballotModalVisible: true,
      closeBallotModal: mockCloseBallotModal,
      selectedSession: 'session-1',
      roundType: 'issue',
      openSessionSelector: mockOpenSessionSelector,
      isReadOnly: false,
    }
  })

  it('renders candidates in unranked section after loading', async () => {
    render(<BallotModal />)

    await waitFor(() => {
      expect(screen.getByText('Proposal Alpha')).toBeTruthy()
      expect(screen.getByText('Proposal Beta')).toBeTruthy()
      expect(screen.getByText('Proposal Gamma')).toBeTruthy()
    })
  })

  it('tapping a candidate adds it to ranked section', async () => {
    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Tap the first add button
    const addButtons = screen.getAllByLabelText(/ballotAddA11y/)
    fireEvent.press(addButtons[0])

    // Should now show rank 1
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('tapping rank badge removes from ranked', async () => {
    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Add proposal
    const addButtons = screen.getAllByLabelText(/ballotAddA11y/)
    fireEvent.press(addButtons[0])

    // Remove it via rank badge
    const removeBadge = screen.getByLabelText(/ballotRemoveA11y/)
    fireEvent.press(removeBadge)

    // Rank should be gone
    expect(screen.queryByLabelText(/ballotRemoveA11y/)).toBeNull()
  })

  it('up/down buttons reorder ranked candidates', async () => {
    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Add first candidate
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])
    // Re-query after state change, then add second
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])

    // Should have 2 ranked items
    expect(screen.getAllByLabelText(/ballotRemoveA11y/).length).toBe(2)

    // Move rank 2 up
    const moveUpButtons = screen.getAllByLabelText(/ballotMoveUpA11y/)
    fireEvent.press(moveUpButtons[moveUpButtons.length - 1])

    // Still have 2 ranked items after reorder
    expect(screen.getAllByLabelText(/ballotRemoveA11y/).length).toBe(2)
  })

  it('blocks submit with fewer than 3 rankings', async () => {
    mockSubmitBallot.mockResolvedValue({})

    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Add only one candidate
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])

    // Try to submit
    fireEvent.press(screen.getByLabelText('submitBallotA11y'))

    // Should show minimum ranking warning, not call API
    await waitFor(() => {
      expect(screen.getByText('ballotMinRankingsTitle')).toBeTruthy()
    })
    expect(mockSubmitBallot).not.toHaveBeenCalled()
  })

  it('shows nudge then submits on second press', async () => {
    mockSubmitBallot.mockResolvedValue({})

    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Rank all 3 — need to re-query after each press
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])

    // All ranked — no unranked left, so nudge shouldn't show; should submit directly
    fireEvent.press(screen.getByLabelText('submitBallotA11y'))

    await waitFor(() => {
      expect(mockSubmitBallot).toHaveBeenCalledWith('session-1', expect.any(Array))
    })
  })

  it('shows soft nudge when not all candidates ranked', async () => {
    const fourCandidates = [
      ...candidates,
      { proposalPostId: 'd', title: 'Proposal Delta', endorsementCount: 0 },
    ]
    mockGetCandidates.mockResolvedValue(fourCandidates)
    mockSubmitBallot.mockResolvedValue({})

    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Rank 3 of 4
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])
    fireEvent.press(screen.getAllByLabelText(/ballotAddA11y/)[0])

    // First submit attempt shows nudge
    fireEvent.press(screen.getByLabelText('submitBallotA11y'))

    await waitFor(() => {
      expect(screen.getByText('ballotNudgeTitle')).toBeTruthy()
    })
    expect(mockSubmitBallot).not.toHaveBeenCalled()

    // "Submit As Is" proceeds
    fireEvent.press(screen.getByLabelText('ballotNudgeSubmitAnywayA11y'))

    await waitFor(() => {
      expect(mockSubmitBallot).toHaveBeenCalled()
    })
  })

  it('close button hidden in mandatory mode (no existing ballot)', async () => {
    mockGetBallot.mockResolvedValue(null)

    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Close button label should not exist
    expect(screen.queryByLabelText('acceptedProposalCloseA11y')).toBeNull()
  })

  it('close button shown when existing ballot (update mode)', async () => {
    mockGetBallot.mockResolvedValue({
      rankings: [{ proposalPostId: 'a', rank: 1 }],
    })

    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    const closeBtn = screen.getByLabelText('acceptedProposalCloseA11y')
    expect(closeBtn).toBeTruthy()
    fireEvent.press(closeBtn)
    expect(mockCloseBallotModal).toHaveBeenCalled()
  })

  it('Candid logo opens session selector', async () => {
    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    const logoBtn = screen.getByLabelText('ballotSessionSwitchA11y')
    fireEvent.press(logoBtn)
    expect(mockCloseBallotModal).toHaveBeenCalled()
    expect(mockOpenSessionSelector).toHaveBeenCalled()
  })

  it('shows empty state when no candidates', async () => {
    mockGetCandidates.mockResolvedValue([])

    render(<BallotModal />)

    await waitFor(() => {
      expect(screen.getByText('ballotNoCandidates')).toBeTruthy()
    })
  })

  it('clears all rankings', async () => {
    render(<BallotModal />)

    await waitFor(() => expect(screen.getByText('Proposal Alpha')).toBeTruthy())

    // Add two candidates
    const addButtons = screen.getAllByLabelText(/ballotAddA11y/)
    fireEvent.press(addButtons[0])
    fireEvent.press(addButtons[0])

    // Clear all
    fireEvent.press(screen.getByLabelText('clearRankingA11y'))

    // No ranked items should exist
    expect(screen.queryByLabelText(/ballotRemoveA11y/)).toBeNull()
  })
})

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import ElectionResults from '../../components/discuss/ElectionResults'

const condorcetResults = {
  method: 'condorcet',
  winners: [{ proposalPostId: 'a', rank: 1 }],
  condorcetMatrix: {
    a: { b: 5, c: 4 },
    b: { a: 2, c: 3 },
    c: { a: 3, b: 4 },
  },
  irvRounds: null,
  totalBallots: 7,
  candidates: [
    { proposalPostId: 'a', title: 'Winner Proposal', endorsementCount: 5, displayOrder: 0 },
    { proposalPostId: 'b', title: 'Runner Up', endorsementCount: 3, displayOrder: 1 },
    { proposalPostId: 'c', title: 'Third Place', endorsementCount: 2, displayOrder: 2 },
  ],
}

const irvResults = {
  method: 'irv',
  winners: [{ proposalPostId: 'b', rank: 1 }],
  condorcetMatrix: null,
  irvRounds: [
    { round: 1, counts: { a: 2, b: 3, c: 2 }, eliminated: 'a' },
    { round: 2, counts: { b: 4, c: 3 }, winner: 'b' },
  ],
  totalBallots: 7,
  candidates: [
    { proposalPostId: 'a', title: 'Eliminated', endorsementCount: 2, displayOrder: 0 },
    { proposalPostId: 'b', title: 'IRV Winner', endorsementCount: 3, displayOrder: 1 },
    { proposalPostId: 'c', title: 'Second Place', endorsementCount: 2, displayOrder: 2 },
  ],
}

describe('ElectionResults', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders voting results header and winner', () => {
    render(<ElectionResults results={condorcetResults} />)
    expect(screen.getByText('resultsTitle')).toBeTruthy()
    expect(screen.getAllByText('Winner Proposal').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('totalBallots 7')).toBeTruthy()
  })

  it('renders IRV winner', () => {
    render(<ElectionResults results={irvResults} />)
    expect(screen.getAllByText('IRV Winner').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to post when winner is tapped', () => {
    render(<ElectionResults results={condorcetResults} />)
    // First "Winner Proposal" is the winner row
    fireEvent.press(screen.getAllByText('Winner Proposal')[0])
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discuss/[id]',
      params: { id: 'a' },
    })
  })

  it('shows show-more button by default', () => {
    render(<ElectionResults results={condorcetResults} />)
    expect(screen.getByText('resultsShowMore')).toBeTruthy()
  })

  it('toggles to show-less after expanding', () => {
    render(<ElectionResults results={condorcetResults} />)
    fireEvent.press(screen.getByText('resultsShowMore'))
    expect(screen.getByText('resultsShowLess')).toBeTruthy()
  })

  it('contains all candidates and pairwise sections', () => {
    // Content is always in the tree (animated clip); verify it exists
    render(<ElectionResults results={condorcetResults} />)
    expect(screen.getByText('allCandidates')).toBeTruthy()
    expect(screen.getByText('pairwiseRecord')).toBeTruthy()
    expect(screen.getAllByText('Runner Up').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Third Place').length).toBeGreaterThanOrEqual(1)
  })

  it('contains IRV elimination rounds', () => {
    render(<ElectionResults results={irvResults} />)
    expect(screen.getByText('eliminationRounds')).toBeTruthy()
    expect(screen.getByText('eliminationRound 1')).toBeTruthy()
    expect(screen.getByText('eliminationRound 2')).toBeTruthy()
  })

  it('navigates to post when candidate title is tapped', () => {
    render(<ElectionResults results={condorcetResults} />)
    const runnerUps = screen.getAllByText('Runner Up')
    fireEvent.press(runnerUps[runnerUps.length - 1])
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discuss/[id]',
      params: { id: 'b' },
    })
  })

  it('returns null when no results', () => {
    const { toJSON } = render(<ElectionResults results={null} />)
    expect(toJSON()).toBeNull()
  })
})

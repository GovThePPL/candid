import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
}))

import BallotCard from '../../components/discuss/BallotCard'

const candidates = [
  { proposalPostId: 'a', title: 'Proposal Alpha', endorsementCount: 5, displayOrder: 0 },
  { proposalPostId: 'b', title: 'Proposal Beta', endorsementCount: 3, displayOrder: 1 },
  { proposalPostId: 'c', title: 'Proposal Gamma', endorsementCount: 1, displayOrder: 2 },
]

describe('BallotCard', () => {
  it('renders all candidates', () => {
    render(<BallotCard candidates={candidates} onSubmit={jest.fn()} />)
    expect(screen.getByText('Proposal Alpha')).toBeTruthy()
    expect(screen.getByText('Proposal Beta')).toBeTruthy()
    expect(screen.getByText('Proposal Gamma')).toBeTruthy()
  })

  it('assigns ranks when tapping candidates', () => {
    render(<BallotCard candidates={candidates} onSubmit={jest.fn()} />)
    // Tap first candidate
    fireEvent.press(screen.getByText('Proposal Alpha'))
    // Should now show rank 1
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('removes rank when tapping ranked candidate', () => {
    render(<BallotCard candidates={candidates} onSubmit={jest.fn()} />)
    fireEvent.press(screen.getByText('Proposal Alpha'))
    // Tap again to remove
    fireEvent.press(screen.getByText('Proposal Alpha'))
    // Rank 1 should be gone (only numbers remaining are endorsement counts)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('calls onSubmit with rankings when submitted', async () => {
    const onSubmit = jest.fn().mockResolvedValue()
    render(<BallotCard candidates={candidates} onSubmit={onSubmit} />)

    fireEvent.press(screen.getByText('Proposal Beta'))
    fireEvent.press(screen.getByText('Proposal Alpha'))
    fireEvent.press(screen.getByText('submitBallot'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([
        { proposalPostId: 'b', rank: 1 },
        { proposalPostId: 'a', rank: 2 },
      ])
    })
  })

  it('shows existing rankings', () => {
    const existing = [
      { proposalPostId: 'c', rank: 1 },
      { proposalPostId: 'a', rank: 2 },
    ]
    render(
      <BallotCard
        candidates={candidates}
        existingRankings={existing}
        onSubmit={jest.fn()}
      />
    )
    // Should show "updateBallot" instead of "submitBallot"
    expect(screen.getByText('updateBallot')).toBeTruthy()
  })

  it('clears all rankings', () => {
    render(<BallotCard candidates={candidates} onSubmit={jest.fn()} />)
    fireEvent.press(screen.getByText('Proposal Alpha'))
    fireEvent.press(screen.getByText('clearRanking'))
    // No rank numbers should be visible
    expect(screen.queryByText('1')).toBeNull()
  })
})

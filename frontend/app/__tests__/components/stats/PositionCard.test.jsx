import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import PositionCard from '../../../components/stats/PositionCard'

const makePosition = (overrides = {}) => ({
  id: 'pos-1',
  statement: 'Universal healthcare should be a right',
  category: { label: 'Healthcare' },
  location: { code: 'US', name: 'United States' },
  creator: { displayName: 'Jane Doe', username: 'janedoe' },
  voteDistribution: { agree: 0.6, disagree: 0.3, pass: 0.1 },
  totalVotes: 100,
  groupVotes: {},
  closureCount: 0,
  ...overrides,
})

describe('PositionCard', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('renders vote distribution bar', () => {
    render(
      <PositionCard
        position={makePosition()}
        activeGroup="majority"
      />
    )
    // The VoteDistributionBar renders percentage labels
    expect(screen.getByText('60%')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
  })

  it('shows view closures button when closureCount > 0 and onViewClosures provided', () => {
    const onViewClosures = jest.fn()
    render(
      <PositionCard
        position={makePosition({ closureCount: 3 })}
        activeGroup="majority"
        onViewClosures={onViewClosures}
      />
    )
    const button = screen.getByText('viewClosures')
    fireEvent.press(button)
    expect(onViewClosures).toHaveBeenCalledWith('pos-1')
  })

  it('shows user vote badge when userVote is provided', () => {
    render(
      <PositionCard
        position={makePosition()}
        activeGroup="majority"
        userVote="agree"
      />
    )
    expect(screen.getByText('youAgreed')).toBeTruthy()
  })

  it('handles missing optional data gracefully', () => {
    const minimalPosition = {
      id: 'pos-2',
      statement: 'A simple statement',
      voteDistribution: { agree: 0, disagree: 0, pass: 0 },
      totalVotes: 0,
      groupVotes: {},
      closureCount: 0,
    }
    render(
      <PositionCard
        position={minimalPosition}
        activeGroup="majority"
      />
    )
    expect(screen.getByText('A simple statement')).toBeTruthy()
    // Should show "No votes" in the distribution bar
    expect(screen.getByText('No votes')).toBeTruthy()
  })
})

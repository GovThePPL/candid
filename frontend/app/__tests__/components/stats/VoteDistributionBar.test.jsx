import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { LightTheme } from '../../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import VoteDistributionBar from '../../../components/stats/VoteDistributionBar'

describe('VoteDistributionBar', () => {
  it('renders segments with correct proportional widths', () => {
    const distribution = { agree: 0.5, disagree: 0.3, pass: 0.2 }
    render(<VoteDistributionBar distribution={distribution} showLabels={true} />)

    // Agree should be 50%, disagree 30%, pass 20%
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
  })

  it('handles all-zero counts by showing empty state', () => {
    const distribution = { agree: 0, disagree: 0, pass: 0 }
    render(<VoteDistributionBar distribution={distribution} showLabels={true} />)

    // "No votes" text for the empty bar
    expect(screen.getByText('No votes')).toBeTruthy()
  })

  it('handles single non-zero segment', () => {
    const distribution = { agree: 1.0, disagree: 0, pass: 0 }
    render(<VoteDistributionBar distribution={distribution} showLabels={true} />)

    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('shows percentage labels when showLabels is true', () => {
    const distribution = { agree: 0.6, disagree: 0.3, pass: 0.1 }
    render(<VoteDistributionBar distribution={distribution} showLabels={true} />)

    expect(screen.getByText('60%')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
    // 10% is below the 12% threshold, so its label should be hidden
    expect(screen.queryByText('10%')).toBeNull()
  })

  it('hides percentage labels when showLabels is false', () => {
    const distribution = { agree: 0.5, disagree: 0.3, pass: 0.2 }
    render(<VoteDistributionBar distribution={distribution} showLabels={false} />)

    expect(screen.queryByText('50%')).toBeNull()
    expect(screen.queryByText('30%')).toBeNull()
    expect(screen.queryByText('20%')).toBeNull()
  })
})

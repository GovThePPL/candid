import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import BridgingBadge from '../../components/discuss/BridgingBadge'

describe('BridgingBadge', () => {
  it('renders nothing when bridgingScore is null', () => {
    const { toJSON } = render(
      <BridgingBadge item={{ bridgingScore: null, upvoteCount: 10, downvoteCount: 0 }} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when bridgingScore is below threshold', () => {
    const { toJSON } = render(
      <BridgingBadge item={{ bridgingScore: 0.1, upvoteCount: 10, downvoteCount: 2 }} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when total votes are below minimum', () => {
    const { toJSON } = render(
      <BridgingBadge item={{ bridgingScore: 0.5, upvoteCount: 3, downvoteCount: 1 }} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders badge when item qualifies', () => {
    render(
      <BridgingBadge item={{ bridgingScore: 0.5, upvoteCount: 8, downvoteCount: 2 }} />
    )
    expect(screen.getByText('bridgingBadge')).toBeTruthy()
  })

  it('has accessibility label', () => {
    render(
      <BridgingBadge item={{ bridgingScore: 0.5, upvoteCount: 8, downvoteCount: 2 }} />
    )
    expect(screen.getByLabelText('bridgingBadgeA11y')).toBeTruthy()
  })

  it('works for post objects (same shape as comments)', () => {
    render(
      <BridgingBadge item={{ bridgingScore: 0.4, upvoteCount: 15, downvoteCount: 5 }} />
    )
    expect(screen.getByText('bridgingBadge')).toBeTruthy()
  })
})

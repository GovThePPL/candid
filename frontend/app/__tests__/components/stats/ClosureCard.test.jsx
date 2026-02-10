import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

// Mock MaterialCommunityIcons which is not in the global jest.setup.js
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native')
  const Icon = (props) => <Text {...props}>{props.name}</Text>
  return { Ionicons: Icon, MaterialIcons: Icon, MaterialCommunityIcons: Icon }
})

import ClosureCard from '../../../components/stats/ClosureCard'

const makeClosure = (overrides = {}) => ({
  closureText: { content: 'We agreed on universal healthcare' },
  closedAt: '2025-03-15T10:00:00Z',
  crossGroup: false,
  positionHolderUser: {
    displayName: 'Alice',
    username: 'alice',
    kudosCount: 0,
    opinionGroup: null,
  },
  initiatorUser: {
    displayName: 'Bob',
    username: 'bob',
    kudosCount: 0,
    opinionGroup: null,
  },
  ...overrides,
})

describe('ClosureCard', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  const defaultProps = {
    closure: makeClosure(),
    onShowMap: jest.fn(),
    onViewStatements: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows cross-group badge when crossGroup is true', () => {
    render(
      <ClosureCard
        {...defaultProps}
        closure={makeClosure({ crossGroup: true })}
      />
    )
    expect(screen.getByText('crossGroup')).toBeTruthy()
  })

  it('calls onViewStatements when statements button is pressed', () => {
    const onViewStatements = jest.fn()
    render(
      <ClosureCard
        {...defaultProps}
        onViewStatements={onViewStatements}
      />
    )
    const btn = screen.getByLabelText('viewStatementsA11y')
    fireEvent.press(btn)
    expect(onViewStatements).toHaveBeenCalledTimes(1)
  })

  it('shows date information', () => {
    render(<ClosureCard {...defaultProps} />)
    // The formatted date for 2025-03-15 in 'en' locale, short month
    // toLocaleDateString with { month: 'short', day: 'numeric', year: 'numeric' } => "Mar 15, 2025"
    expect(screen.getByText(/Mar/)).toBeTruthy()
    expect(screen.getByText(/2025/)).toBeTruthy()
  })
})

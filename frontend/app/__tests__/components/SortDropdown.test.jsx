import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../components/BottomDrawerModal', () => {
  const { View, Text } = require('react-native')
  return ({ children, visible, title }) =>
    visible ? <View><Text>{title}</Text>{children}</View> : null
})

import SortDropdown from '../../components/discuss/SortDropdown'

describe('SortDropdown', () => {
  const defaultProps = {
    sort: 'hot',
    onSortChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders trigger button with sort icon', () => {
    render(<SortDropdown {...defaultProps} />)
    // Current sort is 'hot', icon is 'flame' (active icon)
    expect(screen.getByText('flame')).toBeTruthy()
  })

  it('shows modal with all sort options when trigger pressed', () => {
    render(<SortDropdown {...defaultProps} />)
    // Modal not visible initially
    expect(screen.queryByText('sortLabel')).toBeNull()

    // Press trigger — a11y label includes current sort
    fireEvent.press(screen.getByLabelText('sortButtonA11y sortHot'))

    // Modal now visible with all options
    expect(screen.getByText('sortLabel')).toBeTruthy()
    expect(screen.getByText('sortHot')).toBeTruthy()
    expect(screen.getByText('sortNew')).toBeTruthy()
    expect(screen.getByText('sortTop')).toBeTruthy()
    expect(screen.getByText('sortControversial')).toBeTruthy()
  })

  it('calls onSortChange and closes modal when option selected', () => {
    const onSortChange = jest.fn()
    render(<SortDropdown {...defaultProps} onSortChange={onSortChange} />)

    // Open modal
    fireEvent.press(screen.getByLabelText('sortButtonA11y sortHot'))

    // Select "New"
    fireEvent.press(screen.getByLabelText('sortByA11y sortNew'))
    expect(onSortChange).toHaveBeenCalledWith('new')

    // Modal should close (our mock won't render children when visible=false)
    expect(screen.queryByText('sortLabel')).toBeNull()
  })

  it('shows checkmark on selected sort option', () => {
    render(<SortDropdown {...defaultProps} sort="top" />)

    // Open modal
    fireEvent.press(screen.getByLabelText('sortButtonA11y sortTop'))

    // Top option should have checkmark
    expect(screen.getByText('checkmark')).toBeTruthy()
    // Only one checkmark
    expect(screen.getAllByText('checkmark')).toHaveLength(1)
  })

  it('marks selected option as selected in accessibility state', () => {
    render(<SortDropdown {...defaultProps} sort="new" />)

    fireEvent.press(screen.getByLabelText('sortButtonA11y sortNew'))

    const newOption = screen.getByLabelText('sortByA11y sortNew')
    expect(newOption).toBeSelected()
  })
})

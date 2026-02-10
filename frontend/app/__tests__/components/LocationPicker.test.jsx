import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../constants/SharedStyles', () => ({
  createSharedStyles: () => ({ modalOverlay: {}, modalContent: {} }),
}))

import LocationPicker from '../../components/LocationPicker'

const flatLocations = [
  { id: 'us', name: 'United States', code: 'US', parentLocationId: null },
  { id: 'ca', name: 'California', code: 'CA', parentLocationId: 'us' },
  { id: 'or', name: 'Oregon', code: 'OR', parentLocationId: 'us' },
  { id: 'la', name: 'Los Angeles', code: 'LA', parentLocationId: 'ca' },
]

describe('LocationPicker', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    allLocations: flatLocations,
    currentLocationId: null,
    onSelect: jest.fn(),
    saving: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls onSelect when leaf item is pressed', () => {
    const onSelect = jest.fn()
    render(<LocationPicker {...defaultProps} onSelect={onSelect} />)

    // Drill into United States
    fireEvent.press(screen.getByText('United States'))

    // Now we should see California and Oregon
    expect(screen.getByText('California')).toBeTruthy()
    expect(screen.getByText('Oregon')).toBeTruthy()

    // Drill into California
    fireEvent.press(screen.getByText('California'))

    // Los Angeles is a leaf node
    expect(screen.getByText('Los Angeles')).toBeTruthy()
    fireEvent.press(screen.getByText('Los Angeles'))

    expect(onSelect).toHaveBeenCalledWith('la')
  })

  it('shows back button when drilled down', () => {
    render(<LocationPicker {...defaultProps} />)

    // Back button should not be visible at root
    expect(screen.queryByText('back')).toBeNull()

    // Drill down
    fireEvent.press(screen.getByText('United States'))

    // Back button should now be visible (translated key "back")
    expect(screen.getByText('back')).toBeTruthy()
  })

  it('shows empty message when no locations', () => {
    render(<LocationPicker {...defaultProps} allLocations={[]} />)
    expect(screen.getByText('noLocationsAvailable')).toBeTruthy()
  })

  it('shows "Select [name]" button when drilled into parent with children', () => {
    render(<LocationPicker {...defaultProps} />)

    // Drill into United States
    fireEvent.press(screen.getByText('United States'))

    // Should see the "Select United States" button (translated selectName key with name param)
    expect(screen.getByText('selectName United States')).toBeTruthy()
  })
})

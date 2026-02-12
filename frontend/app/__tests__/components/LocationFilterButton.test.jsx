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

import LocationFilterButton from '../../components/LocationFilterButton'

const flatLocations = [
  { id: 'us', name: 'United States', code: 'US', parentLocationId: null },
  { id: 'ca', name: 'California', code: 'CA', parentLocationId: 'us' },
  { id: 'or', name: 'Oregon', code: 'OR', parentLocationId: 'us' },
  { id: 'la', name: 'Los Angeles', code: 'LA', parentLocationId: 'ca' },
]

describe('LocationFilterButton', () => {
  const defaultProps = {
    allLocations: flatLocations,
    selectedLocationId: null,
    onSelect: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders placeholder when no location selected', () => {
    render(<LocationFilterButton {...defaultProps} />)
    // Default placeholder comes from i18n key "selectLocation"
    expect(screen.getByText('selectLocation')).toBeTruthy()
  })

  it('renders custom placeholder when provided', () => {
    render(<LocationFilterButton {...defaultProps} placeholder="Pick a place" />)
    expect(screen.getByText('Pick a place')).toBeTruthy()
  })

  it('renders breadcrumb when location selected', () => {
    render(<LocationFilterButton {...defaultProps} selectedLocationId="la" />)
    // Should show full path: United States > California > Los Angeles
    expect(screen.getByText('United States \u203A California \u203A Los Angeles')).toBeTruthy()
  })

  it('renders breadcrumb for mid-level location', () => {
    render(<LocationFilterButton {...defaultProps} selectedLocationId="ca" />)
    expect(screen.getByText('United States \u203A California')).toBeTruthy()
  })

  it('renders breadcrumb for root-level location', () => {
    render(<LocationFilterButton {...defaultProps} selectedLocationId="us" />)
    expect(screen.getByText('United States')).toBeTruthy()
  })

  it('opens LocationPicker on press', () => {
    render(<LocationFilterButton {...defaultProps} />)
    const button = screen.getByRole('button')
    fireEvent.press(button)

    // LocationPicker modal should render — root locations visible
    expect(screen.getByText('United States')).toBeTruthy()
  })
})

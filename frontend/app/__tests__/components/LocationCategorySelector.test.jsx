import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../constants/SharedStyles', () => ({
  createSharedStyles: () => ({
    modalOverlay: {},
    modalContent: {},
    modalTitle: {},
  }),
}))

const mockGetLocations = jest.fn()
const mockGetCategories = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  usersApiWrapper: {
    getLocations: (...args) => mockGetLocations(...args),
  },
  categoriesApiWrapper: {
    getAll: (...args) => mockGetCategories(...args),
  },
}))

import LocationCategorySelector from '../../components/LocationCategorySelector'

const sampleLocations = [
  { id: 'loc-1', name: 'United States' },
  { id: 'loc-2', name: 'Canada' },
]

const sampleCategories = [
  { id: 'cat-1', label: 'Healthcare', name: 'Healthcare' },
  { id: 'cat-2', label: 'Education', name: 'Education' },
]

describe('LocationCategorySelector', () => {
  const defaultProps = {
    selectedLocation: null,
    selectedCategory: null,
    onLocationChange: jest.fn(),
    onCategoryChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetLocations.mockResolvedValue(sampleLocations)
    mockGetCategories.mockResolvedValue(sampleCategories)
  })

  it('shows loading state initially', () => {
    // Make the API calls hang
    mockGetLocations.mockReturnValue(new Promise(() => {}))
    mockGetCategories.mockReturnValue(new Promise(() => {}))

    render(<LocationCategorySelector {...defaultProps} />)
    expect(screen.getByText('loading')).toBeTruthy()
  })

  it('renders location and category selector buttons after load', async () => {
    const onLocationChange = jest.fn()
    render(
      <LocationCategorySelector
        {...defaultProps}
        onLocationChange={onLocationChange}
        selectedLocation="loc-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('United States')).toBeTruthy()
    })
    expect(screen.getByText('selectCategory')).toBeTruthy()
  })

  it('auto-selects first location on load', async () => {
    const onLocationChange = jest.fn()
    render(
      <LocationCategorySelector
        {...defaultProps}
        onLocationChange={onLocationChange}
      />
    )

    await waitFor(() => {
      expect(onLocationChange).toHaveBeenCalledWith('loc-1')
    })
  })

  it('shows "All Categories" option when showAllCategories is true', async () => {
    const onCategoryChange = jest.fn()
    render(
      <LocationCategorySelector
        {...defaultProps}
        showAllCategories={true}
        onCategoryChange={onCategoryChange}
        selectedLocation="loc-1"
        selectedCategory="all"
      />
    )

    await waitFor(() => {
      // When selectedCategory='all', the selector button shows "allCategories" text
      expect(screen.getByText('allCategories')).toBeTruthy()
    })
  })

  it('opens location picker on press', async () => {
    render(
      <LocationCategorySelector
        {...defaultProps}
        selectedLocation="loc-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('United States')).toBeTruthy()
    })

    // Press the location selector button
    const locButton = screen.getByLabelText('locationSelectorA11y United States')
    fireEvent.press(locButton)

    // The picker modal should show the location list with the title
    await waitFor(() => {
      expect(screen.getByText('selectLocation')).toBeTruthy()
    })
  })

  it('opens category picker on press', async () => {
    render(
      <LocationCategorySelector
        {...defaultProps}
        selectedLocation="loc-1"
        selectedCategory="cat-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Healthcare')).toBeTruthy()
    })

    // Press the category selector button
    const catButton = screen.getByLabelText('categorySelectorA11y Healthcare')
    fireEvent.press(catButton)

    // The picker modal should show the category list
    await waitFor(() => {
      expect(screen.getByText('selectCategory')).toBeTruthy()
    })
  })
})

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
const mockGetSessions = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  usersApiWrapper: {
    getLocations: (...args) => mockGetLocations(...args),
  },
  sessionsApiWrapper: {
    getAll: (...args) => mockGetSessions(...args),
  },
}))

import LocationSessionSelector from '../../components/LocationSessionSelector'

const sampleLocations = [
  { id: 'loc-1', name: 'United States' },
  { id: 'loc-2', name: 'Canada' },
]

const sampleSessions = [
  { id: 'sess-1', label: 'Healthcare', name: 'Healthcare' },
  { id: 'sess-2', label: 'Education', name: 'Education' },
]

describe('LocationSessionSelector', () => {
  const defaultProps = {
    selectedLocation: null,
    selectedSession: null,
    onLocationChange: jest.fn(),
    onSessionChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetLocations.mockResolvedValue(sampleLocations)
    mockGetSessions.mockResolvedValue(sampleSessions)
  })

  it('shows loading state initially', () => {
    // Make the locations call hang
    mockGetLocations.mockReturnValue(new Promise(() => {}))

    render(<LocationSessionSelector {...defaultProps} />)
    expect(screen.getByText('loading')).toBeTruthy()
  })

  it('renders location and session selector buttons after load', async () => {
    const onLocationChange = jest.fn()
    render(
      <LocationSessionSelector
        {...defaultProps}
        onLocationChange={onLocationChange}
        selectedLocation="loc-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('United States')).toBeTruthy()
    })
    // Sessions loaded for loc-1
    expect(mockGetSessions).toHaveBeenCalledWith('loc-1')
  })

  it('auto-selects first location on load', async () => {
    const onLocationChange = jest.fn()
    render(
      <LocationSessionSelector
        {...defaultProps}
        onLocationChange={onLocationChange}
      />
    )

    await waitFor(() => {
      expect(onLocationChange).toHaveBeenCalledWith('loc-1')
    })
  })

  it('fetches sessions filtered by selected location', async () => {
    render(
      <LocationSessionSelector
        {...defaultProps}
        selectedLocation="loc-2"
        selectedSession="sess-1"
      />
    )

    await waitFor(() => {
      expect(mockGetSessions).toHaveBeenCalledWith('loc-2')
    })
  })

  it('shows "All Sessions" option when showAllSessions is true', async () => {
    const onSessionChange = jest.fn()
    render(
      <LocationSessionSelector
        {...defaultProps}
        showAllSessions={true}
        onSessionChange={onSessionChange}
        selectedLocation="loc-1"
        selectedSession="all"
      />
    )

    await waitFor(() => {
      // When selectedSession='all', the selector button shows "allSessions" text
      expect(screen.getByText('allSessions')).toBeTruthy()
    })
  })

  it('opens location picker on press', async () => {
    render(
      <LocationSessionSelector
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

  it('opens session picker on press', async () => {
    render(
      <LocationSessionSelector
        {...defaultProps}
        selectedLocation="loc-1"
        selectedSession="sess-1"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Healthcare')).toBeTruthy()
    })

    // Press the session selector button
    const sessButton = screen.getByLabelText('sessionSelectorA11y Healthcare')
    fireEvent.press(sessButton)

    // The picker modal should show the session list
    await waitFor(() => {
      expect(screen.getByText('selectSession')).toBeTruthy()
    })
  })
})

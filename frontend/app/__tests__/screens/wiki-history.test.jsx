import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader({ title }) {
    return <Text>{title || 'Header'}</Text>
  }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title, subtitle }) {
    return <Text>{title}{subtitle ? ` ${subtitle}` : ''}</Text>
  }
})

jest.mock('../../components/wiki/VersionCard', () => {
  const { Text, TouchableOpacity } = require('react-native')
  return function MockVersionCard({ version, onPress }) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text>{version.title}</Text>
      </TouchableOpacity>
    )
  }
})

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: (date) => 'recently',
}))

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'gun-policy', type: 'page' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

const mockGetPageHistory = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    wiki: {
      getPageHistory: (...args) => mockGetPageHistory(...args),
    },
    glossary: {
      getTermHistory: jest.fn(),
    },
  },
}))

import WikiHistoryScreen from '../../app/(dashboard)/wiki/history'

describe('WikiHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows empty state when no versions', async () => {
    mockGetPageHistory.mockResolvedValue([])
    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText(/historyEmpty/)).toBeTruthy()
    })
  })

  it('renders version cards', async () => {
    mockGetPageHistory.mockResolvedValue([
      {
        id: 'v-1',
        title: 'Gun Policy',
        editedBy: { id: 'u-1', username: 'admin1', displayName: 'Admin' },
        editedAt: '2026-02-20T10:00:00Z',
      },
      {
        id: 'v-2',
        title: 'Gun Policy Original',
        editedBy: { id: 'u-1', username: 'admin1', displayName: 'Admin' },
        editedAt: '2026-02-19T10:00:00Z',
      },
    ])

    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Gun Policy')).toBeTruthy()
      expect(screen.getByText('Gun Policy Original')).toBeTruthy()
    })
  })

  it('navigates to version detail on card press', async () => {
    mockGetPageHistory.mockResolvedValue([
      {
        id: 'v-1',
        title: 'Gun Policy',
        editedBy: { id: 'u-1', username: 'admin1', displayName: 'Admin' },
        editedAt: '2026-02-20T10:00:00Z',
      },
    ])

    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Gun Policy')).toBeTruthy()
    })

    fireEvent.press(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/wiki/version?versionId=v-1')
    )
  })

  it('shows error state on API failure', async () => {
    mockGetPageHistory.mockRejectedValue(new Error('fail'))
    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText(/historyLoadError/)).toBeTruthy()
    })
  })
})

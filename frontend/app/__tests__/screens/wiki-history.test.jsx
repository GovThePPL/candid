import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native'
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
  const { Text, TouchableOpacity, View } = require('react-native')
  return function MockVersionCard({ version, onToggle, expanded, versionDetail, detailLoading }) {
    return (
      <View>
        <TouchableOpacity onPress={onToggle} accessibilityRole="button" testID={`toggle-${version.id}`}>
          <Text>{version.title}</Text>
        </TouchableOpacity>
        {expanded && detailLoading && <Text>Loading...</Text>}
        {expanded && versionDetail && <Text testID="diff-content">Diff shown</Text>}
      </View>
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
const mockGetPageVersion = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    wiki: {
      getPageHistory: (...args) => mockGetPageHistory(...args),
      getPageVersion: (...args) => mockGetPageVersion(...args),
    },
    glossary: {
      getTermHistory: jest.fn(),
      getTermVersion: jest.fn(),
    },
  },
}))

import WikiHistoryScreen from '../../app/(dashboard)/(tabs)/wiki/history'

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

  it('expands card on tap and fetches version detail', async () => {
    const versionDetail = {
      id: 'v-1',
      beforeSnapshot: { title: 'Old', content: 'old' },
      afterSnapshot: { title: 'New', content: 'new' },
    }
    mockGetPageHistory.mockResolvedValue([
      {
        id: 'v-1',
        title: 'Gun Policy',
        editedBy: { id: 'u-1', username: 'admin1', displayName: 'Admin' },
        editedAt: '2026-02-20T10:00:00Z',
      },
    ])
    mockGetPageVersion.mockResolvedValue(versionDetail)

    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Gun Policy')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-v-1'))
    })

    expect(mockGetPageVersion).toHaveBeenCalledWith('v-1', 'gun-policy')

    await waitFor(() => {
      expect(screen.getByTestId('diff-content')).toBeTruthy()
    })
  })

  it('collapses card on second tap', async () => {
    mockGetPageHistory.mockResolvedValue([
      {
        id: 'v-1',
        title: 'Gun Policy',
        editedBy: { id: 'u-1', username: 'admin1', displayName: 'Admin' },
        editedAt: '2026-02-20T10:00:00Z',
      },
    ])
    mockGetPageVersion.mockResolvedValue({
      id: 'v-1',
      beforeSnapshot: { title: 'Old', content: 'old' },
      afterSnapshot: { title: 'New', content: 'new' },
    })

    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText('Gun Policy')).toBeTruthy()
    })

    // Expand
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-v-1'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('diff-content')).toBeTruthy()
    })

    // Collapse
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-v-1'))
    })

    await waitFor(() => {
      expect(screen.queryByTestId('diff-content')).toBeNull()
    })
  })

  it('shows error state on API failure', async () => {
    mockGetPageHistory.mockRejectedValue(new Error('fail'))
    render(<WikiHistoryScreen />)
    await waitFor(() => {
      expect(screen.getByText(/historyLoadError/)).toBeTruthy()
    })
  })
})

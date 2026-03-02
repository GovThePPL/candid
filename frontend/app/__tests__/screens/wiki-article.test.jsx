import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader({ onBack }) {
    const { TouchableOpacity } = require('react-native')
    return (
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="back">
        <Text>Header</Text>
      </TouchableOpacity>
    )
  }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title }) {
    return <Text>{title}</Text>
  }
})

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native')
  return function Markdown({ children }) {
    return <Text>{children}</Text>
  }
})

const mockGetPage = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  API_BASE_URL: 'http://localhost:8000/api/v1',
  default: {
    wiki: {
      getPage: (...args) => mockGetPage(...args),
    },
  },
}))

jest.mock('../../lib/cache', () => ({
  CacheManager: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
  },
  CacheKeys: {
    wikiPage: (slug) => `wiki:page:${slug}`,
  },
  CacheDurations: {
    WIKI_PAGE: 600000,
  },
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '3h',
}))

const mockBack = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'filibuster' }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useFocusEffect: (cb) => {
    const { useEffect } = require('react')
    useEffect(() => { const cleanup = cb(); return cleanup }, [cb])
  },
}))

import WikiArticleScreen from '../../app/(dashboard)/(tabs)/wiki/[...slug]'

const mockPage = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  slug: 'filibuster',
  title: 'Filibuster',
  description: 'A delay tactic used in the Senate',
  content: '# Filibuster\n\nA filibuster is a political procedure...',
  wikiCategory: 'Governance',
  updatedAt: '2026-02-20T00:00:00Z',
  canEdit: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue(mockPage)
})

describe('WikiArticleScreen', () => {
  it('renders article title', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
  })

  it('renders article description', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('A delay tactic used in the Senate')).toBeTruthy()
    })
  })

  it('renders category badge', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('Governance')).toBeTruthy()
    })
  })

  it('renders markdown content', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      // Markdown mock renders content as plain text
      expect(screen.getByText(/filibuster is a political procedure/i)).toBeTruthy()
    })
  })

  it('shows error state on fetch failure', async () => {
    mockGetPage.mockRejectedValue(new Error('Not found'))
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiLoadError')).toBeTruthy()
    })
  })

  it('calls router.back on back button press', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    fireEvent.press(screen.getByLabelText('back'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows edit FAB with suggestEdit label when canEdit is false', async () => {
    mockGetPage.mockResolvedValue({ ...mockPage, canEdit: false })
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByLabelText('suggestEditA11y')).toBeTruthy()
    })
  })

  it('shows edit FAB with directEdit label when canEdit is true', async () => {
    mockGetPage.mockResolvedValue({ ...mockPage, canEdit: true })
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByLabelText('directEditA11y')).toBeTruthy()
    })
  })

  it('navigates with directEdit=true when canEdit is true', async () => {
    mockGetPage.mockResolvedValue({ ...mockPage, canEdit: true })
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByLabelText('directEditA11y')).toBeTruthy()
    })
    fireEvent.press(screen.getByLabelText('directEditA11y'))
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('directEdit=true')
    )
  })

  it('refreshes data on pull-to-refresh', async () => {
    render(<WikiArticleScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })

    // Update mock to return new data
    mockGetPage.mockResolvedValue({ ...mockPage, title: 'Filibuster Updated' })

    // Find the RefreshControl — it's rendered as a child of ScrollView
    const scrollView = screen.UNSAFE_getByType(require('react-native').ScrollView)
    const { refreshControl } = scrollView.props
    expect(refreshControl).toBeTruthy()

    // Trigger refresh
    await waitFor(async () => {
      await refreshControl.props.onRefresh()
    })

    await waitFor(() => {
      expect(screen.getByText('Filibuster Updated')).toBeTruthy()
    })
    // Should have called API again after refresh (initial + focus + refresh)
    expect(mockGetPage).toHaveBeenCalledTimes(3)
  })
})

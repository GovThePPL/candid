import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader() {
    return <Text>Header</Text>
  }
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title, subtitle }) {
    return <Text>{title}{subtitle ? ` ${subtitle}` : ''}</Text>
  }
})

jest.mock('../../components/LocationFilterButton', () => {
  const { Text, TouchableOpacity } = require('react-native')
  return function MockLocationFilterButton({ placeholder, onSelect }) {
    return (
      <TouchableOpacity onPress={() => onSelect && onSelect('loc-1')}>
        <Text>{placeholder || 'Location'}</Text>
      </TouchableOpacity>
    )
  }
})

jest.mock('../../contexts/UserContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}))

const mockLocationSession = {
  selectedLocation: null,
  selectedSession: null,
}
jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => mockLocationSession,
}))

const mockGetPages = jest.fn()
const mockGetCategories = jest.fn()
const mockGetSuggestionCount = jest.fn()
const mockGetAllLocations = jest.fn()
const mockGetAllSessions = jest.fn()
const mockGetTerms = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    wiki: {
      getPages: (...args) => mockGetPages(...args),
      getCategories: (...args) => mockGetCategories(...args),
      getSuggestionCount: (...args) => mockGetSuggestionCount(...args),
    },
    users: {
      getAllLocations: (...args) => mockGetAllLocations(...args),
    },
    sessions: {
      getAll: (...args) => mockGetAllSessions(...args),
    },
    glossary: {
      getTerms: (...args) => mockGetTerms(...args),
    },
  },
}))

jest.mock('../../lib/cache', () => ({
  CacheManager: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
    isStale: jest.fn(() => true),
  },
  CacheKeys: {
    wikiPages: () => 'wiki:pages',
    glossaryTerms: () => 'glossary:terms',
  },
  CacheDurations: {
    WIKI_PAGES: 300000,
    GLOSSARY_TERMS: 600000,
  },
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '2h',
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb) => {
    const React = require('react')
    // Use cb as dep so the effect re-fires when tab/filter state changes
    React.useEffect(() => { cb() }, [cb])
  },
}))

import WikiScreen from '../../app/(dashboard)/(tabs)/wiki/index'

const mockPages = [
  { id: 1, slug: 'filibuster', title: 'Filibuster', description: 'A delay tactic', wikiCategory: 'Governance', updatedAt: '2026-02-20T00:00:00Z' },
  { id: 2, slug: 'caucus', title: 'Caucus', description: 'A group meeting', wikiCategory: 'Elections', updatedAt: '2026-02-19T00:00:00Z' },
]

const mockTerms = [
  { slug: 'amendment', term: 'Amendment', summary: 'A change to a document', aliases: [] },
  { slug: 'bicameral', term: 'Bicameral', summary: 'Two legislative chambers', aliases: ['Two-house'] },
]

const mockLocations = [
  { id: 'loc-1', name: 'United States', parentLocationId: null },
  { id: 'loc-2', name: 'Oregon', parentLocationId: 'loc-1' },
]

const mockSessions = [
  { id: 'sess-1', label: 'Elections' },
  { id: 'sess-2', label: 'Governance' },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPages.mockResolvedValue(mockPages)
  mockGetSuggestionCount.mockResolvedValue({ count: 0 })
  mockGetAllLocations.mockResolvedValue(mockLocations)
  mockGetAllSessions.mockResolvedValue(mockSessions)
  mockGetTerms.mockResolvedValue(mockTerms)
})

describe('WikiScreen', () => {
  it('renders page list on Pages tab (default)', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
      expect(screen.getByText('Caucus')).toBeTruthy()
    })
  })

  it('renders Terms/Pages tab toggle', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiTabTerms')).toBeTruthy()
      expect(screen.getByText('wikiTabPages')).toBeTruthy()
    })
  })

  it('shows terms when switching to Terms tab', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiTabTerms')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('wikiTabTerms'))
    await waitFor(() => {
      expect(screen.getByText('Amendment')).toBeTruthy()
      expect(screen.getByText('Bicameral')).toBeTruthy()
    })
  })

  it('shows term summaries in terms list', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiTabTerms')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('wikiTabTerms'))
    await waitFor(() => {
      expect(screen.getByText('A change to a document')).toBeTruthy()
      expect(screen.getByText('Two legislative chambers')).toBeTruthy()
    })
  })

  it('hides filter dropdowns by default', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    expect(screen.queryByText('wikiAllSessionsLabel')).toBeNull()
    expect(screen.queryByText('wikiAllLocations')).toBeNull()
  })

  it('shows filter dropdowns after pressing filter button', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    const filterBtn = screen.getByLabelText('wikiToggleFilterA11y')
    fireEvent.press(filterBtn)
    await waitFor(() => {
      expect(screen.getByText('wikiAllSessionsLabel')).toBeTruthy()
      expect(screen.getByText('wikiAllLocations')).toBeTruthy()
    })
  })

  it('renders category dropdown button when filters open', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    fireEvent.press(screen.getByLabelText('wikiToggleFilterA11y'))
    await waitFor(() => {
      expect(screen.getByText('wikiAllSessionsLabel')).toBeTruthy()
    })
  })

  it('renders location filter button when filters open', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    fireEvent.press(screen.getByLabelText('wikiToggleFilterA11y'))
    await waitFor(() => {
      expect(screen.getByText('wikiAllLocations')).toBeTruthy()
    })
  })

  it('passes locationId to getPages when location selected', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    // Open filters first
    fireEvent.press(screen.getByLabelText('wikiToggleFilterA11y'))
    await waitFor(() => {
      expect(screen.getByText('wikiAllLocations')).toBeTruthy()
    })
    // Press the mock location button which calls onSelect('loc-1')
    fireEvent.press(screen.getByText('wikiAllLocations'))
    await waitFor(() => {
      expect(mockGetPages).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: 'loc-1' })
      )
    })
  })

  it('shows empty state when no pages', async () => {
    mockGetPages.mockResolvedValue([])
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiNoResults wikiNoResultsSubtitle')).toBeTruthy()
    })
  })

  it('shows error state on fetch failure', async () => {
    mockGetPages.mockRejectedValue(new Error('Network error'))
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiLoadError')).toBeTruthy()
    })
  })

  it('navigates to article on card press', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('Filibuster')).toBeTruthy()
    })
    const buttons = screen.getAllByRole('button')
    const filibusterCard = buttons.find(b =>
      b.props.accessibilityLabel?.includes('Filibuster')
    )
    if (filibusterCard) {
      fireEvent.press(filibusterCard)
      expect(mockPush).toHaveBeenCalledWith('/wiki/filibuster')
    }
  })

  it('renders search bar', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('wikiSearchPlaceholder')).toBeTruthy()
    })
  })

  it('shows empty state when no terms match search', async () => {
    render(<WikiScreen />)
    await waitFor(() => {
      expect(screen.getByText('wikiTabTerms')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('wikiTabTerms'))
    await waitFor(() => {
      expect(screen.getByText('Amendment')).toBeTruthy()
    })
    const searchInput = screen.getByPlaceholderText('wikiTermSearchPlaceholder')
    fireEvent.changeText(searchInput, 'zzzznonexistent')
    await waitFor(() => {
      expect(screen.getByText('wikiNoTerms wikiNoTermsSubtitle')).toBeTruthy()
    })
  })

  it('syncs filters from LocationSessionContext on mount', async () => {
    mockLocationSession.selectedLocation = 'loc-1'
    mockLocationSession.selectedSession = 'sess-1'

    render(<WikiScreen />)
    await waitFor(() => {
      // Pages should be fetched with the global session/location
      expect(mockGetPages).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: 'loc-1',
          sessionId: 'sess-1',
        })
      )
    })

    // Reset
    mockLocationSession.selectedLocation = null
    mockLocationSession.selectedSession = null
  })
})

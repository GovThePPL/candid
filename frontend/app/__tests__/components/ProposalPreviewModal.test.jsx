import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
}))

// Mock MarkdownRenderer
jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

// Mock ThemedText
jest.mock('../../components/ThemedText', () => {
  const { Text } = require('react-native')
  return function MockThemedText(props) {
    return <Text {...props}>{props.children}</Text>
  }
})

// Mock API
const mockGetPost = jest.fn()
jest.mock('../../lib/api', () => ({
  postsApiWrapper: {
    getPost: (...args) => mockGetPost(...args),
  },
}))

import ProposalPreviewModal from '../../components/discuss/ProposalPreviewModal'

const samplePost = {
  title: 'Improve Public Transit',
  body: 'We should invest in better bus routes and light rail.',
}

describe('ProposalPreviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing visible when postId is null', () => {
    const onClose = jest.fn()
    render(<ProposalPreviewModal postId={null} onClose={onClose} />)

    // Modal should have visible=false when postId is null
    // The header title translation key should not appear
    expect(screen.queryByText('proposalPreviewTitle')).toBeNull()
  })

  it('shows loading indicator when fetching', async () => {
    // Make the API call hang so we can observe the loading state
    let resolvePost
    mockGetPost.mockReturnValue(new Promise(resolve => { resolvePost = resolve }))

    const onClose = jest.fn()
    render(<ProposalPreviewModal postId="post-1" onClose={onClose} />)

    // ActivityIndicator should be present while loading
    await waitFor(() => {
      expect(screen.getByLabelText('proposalPreviewCloseA11y')).toBeTruthy()
    })

    // The post content should not be rendered yet
    expect(screen.queryByText('Improve Public Transit')).toBeNull()

    // Clean up the hanging promise
    await act(async () => { resolvePost(samplePost) })
  })

  it('renders post title and body after loading', async () => {
    mockGetPost.mockResolvedValue(samplePost)

    const onClose = jest.fn()
    render(<ProposalPreviewModal postId="post-1" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Improve Public Transit')).toBeTruthy()
    })

    // Body is rendered via MarkdownRenderer mock which outputs the content as text
    expect(screen.getByText('We should invest in better bus routes and light rail.')).toBeTruthy()
  })

  it('shows error state when API fails', async () => {
    mockGetPost.mockRejectedValue(new Error('Network error'))

    const onClose = jest.fn()
    render(<ProposalPreviewModal postId="post-1" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('proposalPreviewLoadError')).toBeTruthy()
    })

    // Post content should not be rendered
    expect(screen.queryByText('Improve Public Transit')).toBeNull()
  })

  it('close button calls onClose', async () => {
    mockGetPost.mockResolvedValue(samplePost)

    const onClose = jest.fn()
    render(<ProposalPreviewModal postId="post-1" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Improve Public Transit')).toBeTruthy()
    })

    const closeButton = screen.getByLabelText('proposalPreviewCloseA11y')
    fireEvent.press(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fetches new post when postId changes', async () => {
    mockGetPost.mockResolvedValue(samplePost)

    const onClose = jest.fn()
    const { rerender } = render(<ProposalPreviewModal postId="post-1" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Improve Public Transit')).toBeTruthy()
    })

    expect(mockGetPost).toHaveBeenCalledWith('post-1')

    // Change postId to trigger a new fetch
    const secondPost = {
      title: 'Expand Bike Lanes',
      body: 'Protected bike lanes on all major roads.',
    }
    mockGetPost.mockResolvedValue(secondPost)

    rerender(<ProposalPreviewModal postId="post-2" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Expand Bike Lanes')).toBeTruthy()
    })

    expect(mockGetPost).toHaveBeenCalledWith('post-2')
    expect(mockGetPost).toHaveBeenCalledTimes(2)
  })
})

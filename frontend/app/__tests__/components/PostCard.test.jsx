import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '3h',
}))

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native')
  return function Markdown({ children }) {
    return <Text>{children}</Text>
  }
})

import PostCard from '../../components/discuss/PostCard'

const basePost = {
  id: 'p1',
  title: 'Test Post Title',
  body: 'This is the post body text that should be displayed.',
  status: 'active',
  upvoteCount: 12,
  commentCount: 5,
  userVote: null,
  creatorRole: null,
  isAnswered: null,
  category: null,
  creator: { displayName: 'TestUser', username: 'testuser' },
  createdTime: '2026-02-12T10:00:00Z',
}

describe('PostCard', () => {
  const defaultProps = {
    post: basePost,
    onPress: jest.fn(),
    onUpvote: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title and body preview', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('Test Post Title')).toBeTruthy()
    expect(screen.getByText('This is the post body text that should be displayed.')).toBeTruthy()
  })

  it('renders upvote count and comment count', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders author display name and @username', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('TestUser')).toBeTruthy()
    expect(screen.getByText('@testuser')).toBeTruthy()
  })

  it('renders relative time', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('3h')).toBeTruthy()
  })

  it('shows category label when present', () => {
    const post = { ...basePost, category: { label: 'Environment' } }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('Environment')).toBeTruthy()
  })

  it('does not show category when absent', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.queryByText('Environment')).toBeNull()
  })

  it('shows locked indicator when status is locked', () => {
    const post = { ...basePost, status: 'locked' }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('lock-closed')).toBeTruthy()
    expect(screen.getByText('locked')).toBeTruthy()
  })

  it('shows answered badge for answered Q&A posts', () => {
    const post = { ...basePost, isAnswered: true }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('checkmark-circle')).toBeTruthy()
    expect(screen.getByText('answered')).toBeTruthy()
  })

  it('does not show answered badge when isAnswered is false', () => {
    const post = { ...basePost, isAnswered: false }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.queryByText('checkmark-circle')).toBeNull()
  })

  it('shows role badge when creatorRole is present', () => {
    const post = { ...basePost, creatorRole: 'moderator' }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('roleModerator')).toBeTruthy()
  })

  it('does not show role badge when creatorRole is null', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.queryByText('roleAdmin')).toBeNull()
    expect(screen.queryByText('roleModerator')).toBeNull()
  })

  it('calls onPress when card is tapped', () => {
    const onPress = jest.fn()
    render(<PostCard {...defaultProps} onPress={onPress} />)
    fireEvent.press(screen.getByLabelText('postCardA11y TestUser Test Post Title'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('calls onUpvote with post id when upvote button tapped', () => {
    const onUpvote = jest.fn()
    render(<PostCard {...defaultProps} onUpvote={onUpvote} />)
    fireEvent.press(screen.getByLabelText('upvoteA11y'))
    expect(onUpvote).toHaveBeenCalledWith('p1')
  })

  it('shows active upvote style when user has upvoted', () => {
    const post = { ...basePost, userVote: { voteType: 'upvote' } }
    render(<PostCard {...defaultProps} post={post} />)
    const upvoteBtn = screen.getByLabelText('upvoteA11y')
    expect(upvoteBtn).toBeSelected()
    expect(screen.getByText('chevron-up')).toBeTruthy()
    expect(screen.queryByText('chevron-up-outline')).toBeNull()
  })

  it('shows outline upvote icon when not upvoted', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('chevron-up-outline')).toBeTruthy()
  })

  it('falls back to username when displayName missing', () => {
    const post = { ...basePost, creator: { username: 'fallback_user' } }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('fallback_user')).toBeTruthy()
  })

  it('shows "?" when creator is null and no @username', () => {
    const post = { ...basePost, creator: null }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.getByText('?')).toBeTruthy()
    expect(screen.queryByText(/@/)).toBeNull()
  })

  it('has correct accessibility label', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByLabelText('postCardA11y TestUser Test Post Title')).toBeTruthy()
  })

  it('shows "Show more" button when body exists', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('expandPost')).toBeTruthy()
  })

  it('does not show expand button when body is empty', () => {
    const post = { ...basePost, body: '' }
    render(<PostCard {...defaultProps} post={post} />)
    expect(screen.queryByText('expandPost')).toBeNull()
  })

  it('expands body with markdown on tap and toggles back', () => {
    render(<PostCard {...defaultProps} />)

    // Initially shows "Show more"
    expect(screen.getByText('expandPost')).toBeTruthy()
    expect(screen.getByLabelText('expandPostA11y')).toBeTruthy()

    // Tap expand
    fireEvent.press(screen.getByLabelText('expandPostA11y'))

    // Now shows "Show less" and markdown-rendered body
    expect(screen.getByText('collapsePost')).toBeTruthy()
    expect(screen.getByLabelText('collapsePostA11y')).toBeTruthy()
    // Body is still visible (via markdown mock)
    expect(screen.getByText('This is the post body text that should be displayed.')).toBeTruthy()

    // Tap collapse
    fireEvent.press(screen.getByLabelText('collapsePostA11y'))

    // Back to "Show more"
    expect(screen.getByText('expandPost')).toBeTruthy()
  })
})

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '5h',
}))

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native')
  return function Markdown({ children }) {
    return <Text>{children}</Text>
  }
})

import PostHeader from '../../components/discuss/PostHeader'

const basePost = {
  id: 'p1',
  title: 'Test Post Title',
  body: 'This is the **markdown** body.',
  status: 'active',
  postType: 'discussion',
  upvoteCount: 42,
  downvoteCount: 3,
  commentCount: 23,
  userVote: null,
  creatorRole: null,
  isAnswered: null,
  category: null,
  location: null,
  creator: { id: 'u1', displayName: 'Author Name', username: 'authoruser', avatarUrl: null },
  createdTime: '2026-02-12T10:00:00Z',
}

describe('PostHeader', () => {
  const defaultProps = {
    post: basePost,
    onUpvote: jest.fn(),
    onDownvote: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders display name and @username', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('Author Name')).toBeTruthy()
    expect(screen.getByText('@authoruser')).toBeTruthy()
  })

  it('renders relative time', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('5h')).toBeTruthy()
  })

  it('renders title', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('Test Post Title')).toBeTruthy()
  })

  it('renders markdown body', () => {
    render(<PostHeader {...defaultProps} />)
    // Our mock renders raw markdown text
    expect(screen.getByText('This is the **markdown** body.')).toBeTruthy()
  })

  it('shows category and location when present', () => {
    const post = {
      ...basePost,
      category: { label: 'Environment' },
      location: { name: 'Oregon' },
    }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('Environment')).toBeTruthy()
    expect(screen.getByText('Oregon')).toBeTruthy()
  })

  it('shows RoleBadge when creatorRole present', () => {
    const post = { ...basePost, creatorRole: 'admin' }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('roleAdmin')).toBeTruthy()
  })

  it('renders upvote and downvote counts', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders comment count', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('23')).toBeTruthy()
  })

  it('calls onUpvote when upvote pressed', () => {
    render(<PostHeader {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('upvoteA11y'))
    expect(defaultProps.onUpvote).toHaveBeenCalled()
  })

  it('calls onDownvote when downvote pressed', () => {
    render(<PostHeader {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('downvotePostA11y'))
    expect(defaultProps.onDownvote).toHaveBeenCalled()
  })

  it('shows locked badge when post is locked', () => {
    const post = { ...basePost, status: 'locked' }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('lock-closed')).toBeTruthy()
    expect(screen.getByText('locked')).toBeTruthy()
  })

  it('shows answered badge when post is answered', () => {
    const post = { ...basePost, isAnswered: true }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('checkmark-circle')).toBeTruthy()
    expect(screen.getByText('answered')).toBeTruthy()
  })

  it('shows upvote as selected when user has upvoted', () => {
    const post = { ...basePost, userVote: { voteType: 'upvote' } }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByLabelText('upvoteA11y')).toBeSelected()
  })

  it('falls back gracefully when creator is null', () => {
    const post = { ...basePost, creator: null }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('?')).toBeTruthy()
    expect(screen.getByText('@?')).toBeTruthy()
  })
})

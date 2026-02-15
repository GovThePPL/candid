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

jest.mock('../../components/BottomDrawerModal', () => {
  const { View, Text } = require('react-native')
  return function BottomDrawerModal({ visible, title, children }) {
    if (!visible) return null
    return <View><Text>{title}</Text>{children}</View>
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

  it('renders relative time in top row', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('5h')).toBeTruthy()
  })

  it('shows role overlay via UserCard when creatorRole present', () => {
    const post = { ...basePost, creatorRole: 'admin' }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByTestId('role-overlay')).toBeTruthy()
  })

  it('shows role title bubble when creatorRole present and showCreatorRole not false', () => {
    const post = { ...basePost, creatorRole: 'admin' }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByTestId('role-username-pill')).toBeTruthy()
    expect(screen.getByText('@authoruser · discuss:roleAdmin')).toBeTruthy()
  })

  it('shows avatar letter but hides role bubble when showCreatorRole is false', () => {
    const post = { ...basePost, creatorRole: 'admin', showCreatorRole: false }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByTestId('role-overlay')).toBeTruthy()
    expect(screen.queryByTestId('role-username-pill')).toBeNull()
    expect(screen.getByText('@authoruser')).toBeTruthy()
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
      location: { code: 'OR', name: 'Oregon' },
    }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('Environment')).toBeTruthy()
    expect(screen.getByText('OR')).toBeTruthy()
  })

  it('renders net vote score in sm pill', () => {
    render(<PostHeader {...defaultProps} />)
    // sm pill shows net score: 42 - 3 = 39
    expect(screen.getByText('39')).toBeTruthy()
  })

  it('renders comment count', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByText('23')).toBeTruthy()
  })

  it('calls onUpvote when upvote pressed', () => {
    render(<PostHeader {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('upvotePostA11y Author Name'))
    expect(defaultProps.onUpvote).toHaveBeenCalled()
  })

  it('calls onDownvote when downvote pressed', () => {
    render(<PostHeader {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('downvotePostA11y Author Name'))
    expect(defaultProps.onDownvote).toHaveBeenCalled()
  })

  it('shows bridging badge when post has qualifying bridgingScore', () => {
    const post = { ...basePost, bridgingScore: 0.5, upvoteCount: 42, downvoteCount: 3 }
    render(<PostHeader {...defaultProps} post={post} />)
    expect(screen.getByText('bridgingBadge')).toBeTruthy()
  })

  it('does not show bridging badge when bridgingScore is null', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.queryByText('bridgingBadge')).toBeNull()
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
    expect(screen.getByLabelText('upvotePostA11y Author Name')).toBeSelected()
  })

  it('falls back gracefully when creator is null', () => {
    const post = { ...basePost, creator: null }
    render(<PostHeader {...defaultProps} post={post} />)
    // UserCard falls back to 'common:anonymous'
    expect(screen.getByText('common:anonymous')).toBeTruthy()
  })

  it('renders three-dot menu button', () => {
    render(<PostHeader {...defaultProps} />)
    expect(screen.getByLabelText('postOptionsA11y Author Name')).toBeTruthy()
  })

  it('shows Report option in three-dot menu', () => {
    render(<PostHeader {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('postOptionsA11y Author Name'))
    expect(screen.getByText('postOptions')).toBeTruthy()
    expect(screen.getByText('report')).toBeTruthy()
  })

  it('shows role badge toggle for post author with role', () => {
    const post = { ...basePost, creatorRole: 'admin', showCreatorRole: true }
    render(<PostHeader {...defaultProps} post={post} currentUserId="u1" onToggleRole={jest.fn()} />)
    fireEvent.press(screen.getByLabelText('postOptionsA11y Author Name'))
    expect(screen.getByText('hideRoleBadge')).toBeTruthy()
  })

  it('hides role badge toggle for non-author', () => {
    const post = { ...basePost, creatorRole: 'admin' }
    render(<PostHeader {...defaultProps} post={post} currentUserId="u2" />)
    fireEvent.press(screen.getByLabelText('postOptionsA11y Author Name'))
    expect(screen.queryByText('hideRoleBadge')).toBeNull()
    expect(screen.queryByText('showRoleBadge')).toBeNull()
  })

  it('calls onToggleRole when toggle pressed', () => {
    const onToggleRole = jest.fn()
    const post = { ...basePost, creatorRole: 'admin', showCreatorRole: true }
    render(<PostHeader {...defaultProps} post={post} currentUserId="u1" onToggleRole={onToggleRole} />)
    fireEvent.press(screen.getByLabelText('postOptionsA11y Author Name'))
    fireEvent.press(screen.getByText('hideRoleBadge'))
    expect(onToggleRole).toHaveBeenCalledWith('p1', false)
  })
})

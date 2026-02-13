import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '2h',
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

import CommentItem from '../../components/discuss/CommentItem'

const baseComment = {
  id: 'c1',
  body: 'This is a test comment body.',
  score: 5,
  upvoteCount: 8,
  downvoteCount: 3,
  userVote: null,
  creatorRole: null,
  isDeleted: false,
  deletedByModerator: false,
  parentCommentId: null,
  depth: 0,
  visualDepth: 0,
  isCollapsed: false,
  creator: { id: 'u1', displayName: 'TestUser', username: 'testuser' },
  createdTime: '2026-02-12T10:00:00Z',
  updatedTime: null,
  children: [],
}

describe('CommentItem', () => {
  const defaultProps = {
    comment: baseComment,
    currentUserId: 'u2',
    isQAPost: false,
    isPostLocked: false,
    currentUserHasQAAuthority: false,
    onUpvote: jest.fn(),
    onDownvote: jest.fn(),
    onReply: jest.fn(),
    onToggleCollapse: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders author name, @username, and body', () => {
    render(<CommentItem {...defaultProps} />)
    expect(screen.getByText('TestUser')).toBeTruthy()
    expect(screen.getByText('@testuser')).toBeTruthy()
    expect(screen.getByText('This is a test comment body.')).toBeTruthy()
  })

  it('renders relative time', () => {
    render(<CommentItem {...defaultProps} />)
    expect(screen.getByText('2h')).toBeTruthy()
  })

  it('renders vote score', () => {
    render(<CommentItem {...defaultProps} />)
    // net score = 8 - 3 = 5
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows RoleBadge when creatorRole is present', () => {
    const comment = { ...baseComment, creatorRole: 'moderator' }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getByText('roleModerator')).toBeTruthy()
  })

  it('does not show RoleBadge when creatorRole is null', () => {
    render(<CommentItem {...defaultProps} />)
    expect(screen.queryByText('roleModerator')).toBeNull()
  })

  it('calls onUpvote when upvote button pressed', () => {
    render(<CommentItem {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('upvoteCommentA11y TestUser'))
    expect(defaultProps.onUpvote).toHaveBeenCalledWith('c1')
  })

  it('marks upvote as selected when user has upvoted', () => {
    const comment = { ...baseComment, userVote: { voteType: 'upvote' } }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getByLabelText('upvoteCommentA11y TestUser')).toBeSelected()
  })

  it('calls onDownvote when downvote button pressed', () => {
    render(<CommentItem {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('downvoteCommentA11y TestUser'))
    expect(defaultProps.onDownvote).toHaveBeenCalledWith('c1')
  })

  it('calls onReply when reply button pressed', () => {
    render(<CommentItem {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('replyButtonA11y TestUser'))
    expect(defaultProps.onReply).toHaveBeenCalledWith(baseComment)
  })

  it('hides reply when post is locked', () => {
    render(<CommentItem {...defaultProps} isPostLocked={true} />)
    expect(screen.queryByLabelText('replyButtonA11y TestUser')).toBeNull()
  })

  it('hides reply for non-authority comments in Q&A for non-authority user', () => {
    // Q&A post, user has no QA authority, comment author has no role
    render(<CommentItem {...defaultProps} isQAPost={true} currentUserHasQAAuthority={false} />)
    expect(screen.queryByText('reply')).toBeNull()
  })

  it('shows reply on authority comments in Q&A even for non-authority user', () => {
    const comment = { ...baseComment, creatorRole: 'expert' }
    render(<CommentItem {...defaultProps} comment={comment} isQAPost={true} currentUserHasQAAuthority={false} />)
    expect(screen.getByText('reply')).toBeTruthy()
  })

  it('shows deleted placeholder for deleted comments', () => {
    const comment = { ...baseComment, isDeleted: true }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getAllByText('deletedComment').length).toBeGreaterThanOrEqual(1)
    // Vote and reply buttons should not appear
    expect(screen.queryByLabelText('upvoteCommentA11y TestUser')).toBeNull()
    expect(screen.queryByText('reply')).toBeNull()
  })

  it('shows removed placeholder for moderator-deleted comments', () => {
    const comment = { ...baseComment, deletedByModerator: true }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getAllByText('removedComment').length).toBeGreaterThanOrEqual(1)
  })

  it('shows collapsed reply count when collapsed', () => {
    const comment = { ...baseComment, isCollapsed: true, collapsedCount: 3, children: [{ id: 'c' }] }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getByText('nReplies 3')).toBeTruthy()
  })

  it('shows edited indicator when updatedTime differs from createdTime', () => {
    const comment = {
      ...baseComment,
      createdTime: '2026-02-12T10:00:00Z',
      updatedTime: '2026-02-12T10:05:00Z', // 5 min later
    }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getByText('edited')).toBeTruthy()
  })

  it('shows depth badge when depth > 5', () => {
    const comment = { ...baseComment, depth: 7, visualDepth: 5 }
    render(<CommentItem {...defaultProps} comment={comment} />)
    expect(screen.getByText('↳ 7')).toBeTruthy()
  })

  it('collapses children when body is tapped', () => {
    const comment = { ...baseComment, children: [{ id: 'child1' }] }
    render(<CommentItem {...defaultProps} comment={comment} />)
    fireEvent.press(screen.getByText('This is a test comment body.'))
    expect(defaultProps.onToggleCollapse).toHaveBeenCalledWith('c1')
  })

  it('does not collapse when body tapped on childless comment', () => {
    render(<CommentItem {...defaultProps} />)
    fireEvent.press(screen.getByText('This is a test comment body.'))
    expect(defaultProps.onToggleCollapse).not.toHaveBeenCalled()
  })

  it('opens options modal when three-dot button pressed', () => {
    render(<CommentItem {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('commentOptionsA11y TestUser'))
    expect(screen.getByText('commentOptions')).toBeTruthy()
    expect(screen.getByText('report')).toBeTruthy()
  })
})

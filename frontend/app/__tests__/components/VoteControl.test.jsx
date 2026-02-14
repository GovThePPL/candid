import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import VoteControl from '../../components/discuss/VoteControl'

describe('VoteControl', () => {
  const defaultProps = {
    upvoteCount: 8,
    downvoteCount: 3,
    userVote: null,
    onUpvote: jest.fn(),
    onDownvote: jest.fn(),
    authorName: 'TestUser',
    targetType: 'comment',
  }

  beforeEach(() => jest.clearAllMocks())

  describe('sm (pill)', () => {
    it('renders net score', () => {
      render(<VoteControl {...defaultProps} />)
      // net = 8 - 3 = 5
      expect(screen.getByText('5')).toBeTruthy()
    })

    it('calls onUpvote on press', () => {
      render(<VoteControl {...defaultProps} />)
      fireEvent.press(screen.getByLabelText('upvoteCommentA11y TestUser'))
      expect(defaultProps.onUpvote).toHaveBeenCalledTimes(1)
    })

    it('calls onDownvote on press', () => {
      render(<VoteControl {...defaultProps} />)
      fireEvent.press(screen.getByLabelText('downvoteCommentA11y TestUser'))
      expect(defaultProps.onDownvote).toHaveBeenCalledTimes(1)
    })

    it('marks upvote selected when user has upvoted', () => {
      render(<VoteControl {...defaultProps} userVote={{ voteType: 'upvote' }} />)
      expect(screen.getByLabelText('upvoteCommentA11y TestUser')).toBeSelected()
    })

    it('marks downvote selected when user has downvoted', () => {
      render(<VoteControl {...defaultProps} userVote={{ voteType: 'downvote' }} />)
      expect(screen.getByLabelText('downvoteCommentA11y TestUser')).toBeSelected()
    })
  })

  describe('lg (expanded)', () => {
    it('renders separate upvote and downvote counts', () => {
      render(<VoteControl {...defaultProps} size="lg" />)
      expect(screen.getByText('8')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
    })

    it('calls onUpvote on press', () => {
      render(<VoteControl {...defaultProps} size="lg" />)
      fireEvent.press(screen.getByLabelText('upvoteCommentA11y TestUser'))
      expect(defaultProps.onUpvote).toHaveBeenCalledTimes(1)
    })

    it('calls onDownvote on press', () => {
      render(<VoteControl {...defaultProps} size="lg" />)
      fireEvent.press(screen.getByLabelText('downvoteCommentA11y TestUser'))
      expect(defaultProps.onDownvote).toHaveBeenCalledTimes(1)
    })

    it('uses outline icons when not voted', () => {
      render(<VoteControl {...defaultProps} size="lg" />)
      expect(screen.getByText('chevron-up-outline')).toBeTruthy()
      expect(screen.getByText('chevron-down-outline')).toBeTruthy()
    })

    it('uses filled icon when upvoted', () => {
      render(<VoteControl {...defaultProps} size="lg" userVote={{ voteType: 'upvote' }} />)
      expect(screen.getByText('chevron-up')).toBeTruthy()
      expect(screen.queryByText('chevron-up-outline')).toBeNull()
    })
  })

  describe('a11y labels by targetType', () => {
    it('uses post a11y keys for targetType="post"', () => {
      render(<VoteControl {...defaultProps} targetType="post" />)
      expect(screen.getByLabelText('upvotePostA11y TestUser')).toBeTruthy()
      expect(screen.getByLabelText('downvotePostA11y TestUser')).toBeTruthy()
    })

    it('uses comment a11y keys for targetType="comment"', () => {
      render(<VoteControl {...defaultProps} targetType="comment" />)
      expect(screen.getByLabelText('upvoteCommentA11y TestUser')).toBeTruthy()
      expect(screen.getByLabelText('downvoteCommentA11y TestUser')).toBeTruthy()
    })
  })
})

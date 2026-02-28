import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/keycloak', () => ({
  refreshToken: jest.fn(),
  loginWithCredentials: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
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

jest.mock('../../contexts/GlossaryContext', () => ({
  useGlossary: () => ({
    matchPattern: null,
    termMap: new Map(),
    getFilteredPattern: () => null,
  }),
}))

jest.mock('../../components/BottomDrawerModal', () => {
  const { View, Text } = require('react-native')
  return function BottomDrawerModal({ visible, title, children }) {
    if (!visible) return null
    return <View><Text>{title}</Text>{children}</View>
  }
})

jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => ({
    openSessionOverview: jest.fn(),
  }),
}))

import PostCard from '../../components/discuss/PostCard'

const baseProposal = {
  id: 'p1',
  title: 'Test Proposal',
  body: 'Proposal body.',
  status: 'active',
  postType: 'proposal',
  proposalStatus: 'finalized',
  creator: { id: 'u2', username: 'author', displayName: 'Author' },
  location: { id: 'loc1', code: 'OR', name: 'Oregon' },
  session: { id: 's1', label: 'Test Session' },
  upvoteCount: 0,
  downvoteCount: 0,
  commentCount: 0,
  createdTime: new Date().toISOString(),
}

describe('Endorsement button on PostCard', () => {
  it('shows endorsement button for finalized proposal when onEndorse is provided', () => {
    const onEndorse = jest.fn()
    render(
      <PostCard
        post={baseProposal}
        onEndorse={onEndorse}
        isEndorsed={false}
        endorseLimitReached={false}
      />
    )
    const btn = screen.getByLabelText('endorseA11y')
    expect(btn).toBeTruthy()
  })

  it('shows filled icon when endorsed', () => {
    render(
      <PostCard
        post={baseProposal}
        onEndorse={jest.fn()}
        isEndorsed={true}
        endorseLimitReached={false}
      />
    )
    const btn = screen.getByLabelText('unendorseA11y')
    expect(btn).toBeTruthy()
  })

  it('calls onEndorse handler when tapped', () => {
    const onEndorse = jest.fn()
    render(
      <PostCard
        post={baseProposal}
        onEndorse={onEndorse}
        isEndorsed={false}
        endorseLimitReached={false}
      />
    )
    const btn = screen.getByLabelText('endorseA11y')
    fireEvent.press(btn)
    expect(onEndorse).toHaveBeenCalledWith('p1', false)
  })

  it('does not show endorsement button for draft proposals', () => {
    const draftProposal = { ...baseProposal, proposalStatus: 'draft' }
    render(
      <PostCard
        post={draftProposal}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorseLimitReached={false}
      />
    )
    expect(screen.queryByLabelText('endorseA11y')).toBeNull()
  })

  it('does not show endorsement button for discussion posts', () => {
    const discussionPost = { ...baseProposal, postType: 'discussion', proposalStatus: undefined }
    render(
      <PostCard
        post={discussionPost}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorseLimitReached={false}
      />
    )
    expect(screen.queryByLabelText('endorseA11y')).toBeNull()
  })

  it('calls onEndorseLimitReached when limit reached and not endorsed', () => {
    const onEndorseLimitReached = jest.fn()
    render(
      <PostCard
        post={baseProposal}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorseLimitReached={true}
        onEndorseLimitReached={onEndorseLimitReached}
      />
    )
    const btn = screen.getByLabelText('endorseA11y')
    fireEvent.press(btn)
    expect(onEndorseLimitReached).toHaveBeenCalledWith('p1')
  })

  it('hides VoteControl for finalized proposals', () => {
    render(
      <PostCard
        post={baseProposal}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorseLimitReached={false}
      />
    )
    // VoteControl has upvote/downvote buttons — should not be present for finalized
    expect(screen.queryByLabelText('upvotePostA11y Author')).toBeNull()
  })

  it('shows VoteControl for draft proposals', () => {
    const draftProposal = { ...baseProposal, proposalStatus: 'draft' }
    render(
      <PostCard
        post={draftProposal}
        onUpvote={jest.fn()}
        onDownvote={jest.fn()}
      />
    )
    // VoteControl should be present for draft proposals
    expect(screen.getByLabelText('upvotePostA11y Author')).toBeTruthy()
  })
})

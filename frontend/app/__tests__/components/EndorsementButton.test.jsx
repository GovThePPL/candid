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

import PostCard from '../../components/discuss/PostCard'

const baseProposal = {
  id: 'p1',
  title: 'Test Proposal',
  body: 'Proposal body.',
  status: 'active',
  postType: 'proposal',
  proposalStatus: 'draft',
  creator: { id: 'u2', username: 'author', displayName: 'Author' },
  location: { id: 'loc1', code: 'OR', name: 'Oregon' },
  session: { id: 's1', label: 'Test Session' },
  upvoteCount: 0,
  downvoteCount: 0,
  commentCount: 0,
  createdTime: new Date().toISOString(),
}

describe('Endorsement button on PostCard', () => {
  it('shows endorsement button when onEndorse is provided and status is proposals_open', () => {
    const onEndorse = jest.fn()
    render(
      <PostCard
        post={baseProposal}
        onEndorse={onEndorse}
        isEndorsed={false}
        endorsementCount={5}
        endorseLimitReached={false}
        votingRoundStatus="proposals_open"
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
        endorsementCount={3}
        endorseLimitReached={false}
        votingRoundStatus="proposals_open"
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
        endorsementCount={0}
        endorseLimitReached={false}
        votingRoundStatus="finalization_open"
      />
    )
    const btn = screen.getByLabelText('endorseA11y')
    fireEvent.press(btn)
    expect(onEndorse).toHaveBeenCalledWith('p1', false)
  })

  it('does not show endorsement button for discussion posts', () => {
    const discussionPost = { ...baseProposal, postType: 'discussion' }
    render(
      <PostCard
        post={discussionPost}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorsementCount={0}
        endorseLimitReached={false}
        votingRoundStatus="proposals_open"
      />
    )
    expect(screen.queryByLabelText('endorseA11y')).toBeNull()
  })

  it('does not show endorsement button when voting_open', () => {
    render(
      <PostCard
        post={baseProposal}
        onEndorse={jest.fn()}
        isEndorsed={false}
        endorsementCount={0}
        endorseLimitReached={false}
        votingRoundStatus="voting_open"
      />
    )
    expect(screen.queryByLabelText('endorseA11y')).toBeNull()
  })
})

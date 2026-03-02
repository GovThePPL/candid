import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import BridgingKudosCard from '../../components/cards/BridgingKudosCard'

const mockBridgingKudos = {
  id: 'award-1',
  itemType: 'comment',
  itemId: 'comment-1',
  itemBody: 'I think we can all agree that finding common ground is important.',
  threadTitle: 'Should we invest in renewable energy?',
  upvoteCount: 25,
  downvoteCount: 3,
  bridgingScore: 0.62,
  createdTime: '2026-02-19T12:00:00Z',
}

const mockLocation = { code: 'US', name: 'United States' }
const mockSession = { label: 'Climate Policy' }

describe('BridgingKudosCard', () => {
  it('renders the comment body text', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText(mockBridgingKudos.itemBody)).toBeTruthy()
  })

  it('renders the thread title with scaling and line limit', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    const title = screen.getByText('Should we invest in renewable energy?')
    expect(title).toBeTruthy()
    expect(title.props.adjustsFontSizeToFit).toBe(true)
    expect(title.props.numberOfLines).toBe(2)
  })

  it('renders the bridging kudos title', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('bridgingKudosTitle')).toBeTruthy()
  })

  it('renders vote counts', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('25')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders earned kudos message for comments', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('bridgingKudosEarnedComment')).toBeTruthy()
  })

  it('renders earned kudos message for posts', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={{ ...mockBridgingKudos, itemType: 'post' }}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('bridgingKudosEarnedPost')).toBeTruthy()
  })

  it('has accessibility label and hint', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByLabelText('bridgingKudosA11yLabel')).toBeTruthy()
  })

  it('renders location and session badge', () => {
    render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('US')).toBeTruthy()
    expect(screen.getByText('Climate Policy')).toBeTruthy()
  })

  it('renders without thread title', () => {
    const noThread = { ...mockBridgingKudos, threadTitle: null }
    const { toJSON } = render(
      <BridgingKudosCard
        bridgingKudos={noThread}
        location={mockLocation}
        session={mockSession}
        onDismiss={jest.fn()}
      />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders without location and session', () => {
    const { toJSON } = render(
      <BridgingKudosCard
        bridgingKudos={mockBridgingKudos}
        onDismiss={jest.fn()}
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})

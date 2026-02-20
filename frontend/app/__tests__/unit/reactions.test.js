import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ReactionBar, { REACTIONS } from '../../components/chat/ReactionBar'
import ReactionBadges from '../../components/chat/ReactionBadges'

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, params) => {
      const translations = {
        reactionAgree: 'Agree',
        reactionAppreciate: 'Appreciate',
        reactionGrateful: 'Grateful',
        reactionConsidering: 'Considering',
        reactionRespect: 'Respect',
        addReactionA11y: `React with ${params?.label || ''}`,
        removeReactionA11y: `Remove ${params?.label || ''} reaction`,
        reactionCountA11y: `${params?.label || ''}, ${params?.count || 0} reactions`,
      }
      return translations[key] || key
    },
  }),
}))

// Mock useThemeColors
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primarySurface: '#5C005C',
    cardBackground: '#FFFFFF',
    cardBorder: '#E0E0E0',
    secondaryText: '#666666',
    primary: '#5C005C',
  }),
}))

describe('REACTIONS constant', () => {
  it('has exactly 5 reactions', () => {
    expect(REACTIONS).toHaveLength(5)
  })

  it('has the expected emoji keys', () => {
    const keys = REACTIONS.map(r => r.key)
    expect(keys).toEqual(['agree', 'appreciate', 'grateful', 'considering', 'respect'])
  })
})

describe('ReactionBar', () => {
  it('renders all 5 emoji buttons', () => {
    const onReact = jest.fn()
    const { getAllByRole } = render(
      <ReactionBar currentReaction={null} onReact={onReact} />
    )
    const buttons = getAllByRole('button')
    expect(buttons).toHaveLength(5)
  })

  it('calls onReact with emoji key when tapped', () => {
    const onReact = jest.fn()
    const { getByAccessibilityState } = render(
      <ReactionBar currentReaction={null} onReact={onReact} />
    )
    // Find the first non-selected button (all should be non-selected)
    const { getAllByRole } = render(
      <ReactionBar currentReaction={null} onReact={onReact} />
    )
    const buttons = getAllByRole('button')
    fireEvent.press(buttons[0]) // Agree button
    expect(onReact).toHaveBeenCalledWith('agree')
  })

  it('calls onReact with null when tapping already-selected emoji (toggle off)', () => {
    const onReact = jest.fn()
    const { getAllByRole } = render(
      <ReactionBar currentReaction="agree" onReact={onReact} />
    )
    const buttons = getAllByRole('button')
    fireEvent.press(buttons[0]) // Agree is selected, tap it
    expect(onReact).toHaveBeenCalledWith(null)
  })

  it('calls onReact with new emoji when switching from one to another', () => {
    const onReact = jest.fn()
    const { getAllByRole } = render(
      <ReactionBar currentReaction="agree" onReact={onReact} />
    )
    const buttons = getAllByRole('button')
    fireEvent.press(buttons[2]) // Grateful button (index 2)
    expect(onReact).toHaveBeenCalledWith('grateful')
  })

  it('marks selected emoji with selected accessibility state', () => {
    const onReact = jest.fn()
    const { getAllByRole } = render(
      <ReactionBar currentReaction="grateful" onReact={onReact} />
    )
    const buttons = getAllByRole('button')
    // grateful is index 2
    expect(buttons[2].props.accessibilityState).toEqual({ selected: true })
    expect(buttons[0].props.accessibilityState).toEqual({ selected: false })
  })
})

describe('ReactionBadges', () => {
  const baseReactions = [
    { userId: 'user-1', emoji: 'agree' },
    { userId: 'user-2', emoji: 'agree' },
    { userId: 'user-3', emoji: 'grateful' },
  ]

  it('renders nothing when reactions array is empty', () => {
    const { toJSON } = render(
      <ReactionBadges reactions={[]} currentUserId="user-1" onToggle={jest.fn()} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when reactions is null', () => {
    const { toJSON } = render(
      <ReactionBadges reactions={null} currentUserId="user-1" onToggle={jest.fn()} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders correct number of badge groups', () => {
    const { getAllByRole } = render(
      <ReactionBadges reactions={baseReactions} currentUserId="user-1" onToggle={jest.fn()} />
    )
    const buttons = getAllByRole('button')
    // 2 unique emojis: agree, grateful
    expect(buttons).toHaveLength(2)
  })

  it('displays correct counts in accessibility labels', () => {
    const { getAllByRole } = render(
      <ReactionBadges reactions={baseReactions} currentUserId="user-1" onToggle={jest.fn()} />
    )
    const buttons = getAllByRole('button')
    // First badge should be agree with count 2
    expect(buttons[0].props.accessibilityLabel).toBe('Agree, 2 reactions')
    // Second badge should be grateful with count 1
    expect(buttons[1].props.accessibilityLabel).toBe('Grateful, 1 reactions')
  })

  it('highlights own reaction badge', () => {
    const { getAllByRole } = render(
      <ReactionBadges reactions={baseReactions} currentUserId="user-1" onToggle={jest.fn()} />
    )
    const buttons = getAllByRole('button')
    // user-1 has agree reaction, so first badge should be selected
    expect(buttons[0].props.accessibilityState).toEqual({ selected: true })
    // user-1 does NOT have grateful, so second badge is not selected
    expect(buttons[1].props.accessibilityState).toEqual({ selected: false })
  })

  it('calls onToggle with null when tapping own reaction (remove)', () => {
    const onToggle = jest.fn()
    const { getAllByRole } = render(
      <ReactionBadges reactions={baseReactions} currentUserId="user-1" onToggle={onToggle} />
    )
    const buttons = getAllByRole('button')
    fireEvent.press(buttons[0]) // Agree badge (user-1 has this)
    expect(onToggle).toHaveBeenCalledWith(null)
  })

  it('calls onToggle with emoji key when tapping a badge user has not reacted to', () => {
    const onToggle = jest.fn()
    const { getAllByRole } = render(
      <ReactionBadges reactions={baseReactions} currentUserId="user-1" onToggle={onToggle} />
    )
    const buttons = getAllByRole('button')
    fireEvent.press(buttons[1]) // Grateful badge (user-1 does NOT have this)
    expect(onToggle).toHaveBeenCalledWith('grateful')
  })
})

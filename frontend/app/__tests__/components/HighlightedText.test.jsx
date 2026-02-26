import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

// Mock useThemeColors
const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

// Mock GlossaryContext
const mockMatchPattern = /\b(Filibuster|Gerrymandering|gerrymander)\b/gi
const mockTermMap = new Map([
  ['filibuster', { slug: 'filibuster', term: 'Filibuster', sessionIds: [], locationIds: [], scopeCombine: 'or' }],
  ['gerrymandering', { slug: 'gerrymandering', term: 'Gerrymandering', sessionIds: ['sess1'], locationIds: [], scopeCombine: 'or' }],
  ['gerrymander', { slug: 'gerrymandering', term: 'Gerrymandering', sessionIds: ['sess1'], locationIds: [], scopeCombine: 'or' }],
])

jest.mock('../../contexts/GlossaryContext', () => ({
  useGlossary: () => ({
    matchPattern: mockMatchPattern,
    termMap: mockTermMap,
    getFilteredPattern: jest.fn(() => mockMatchPattern),
  }),
}))

import HighlightedText from '../../components/HighlightedText'

describe('HighlightedText', () => {
  it('renders plain text without matches', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        Hello world
      </HighlightedText>
    )
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('highlights matching terms', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        Learn about Filibuster tactics
      </HighlightedText>
    )
    expect(screen.getByText('Filibuster')).toBeTruthy()
    expect(screen.getByRole('link')).toBeTruthy()
  })

  it('calls onTermPress with slug when term is tapped', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        Learn about Filibuster tactics
      </HighlightedText>
    )
    fireEvent.press(screen.getByRole('link'))
    expect(onTermPress).toHaveBeenCalledWith('filibuster')
  })

  it('highlights multiple terms in one text', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        Filibuster and Gerrymandering are important
      </HighlightedText>
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
  })

  it('renders without highlighting when highlightTerms is false', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress} highlightTerms={false}>
        Learn about Filibuster tactics
      </HighlightedText>
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Learn about Filibuster tactics')).toBeTruthy()
  })

  it('renders without highlighting when onTermPress is not provided', () => {
    render(
      <HighlightedText>
        Learn about Filibuster tactics
      </HighlightedText>
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders non-string children as plain text', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        {42}
      </HighlightedText>
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('handles aliases — gerrymander maps to gerrymandering slug', () => {
    const onTermPress = jest.fn()
    render(
      <HighlightedText onTermPress={onTermPress}>
        The gerrymander strategy
      </HighlightedText>
    )
    fireEvent.press(screen.getByRole('link'))
    expect(onTermPress).toHaveBeenCalledWith('gerrymandering')
  })
})

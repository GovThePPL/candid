import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import ReviewDiffContent from '../../components/wiki/ReviewDiffContent'

const baseOriginal = {
  title: 'Original Title',
  aliases: ['alias1', 'alias2'],
  summary: 'Original summary',
  content: 'Line one\nLine two\nLine three',
  wikiCategory: 'Governance',
  scopes: [{ type: 'location', id: 1, label: 'US' }],
  scopeCombine: 'or',
}

describe('ReviewDiffContent', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders "no changes" state when original equals proposed', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{ ...baseOriginal }}
        isTerm={true}
      />
    )
    expect(screen.getByText('reviewNoChanges')).toBeTruthy()
  })

  it('shows title diff when title changed', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{ ...baseOriginal, title: 'New Title' }}
        isTerm={true}
      />
    )
    expect(screen.getByText('Original Title')).toBeTruthy()
    expect(screen.getByText('New Title')).toBeTruthy()
  })

  it('shows alias chips diff when aliases changed', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{ ...baseOriginal, aliases: ['alias2', 'alias3'] }}
        isTerm={true}
      />
    )
    expect(screen.getByText('alias1')).toBeTruthy()
    expect(screen.getByText('alias3')).toBeTruthy()
  })

  it('shows content diff when content changed', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{ ...baseOriginal, content: 'Line one\nLine modified\nLine three' }}
        isTerm={true}
      />
    )
    expect(screen.getByText('Line modified')).toBeTruthy()
  })

  it('does not show aliases section for pages (isTerm=false)', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{ ...baseOriginal, aliases: ['new-alias'] }}
        isTerm={false}
      />
    )
    expect(screen.queryByText('new-alias')).toBeNull()
  })

  it('shows scope diff when scopes changed', () => {
    render(
      <ReviewDiffContent
        original={baseOriginal}
        proposed={{
          ...baseOriginal,
          scopes: [
            { type: 'location', id: 1, label: 'US' },
            { type: 'category', id: 2, label: 'Elections' },
          ],
        }}
        isTerm={true}
      />
    )
    expect(screen.getByText('Elections')).toBeTruthy()
  })

  it('shows all as added for new items (empty original)', () => {
    const emptyOriginal = {
      title: '',
      aliases: [],
      summary: '',
      content: '',
      wikiCategory: '',
      scopes: [],
      scopeCombine: 'or',
    }
    render(
      <ReviewDiffContent
        original={emptyOriginal}
        proposed={baseOriginal}
        isTerm={true}
      />
    )
    // Title should show as added
    expect(screen.getByText('Original Title')).toBeTruthy()
  })
})

describe('ReviewDiffContent.hasChanges', () => {
  it('returns false when no changes', () => {
    expect(ReviewDiffContent.hasChanges(baseOriginal, { ...baseOriginal }, true)).toBe(false)
  })

  it('returns true when title changed', () => {
    expect(ReviewDiffContent.hasChanges(
      baseOriginal,
      { ...baseOriginal, title: 'Different' },
      true
    )).toBe(true)
  })

  it('returns true when content changed', () => {
    expect(ReviewDiffContent.hasChanges(
      baseOriginal,
      { ...baseOriginal, content: 'Different content' },
      true
    )).toBe(true)
  })

  it('returns true when aliases changed for terms', () => {
    expect(ReviewDiffContent.hasChanges(
      baseOriginal,
      { ...baseOriginal, aliases: ['alias1'] },
      true
    )).toBe(true)
  })

  it('returns false when aliases changed but isTerm=false', () => {
    expect(ReviewDiffContent.hasChanges(
      baseOriginal,
      { ...baseOriginal, aliases: ['different'] },
      false
    )).toBe(false)
  })
})

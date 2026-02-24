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

import ReviewChanges from '../../components/wiki/ReviewChanges'

const baseOriginal = {
  title: 'Original Title',
  aliases: ['alias1', 'alias2'],
  summary: 'Original summary',
  content: 'Line one\nLine two\nLine three',
  wikiCategory: 'Governance',
  scopes: [{ type: 'location', id: 1, label: 'US' }],
  scopeCombine: 'or',
}

const defaultProps = {
  original: baseOriginal,
  proposed: { ...baseOriginal },
  isTerm: true,
  onSubmit: jest.fn(),
  onClose: jest.fn(),
  submitLabel: 'Submit',
  submitting: false,
  error: null,
}

describe('ReviewChanges', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders "no changes" state when original equals proposed', () => {
    render(<ReviewChanges {...defaultProps} />)
    expect(screen.getByText('reviewNoChanges')).toBeTruthy()
    expect(screen.getByText('reviewNoChangesSubtitle')).toBeTruthy()
  })

  it('shows title diff when title changed', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, title: 'New Title' }}
      />
    )
    expect(screen.getByText('Original Title')).toBeTruthy()
    expect(screen.getByText('New Title')).toBeTruthy()
    expect(screen.queryByText('No changes detected')).toBeNull()
  })

  it('shows alias chips diff when aliases changed (terms)', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, aliases: ['alias2', 'alias3'] }}
      />
    )
    // alias1 removed, alias3 added
    expect(screen.getByText('alias1')).toBeTruthy()
    expect(screen.getByText('alias3')).toBeTruthy()
  })

  it('shows compact content diff when content changed', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, content: 'Line one\nLine modified\nLine three' }}
      />
    )
    // Should show the diff lines
    expect(screen.getByText('Line modified')).toBeTruthy()
  })

  it('shows category diff when category changed', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, wikiCategory: 'Elections' }}
      />
    )
    expect(screen.getByText('Governance')).toBeTruthy()
    expect(screen.getByText('Elections')).toBeTruthy()
  })

  it('does not show aliases/scopes sections for pages (isTerm=false)', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        isTerm={false}
        proposed={{ ...baseOriginal, aliases: ['new-alias'] }}
      />
    )
    // With isTerm=false, aliases diff should not appear — only "no changes" or other fields
    expect(screen.queryByText('new-alias')).toBeNull()
  })

  it('submit button disabled when no changes', () => {
    render(<ReviewChanges {...defaultProps} />)
    const button = screen.getByRole('button', { name: 'Submit' })
    expect(button.props.accessibilityState.disabled).toBe(true)
  })

  it('submit button calls onSubmit when pressed', () => {
    const onSubmit = jest.fn()
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, title: 'Changed' }}
        onSubmit={onSubmit}
      />
    )
    const button = screen.getByRole('button', { name: 'Submit' })
    fireEvent.press(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('displays error banner when error prop is set', () => {
    render(
      <ReviewChanges
        {...defaultProps}
        proposed={{ ...baseOriginal, title: 'Changed' }}
        error="Something went wrong"
      />
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
  })
})

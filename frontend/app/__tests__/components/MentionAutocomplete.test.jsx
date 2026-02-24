import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}))

import MentionAutocomplete from '../../components/discuss/MentionAutocomplete'

const participants = [
  { id: 'u1', username: 'alice', displayName: 'Alice Smith' },
  { id: 'u2', username: 'bob', displayName: 'Bob Jones' },
  { id: 'u3', username: 'charlie', displayName: 'Charlie Brown' },
]

describe('MentionAutocomplete', () => {
  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <MentionAutocomplete
        visible={false}
        query=""
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders role entries and participants when visible with empty query', () => {
    render(
      <MentionAutocomplete
        visible={true}
        query=""
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    // Should show role entries
    expect(screen.getByText('@admin')).toBeTruthy()
    expect(screen.getByText('@moderator')).toBeTruthy()
    expect(screen.getByText('@facilitator')).toBeTruthy()
    expect(screen.getByText('@expert')).toBeTruthy()
    // Should show participants
    expect(screen.getByText('@alice')).toBeTruthy()
    expect(screen.getByText('@bob')).toBeTruthy()
  })

  it('filters by query prefix', () => {
    render(
      <MentionAutocomplete
        visible={true}
        query="al"
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('@alice')).toBeTruthy()
    expect(screen.queryByText('@bob')).toBeNull()
    // No role entries start with "al"
    expect(screen.queryByText('@admin')).toBeNull()
  })

  it('filters roles by prefix', () => {
    render(
      <MentionAutocomplete
        visible={true}
        query="ad"
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('@admin')).toBeTruthy()
    expect(screen.queryByText('@moderator')).toBeNull()
  })

  it('calls onSelect with username when item is pressed', () => {
    const onSelect = jest.fn()
    render(
      <MentionAutocomplete
        visible={true}
        query="al"
        participants={participants}
        onSelect={onSelect}
        onDismiss={jest.fn()}
      />
    )
    fireEvent.press(screen.getByText('@alice'))
    expect(onSelect).toHaveBeenCalledWith('alice')
  })

  it('renders nothing when no matches', () => {
    const { toJSON } = render(
      <MentionAutocomplete
        visible={true}
        query="zzz"
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    expect(toJSON()).toBeNull()
  })

  it('matches on displayName prefix too', () => {
    render(
      <MentionAutocomplete
        visible={true}
        query="charlie"
        participants={participants}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    expect(screen.getByText('@charlie')).toBeTruthy()
  })
})

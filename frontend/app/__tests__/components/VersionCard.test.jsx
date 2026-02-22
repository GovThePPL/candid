import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: (date) => '2 hours ago',
}))

import VersionCard from '../../components/wiki/VersionCard'

const mockVersion = {
  id: 'v-1',
  title: 'Gun Policy',
  editedBy: {
    id: 'u-1',
    username: 'admin1',
    displayName: 'Admin One',
    avatarIconUrl: null,
  },
  editedAt: '2026-02-20T10:00:00Z',
}

describe('VersionCard', () => {
  it('renders editor name and date', () => {
    render(<VersionCard version={mockVersion} onPress={jest.fn()} />)
    expect(screen.getByText(/Admin One/)).toBeTruthy()
    expect(screen.getByText('2 hours ago')).toBeTruthy()
  })

  it('renders version title', () => {
    render(<VersionCard version={mockVersion} onPress={jest.fn()} />)
    expect(screen.getByText('Gun Policy')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<VersionCard version={mockVersion} onPress={onPress} />)
    fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('has correct accessibility label', () => {
    render(<VersionCard version={mockVersion} onPress={jest.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.props.accessibilityLabel).toContain('Admin One')
  })

  it('falls back to username when displayName is missing', () => {
    const version = {
      ...mockVersion,
      editedBy: { ...mockVersion.editedBy, displayName: null },
    }
    render(<VersionCard version={version} onPress={jest.fn()} />)
    expect(screen.getByText(/admin1/)).toBeTruthy()
  })
})

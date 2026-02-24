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

jest.mock('../../components/wiki/ReviewDiffContent', () => {
  const { Text } = require('react-native')
  return function MockReviewDiffContent({ original, proposed }) {
    return <Text>Diff: {original.title} → {proposed.title}</Text>
  }
})

jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

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
    render(<VersionCard version={mockVersion} onToggle={jest.fn()} expanded={false} isTerm={false} />)
    expect(screen.getByText(/Admin One/)).toBeTruthy()
    expect(screen.getByText('2 hours ago')).toBeTruthy()
  })

  it('renders version title', () => {
    render(<VersionCard version={mockVersion} onToggle={jest.fn()} expanded={false} isTerm={false} />)
    expect(screen.getByText('Gun Policy')).toBeTruthy()
  })

  it('calls onToggle when tapped', () => {
    const onToggle = jest.fn()
    render(<VersionCard version={mockVersion} onToggle={onToggle} expanded={false} isTerm={false} />)
    fireEvent.press(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('has correct accessibility label and expanded state', () => {
    render(<VersionCard version={mockVersion} onToggle={jest.fn()} expanded={true} isTerm={false} />)
    const btn = screen.getByRole('button')
    expect(btn.props.accessibilityLabel).toContain('Admin One')
    expect(btn.props.accessibilityState).toEqual({ expanded: true })
  })

  it('falls back to username when displayName is missing', () => {
    const version = {
      ...mockVersion,
      editedBy: { ...mockVersion.editedBy, displayName: null },
    }
    render(<VersionCard version={version} onToggle={jest.fn()} expanded={false} isTerm={false} />)
    expect(screen.getAllByText(/admin1/).length).toBeGreaterThan(0)
  })

  it('shows loading indicator when expanded and detailLoading', () => {
    render(
      <VersionCard
        version={mockVersion}
        onToggle={jest.fn()}
        expanded={true}
        detailLoading={true}
        isTerm={false}
      />
    )
    // ActivityIndicator is rendered
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy()
  })

  it('shows diff content when expanded with afterSnapshot', () => {
    const detail = {
      beforeSnapshot: { title: 'Old Title', content: 'old', scopes: [] },
      afterSnapshot: { title: 'New Title', content: 'new', scopes: [] },
    }
    render(
      <VersionCard
        version={mockVersion}
        onToggle={jest.fn()}
        expanded={true}
        versionDetail={detail}
        detailLoading={false}
        isTerm={false}
      />
    )
    expect(screen.getByText('Diff: Old Title → New Title')).toBeTruthy()
  })

  it('shows earliest version banner when no afterSnapshot', () => {
    const detail = {
      beforeSnapshot: { title: 'First Version', content: 'content', scopes: [] },
      afterSnapshot: null,
    }
    render(
      <VersionCard
        version={mockVersion}
        onToggle={jest.fn()}
        expanded={true}
        versionDetail={detail}
        detailLoading={false}
        isTerm={false}
      />
    )
    expect(screen.getByText(/historyEarliestVersion/)).toBeTruthy()
  })

  it('does not show body when collapsed', () => {
    const detail = {
      beforeSnapshot: { title: 'Old', content: 'old', scopes: [] },
      afterSnapshot: { title: 'New', content: 'new', scopes: [] },
    }
    render(
      <VersionCard
        version={mockVersion}
        onToggle={jest.fn()}
        expanded={false}
        versionDetail={detail}
        detailLoading={false}
        isTerm={false}
      />
    )
    expect(screen.queryByText('Diff: Old → New')).toBeNull()
  })
})

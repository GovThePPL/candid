import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import Avatar from '../../components/Avatar'

describe('Avatar', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('renders image when avatar URL is provided', () => {
    const user = { displayName: 'Jane', avatarUrl: 'https://example.com/avatar.png' }
    const { root } = render(<Avatar user={user} />)
    const images = root.findAllByType(require('react-native').Image)
    expect(images.length).toBe(1)
    expect(images[0].props.source.uri).toBe('https://example.com/avatar.png')
  })

  it('shows kudos badge when user has kudosCount > 0', () => {
    const user = { displayName: 'Jane', kudosCount: 5, trustScore: 0.8 }
    render(<Avatar user={user} />)
    // The badge renders a star icon (Ionicons name="star")
    expect(screen.getByText('star')).toBeTruthy()
  })

  it('hides kudos badge when showKudosBadge is false', () => {
    const user = { displayName: 'Jane', kudosCount: 5, trustScore: 0.8 }
    render(<Avatar user={user} showKudosBadge={false} />)
    expect(screen.queryByText('star')).toBeNull()
  })

  it('hides kudos badge when kudosCount is 0', () => {
    const user = { displayName: 'Jane', kudosCount: 0, trustScore: 0.5 }
    render(<Avatar user={user} />)
    expect(screen.queryByText('star')).toBeNull()
  })

  it('handles size presets (sm, md, lg)', () => {
    const user = { displayName: 'A' }

    const { unmount: u1, root: r1 } = render(<Avatar user={user} size="sm" />)
    const outerSm = r1.findAllByType(require('react-native').View)[0]
    expect(outerSm.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 28, height: 28 })])
    )
    u1()

    const { root: r2, unmount: u2 } = render(<Avatar user={user} size="lg" />)
    const outerLg = r2.findAllByType(require('react-native').View)[0]
    expect(outerLg.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 80, height: 80 })])
    )
    u2()
  })

  it('handles numeric size', () => {
    const user = { displayName: 'A' }
    const { root } = render(<Avatar user={user} size={50} />)
    const outer = root.findAllByType(require('react-native').View)[0]
    expect(outer.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 50, height: 50 })])
    )
  })

  it('shows initials for anonymous/null user (defaults to "Anonymous")', () => {
    render(<Avatar user={null} />)
    // user?.displayName || 'Anonymous' => getInitials('Anonymous') => 'A'
    expect(screen.getByText('A')).toBeTruthy()
  })

})

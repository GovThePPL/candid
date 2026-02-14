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

  it('shows badge for bronze+ trust even with 0 kudos', () => {
    const user = { displayName: 'Jane', kudosCount: 0, trustScore: 0.5 }
    render(<Avatar user={user} />)
    // Bronze/silver/gold badge always shows regardless of kudos
    expect(screen.getByText('star')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('hides badge for purple (lowest) tier when kudosCount is 0', () => {
    const user = { displayName: 'Jane', kudosCount: 0, trustScore: 0.2 }
    render(<Avatar user={user} />)
    // Purple tier only shows when user has kudos
    expect(screen.queryByText('star')).toBeNull()
  })

  it('shows purple badge when user has kudos even with low trust', () => {
    const user = { displayName: 'Jane', kudosCount: 3, trustScore: 0.1 }
    render(<Avatar user={user} />)
    expect(screen.getByText('star')).toBeTruthy()
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

  it('shows initials for anonymous/null user (defaults to t("common:anonymous"))', () => {
    render(<Avatar user={null} />)
    // user?.displayName || t('common:anonymous') => getInitials('common:anonymous') => 'C'
    expect(screen.getByText('C')).toBeTruthy()
  })

  it('renders role overlay when role is set', () => {
    const user = { displayName: 'Admin User' }
    render(<Avatar user={user} role="admin" />)
    expect(screen.getByTestId('role-overlay')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('does not render role overlay when role is null', () => {
    const user = { displayName: 'Regular User' }
    render(<Avatar user={user} role={null} />)
    expect(screen.queryByTestId('role-overlay')).toBeNull()
  })

  it('renders role circle inline when inlineBadge and role are set', () => {
    const user = { displayName: 'Mod User' }
    render(<Avatar user={user} role="moderator" inlineBadge />)
    expect(screen.getByTestId('role-overlay')).toBeTruthy()
    expect(screen.getByText('M')).toBeTruthy()
  })

})

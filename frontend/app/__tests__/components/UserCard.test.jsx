import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../lib/timeUtils', () => ({
  formatRelativeTime: () => '3h',
}))

import UserCard from '../../components/UserCard'

const makeUser = (overrides = {}) => ({
  displayName: 'Jane Doe',
  username: 'janedoe',
  avatarUrl: null,
  avatarIconUrl: null,
  kudosCount: 0,
  opinionGroup: null,
  ...overrides,
})

describe('UserCard', () => {
  describe('block variant (default)', () => {
    it('shows role badge', () => {
      render(<UserCard user={makeUser()} role="PROPOSER" />)
      expect(screen.getByText('proposer')).toBeTruthy()
    })

    it('shows kudos badge when kudosCount > 0', () => {
      render(<UserCard user={makeUser({ kudosCount: 5 })} role="PROPOSER" />)
      expect(screen.getByText('star')).toBeTruthy()
    })

    it('handles null/minimal user data', () => {
      const minimalUser = { username: 'anon' }
      render(<UserCard user={minimalUser} role="OPPOSER" />)
      expect(screen.getByText('common:anonymous')).toBeTruthy()
      expect(screen.getByText('@anon')).toBeTruthy()
      expect(screen.getByText('opposer')).toBeTruthy()
    })

    it('shows role overlay on avatar when discussRole is set', () => {
      render(<UserCard user={makeUser()} discussRole="admin" />)
      expect(screen.getByTestId('role-overlay')).toBeTruthy()
    })

    it('wraps username in role-colored pill when discussRole is set', () => {
      render(<UserCard user={makeUser()} discussRole="moderator" />)
      expect(screen.getByTestId('role-username-pill')).toBeTruthy()
      expect(screen.getByText('@janedoe')).toBeTruthy()
    })

    it('does not show role pill when discussRole is null', () => {
      render(<UserCard user={makeUser()} />)
      expect(screen.queryByTestId('role-username-pill')).toBeNull()
      expect(screen.getByText('@janedoe')).toBeTruthy()
    })
  })

  describe('inline variant', () => {
    it('renders single-row with avatar, name, username', () => {
      render(<UserCard variant="inline" user={makeUser()} />)
      expect(screen.getByText('Jane Doe')).toBeTruthy()
      expect(screen.getByText('@janedoe')).toBeTruthy()
    })

    it('renders role circle and username pill when discussRole is set', () => {
      render(<UserCard variant="inline" user={makeUser()} discussRole="moderator" />)
      expect(screen.getByTestId('role-overlay')).toBeTruthy()
      expect(screen.getByTestId('role-username-pill')).toBeTruthy()
    })

    it('renders relative time when timestamp is set', () => {
      render(<UserCard variant="inline" user={makeUser()} timestamp="2026-02-12T10:00:00Z" />)
      expect(screen.getByText('3h')).toBeTruthy()
    })

    it('hides avatar when showAvatar is false', () => {
      const { toJSON } = render(<UserCard variant="inline" user={makeUser()} showAvatar={false} />)
      // The avatar renders initials — "JD" should not be present
      expect(screen.queryByText('JD')).toBeNull()
    })

    it('renders extras', () => {
      const extras = <Text>ExtraBadge</Text>
      render(<UserCard variant="inline" user={makeUser()} extras={extras} />)
      expect(screen.getByText('ExtraBadge')).toBeTruthy()
    })

    it('shows edited indicator when isEdited is true', () => {
      render(<UserCard variant="inline" user={makeUser()} isEdited />)
      expect(screen.getByText('discuss:edited')).toBeTruthy()
    })

    it('uses inverse colors when colorScheme is onBrand', () => {
      render(<UserCard variant="inline" user={makeUser()} colorScheme="onBrand" />)
      // Name should use 'inverse' color — confirm it renders
      expect(screen.getByText('Jane Doe')).toBeTruthy()
    })

    it('renders prefix label', () => {
      render(<UserCard variant="inline" user={makeUser()} label="Reported by" />)
      expect(screen.getByText('Reported by')).toBeTruthy()
    })

    it('falls back to username when displayName missing', () => {
      render(<UserCard variant="inline" user={{ username: 'fallback' }} />)
      expect(screen.getByText('fallback')).toBeTruthy()
    })

    it('falls back to anonymous when user is null', () => {
      render(<UserCard variant="inline" user={null} />)
      expect(screen.getByText('common:anonymous')).toBeTruthy()
    })
  })
})

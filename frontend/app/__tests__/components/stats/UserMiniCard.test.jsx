import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { LightTheme } from '../../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import UserMiniCard from '../../../components/stats/UserMiniCard'

const makeUser = (overrides = {}) => ({
  displayName: 'Jane Doe',
  username: 'janedoe',
  avatarUrl: null,
  avatarIconUrl: null,
  kudosCount: 0,
  opinionGroup: null,
  ...overrides,
})

describe('UserMiniCard', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('shows role badge', () => {
    render(<UserMiniCard user={makeUser()} role="PROPOSER" />)
    // t('proposer') in 'stats' namespace returns the key
    expect(screen.getByText('proposer')).toBeTruthy()
  })

  it('shows kudos badge when kudosCount > 0', () => {
    render(<UserMiniCard user={makeUser({ kudosCount: 5 })} role="PROPOSER" />)
    // The kudos badge renders a star icon
    expect(screen.getByText('star')).toBeTruthy()
  })

  it('handles null/minimal user data', () => {
    const minimalUser = { username: 'anon' }
    render(<UserMiniCard user={minimalUser} role="OPPOSER" />)
    // displayName is undefined, so component should show translated 'anonymous'
    expect(screen.getByText('common:anonymous')).toBeTruthy()
    expect(screen.getByText('@anon')).toBeTruthy()
    expect(screen.getByText('opposer')).toBeTruthy()
  })
})

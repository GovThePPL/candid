import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import RoleBadge from '../../components/discuss/RoleBadge'

describe('RoleBadge', () => {
  it('returns null for null role', () => {
    const { toJSON } = render(<RoleBadge role={null} />)
    expect(toJSON()).toBeNull()
  })

  it('returns null for undefined role', () => {
    const { toJSON } = render(<RoleBadge role={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('returns null for unknown role', () => {
    const { toJSON } = render(<RoleBadge role="superadmin" />)
    expect(toJSON()).toBeNull()
  })

  it.each([
    ['admin', 'roleAdmin'],
    ['moderator', 'roleModerator'],
    ['facilitator', 'roleFacilitator'],
    ['assistant_moderator', 'roleAssistantModerator'],
    ['expert', 'roleExpert'],
    ['liaison', 'roleLiaison'],
  ])('renders badge for %s with translated label', (role, expectedKey) => {
    render(<RoleBadge role={role} />)
    // The mock t() returns the key directly
    expect(screen.getByText(expectedKey)).toBeTruthy()
  })

  it('sets accessibilityLabel on the badge container', () => {
    render(<RoleBadge role="admin" />)
    expect(screen.getByLabelText('roleAdmin')).toBeTruthy()
  })

  it('shows location · role on single line when no session', () => {
    render(<RoleBadge role="admin" location="US" />)
    expect(screen.getByText('US · roleAdmin')).toBeTruthy()
  })

  it('renders two lines when session is provided', () => {
    render(<RoleBadge role="expert" location="OR" session="Healthcare" />)
    // Line 1: scope, Line 2: role
    expect(screen.getByText('OR · Healthcare')).toBeTruthy()
    expect(screen.getByText('roleExpert')).toBeTruthy()
    // Accessibility label includes all parts
    expect(screen.getByLabelText('OR · Healthcare · roleExpert')).toBeTruthy()
  })

  it('shows location · role when session is null', () => {
    render(<RoleBadge role="moderator" location="US" session={null} />)
    expect(screen.getByText('US · roleModerator')).toBeTruthy()
  })
})

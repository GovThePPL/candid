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
})

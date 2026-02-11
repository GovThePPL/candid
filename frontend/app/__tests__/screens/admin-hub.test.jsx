import React from 'react'
import { render, screen, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({
    user: {
      id: 'u1',
      username: 'admin1',
      roles: [
        { role: 'admin', locationId: 'loc1', positionCategoryId: null },
        { role: 'moderator', locationId: 'loc2', positionCategoryId: 'cat1' },
      ],
    },
  }),
}))

const mockGetRoleRequests = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {
    admin: {
      getRoleRequests: (...args) => mockGetRoleRequests(...args),
    },
  },
}))

jest.mock('../../lib/roles', () => ({
  ROLE_LABEL_KEYS: {
    admin: 'roleAdmin',
    moderator: 'roleModerator',
    facilitator: 'roleFacilitator',
  },
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader() {
    return <Text>Header</Text>
  }
})

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

import AdminHub from '../../app/(dashboard)/admin/index'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRoleRequests.mockResolvedValue([])
})

describe('Admin Hub screen', () => {
  it('renders page title', () => {
    render(<AdminHub />)
    expect(screen.getByText('adminPanel')).toBeTruthy()
  })

  it('shows your roles section', () => {
    render(<AdminHub />)
    expect(screen.getByText('yourRoles')).toBeTruthy()
  })

  it('displays user role badges', () => {
    render(<AdminHub />)
    expect(screen.getByText('roleAdmin')).toBeTruthy()
    expect(screen.getByText('roleModerator')).toBeTruthy()
  })

  it('shows menu items for roles, request log, locations', () => {
    render(<AdminHub />)
    expect(screen.getByText('menuRoles')).toBeTruthy()
    expect(screen.getByText('menuRequestLog')).toBeTruthy()
    expect(screen.getByText('menuLocations')).toBeTruthy()
  })

  it('fetches pending count on mount', async () => {
    mockGetRoleRequests.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }])
    render(<AdminHub />)

    await waitFor(() => {
      expect(mockGetRoleRequests).toHaveBeenCalledWith('pending')
    })
  })

  it('shows pending count badge when there are pending requests', async () => {
    mockGetRoleRequests.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }])
    render(<AdminHub />)

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy()
    })
  })

  it('menu items have accessibilityRole button', () => {
    render(<AdminHub />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)
  })
})

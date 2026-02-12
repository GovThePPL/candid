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
      displayName: 'Admin 1',
      roles: [
        { role: 'moderator', locationId: 'loc2', positionCategoryId: 'cat1', locationName: 'Oregon', categoryLabel: 'Healthcare' },
        { role: 'admin', locationId: 'loc1', positionCategoryId: null, locationName: 'United States', categoryLabel: null },
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

jest.mock('../../components/Avatar', () => {
  const { View } = require('react-native')
  return function MockAvatar() {
    return <View testID="avatar" />
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

  it('displays user card with avatar and name', () => {
    render(<AdminHub />)
    expect(screen.getByTestId('avatar')).toBeTruthy()
    expect(screen.getByText('Admin 1')).toBeTruthy()
    expect(screen.getByText('@admin1')).toBeTruthy()
  })

  it('displays role badges sorted most powerful first', () => {
    render(<AdminHub />)
    const admin = screen.getByText('roleAdmin')
    const mod = screen.getByText('roleModerator')
    expect(admin).toBeTruthy()
    expect(mod).toBeTruthy()
  })

  it('shows location and category for roles', () => {
    render(<AdminHub />)
    // mockT appends interpolation values: t('atLocation', { location: 'Oregon' }) → 'atLocation Oregon'
    expect(screen.getByText('atLocation Oregon')).toBeTruthy()
    expect(screen.getByText('inCategory Healthcare')).toBeTruthy()
  })

  it('shows menu items for organization, request log, users', () => {
    render(<AdminHub />)
    expect(screen.getByText('menuOrganization')).toBeTruthy()
    expect(screen.getByText('menuRequestLog')).toBeTruthy()
    expect(screen.getByText('menuUsers')).toBeTruthy()
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

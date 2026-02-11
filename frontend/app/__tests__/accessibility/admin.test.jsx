import React from 'react'
import { render, screen } from '@testing-library/react-native'
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
      ],
    },
  }),
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {
    admin: {
      getRoleRequests: jest.fn(() => Promise.resolve([])),
      listRoles: jest.fn(() => Promise.resolve([])),
      searchUsers: jest.fn(() => Promise.resolve([])),
    },
    users: {
      getAllLocations: jest.fn(() => Promise.resolve([])),
    },
    categories: {
      getAll: jest.fn(() => Promise.resolve([])),
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
  const { View } = require('react-native')
  return () => <View testID="header" />
})

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title }) {
    return <Text>{title}</Text>
  }
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return ({ children, visible }) => visible ? <View>{children}</View> : null
})

jest.mock('../../components/Toast', () => ({
  useToast: () => ({ show: jest.fn() }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

import AdminHub from '../../app/(dashboard)/admin/index'

describe('Admin Hub accessibility', () => {
  test('menu items have button role and labels', () => {
    render(<AdminHub />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: /menuRoles/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /menuRequestLog/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /menuLocations/i })).toBeTruthy()
  })

  test('role badges are readable', () => {
    render(<AdminHub />)
    expect(screen.getByText('roleAdmin')).toBeTruthy()
  })
})

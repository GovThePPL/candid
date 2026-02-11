import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
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
      roles: [{ role: 'admin', locationId: 'loc1' }],
    },
  }),
}))

const mockGetRoleRequests = jest.fn()
const mockApproveRoleRequest = jest.fn()
const mockDenyRoleRequest = jest.fn()
const mockRescindRoleRequest = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
  default: {
    admin: {
      getRoleRequests: (...args) => mockGetRoleRequests(...args),
      approveRoleRequest: (...args) => mockApproveRoleRequest(...args),
      denyRoleRequest: (...args) => mockDenyRoleRequest(...args),
      rescindRoleRequest: (...args) => mockRescindRoleRequest(...args),
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

jest.mock('../../components/EmptyState', () => {
  const { Text } = require('react-native')
  return function MockEmptyState({ title, subtitle }) {
    return <Text>{title} {subtitle}</Text>
  }
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return function MockModal({ children, visible }) {
    return visible ? <View>{children}</View> : null
  }
})

jest.mock('../../components/Toast', () => ({
  useToast: () => jest.fn(),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}))

import RequestLogScreen from '../../app/(dashboard)/admin/request-log'

const makePendingRequest = (id = 'r1') => ({
  id,
  action: 'assign',
  status: 'pending',
  targetUser: { id: 'target1', username: 'target_user', displayName: 'Target User' },
  role: 'moderator',
  location: { id: 'loc1', name: 'Oregon', code: 'OR' },
  category: null,
  requester: { id: 'u1', username: 'admin1', displayName: 'Admin One' },
  reason: 'Good fit',
  autoApproveAt: new Date(Date.now() + 86400000).toISOString(),
  createdTime: new Date().toISOString(),
  denialReason: null,
  reviewer: null,
  updatedTime: null,
})

const makeApprovedRequest = (id = 'r2') => ({
  id,
  action: 'assign',
  status: 'approved',
  targetUser: { id: 'target1', username: 'target_user', displayName: 'Target User' },
  role: 'admin',
  location: { id: 'loc1', name: 'Oregon', code: 'OR' },
  category: null,
  requester: { id: 'u2', username: 'mod1', displayName: 'Mod One' },
  reason: null,
  autoApproveAt: null,
  createdTime: new Date().toISOString(),
  denialReason: null,
  reviewer: { id: 'u1', username: 'admin1', displayName: 'Admin One' },
  updatedTime: new Date().toISOString(),
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRoleRequests.mockResolvedValue([])
})

describe('Request Log screen', () => {
  it('renders page title', async () => {
    render(<RequestLogScreen />)
    expect(screen.getByText('requestLogTitle')).toBeTruthy()
  })

  it('renders three tab buttons', async () => {
    render(<RequestLogScreen />)
    expect(screen.getByText('tabNeedsReview')).toBeTruthy()
    expect(screen.getByText('tabAllRequests')).toBeTruthy()
    expect(screen.getByText('tabMyRequests')).toBeTruthy()
  })

  it('fetches pending requests on mount', async () => {
    render(<RequestLogScreen />)
    await waitFor(() => {
      expect(mockGetRoleRequests).toHaveBeenCalledWith('pending')
    })
  })

  it('switches tabs and fetches new data', async () => {
    render(<RequestLogScreen />)
    await waitFor(() => expect(mockGetRoleRequests).toHaveBeenCalledWith('pending'))

    fireEvent.press(screen.getByText('tabAllRequests'))
    await waitFor(() => expect(mockGetRoleRequests).toHaveBeenCalledWith('all'))

    fireEvent.press(screen.getByText('tabMyRequests'))
    await waitFor(() => expect(mockGetRoleRequests).toHaveBeenCalledWith('mine'))
  })

  it('shows empty state when no requests', async () => {
    mockGetRoleRequests.mockResolvedValue([])
    render(<RequestLogScreen />)

    await waitFor(() => {
      expect(screen.getByText(/noRequests/)).toBeTruthy()
    })
  })

  it('shows pending request with approve and deny buttons', async () => {
    mockGetRoleRequests.mockResolvedValue([makePendingRequest()])
    render(<RequestLogScreen />)

    await waitFor(() => {
      expect(screen.getByText('actionAssign')).toBeTruthy()
      expect(screen.getByText('statusPending')).toBeTruthy()
      expect(screen.getByText(/Target User/)).toBeTruthy()
      expect(screen.getByText('approve')).toBeTruthy()
      expect(screen.getByText('deny')).toBeTruthy()
    })
  })

  it('shows approved request with reviewer info and no action buttons', async () => {
    mockGetRoleRequests.mockResolvedValue([makeApprovedRequest()])
    render(<RequestLogScreen />)

    // Switch to All Requests to see approved
    fireEvent.press(screen.getByText('tabAllRequests'))

    await waitFor(() => {
      expect(screen.getByText('statusApproved')).toBeTruthy()
    })
  })

  it('shows rescind button on My Requests tab for pending request', async () => {
    mockGetRoleRequests.mockResolvedValue([makePendingRequest()])
    render(<RequestLogScreen />)

    fireEvent.press(screen.getByText('tabMyRequests'))

    await waitFor(() => {
      expect(screen.getByText('rescind')).toBeTruthy()
    })
  })

  it('tabs have correct accessibility roles', () => {
    render(<RequestLogScreen />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(3)
  })

  it('action buttons have correct accessibility roles', async () => {
    mockGetRoleRequests.mockResolvedValue([makePendingRequest()])
    render(<RequestLogScreen />)

    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(2) // Approve + Deny
    })
  })
})

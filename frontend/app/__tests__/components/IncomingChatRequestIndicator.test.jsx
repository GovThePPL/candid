import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockPlayIncomingRequestSound = jest.fn()
const mockInitNativeSounds = jest.fn()
jest.mock('../../lib/sounds', () => ({
  playIncomingRequestSound: (...args) => mockPlayIncomingRequestSound(...args),
  initNativeSounds: (...args) => mockInitNativeSounds(...args),
}))

const mockHapticTap = jest.fn()
jest.mock('../../lib/haptics', () => ({
  hapticTap: (...args) => mockHapticTap(...args),
}))

jest.mock('react-native-svg', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props) => React.createElement('Svg', props),
    Circle: (props) => React.createElement('Circle', props),
    G: (props) => React.createElement('G', props),
  }
})

import IncomingChatRequestIndicator from '../../components/IncomingChatRequestIndicator'

const mockRequest = {
  type: 'chat_request',
  data: {
    id: 'req-1',
    createdTime: new Date().toISOString(),
    requester: {
      id: 'user-1',
      displayName: 'Alice Smith',
      username: 'alice',
      avatarIconUrl: null,
    },
    position: { id: 'pos-1', statement: 'Test position' },
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('IncomingChatRequestIndicator', () => {
  it('renders requester avatar and name', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    expect(screen.getByText('Alice Smith')).toBeTruthy()
    expect(screen.getByText('@alice')).toBeTruthy()
  })

  it('renders nothing when incomingRequest is null', () => {
    const { toJSON } = render(<IncomingChatRequestIndicator incomingRequest={null} onExpire={jest.fn()} />)
    expect(toJSON()).toBeNull()
  })

  it('navigates to /cards on press', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    fireEvent.press(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/cards')
  })

  it('plays sound and triggers haptic on mount', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    expect(mockPlayIncomingRequestSound).toHaveBeenCalledTimes(1)
    expect(mockHapticTap).toHaveBeenCalledTimes(1)
  })

  it('plays sound and haptic every 15 seconds', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    expect(mockPlayIncomingRequestSound).toHaveBeenCalledTimes(1)

    act(() => { jest.advanceTimersByTime(15000) })
    expect(mockPlayIncomingRequestSound).toHaveBeenCalledTimes(2)
    expect(mockHapticTap).toHaveBeenCalledTimes(2)

    act(() => { jest.advanceTimersByTime(15000) })
    expect(mockPlayIncomingRequestSound).toHaveBeenCalledTimes(3)
    expect(mockHapticTap).toHaveBeenCalledTimes(3)
  })

  it('calls onExpire when countdown reaches zero', () => {
    const onExpire = jest.fn()
    // Create request that was created 119 seconds ago (1 second remaining)
    const createdTime = new Date(Date.now() - 119000).toISOString()
    const request = {
      ...mockRequest,
      data: { ...mockRequest.data, createdTime },
    }
    render(<IncomingChatRequestIndicator incomingRequest={request} onExpire={onExpire} />)

    act(() => { jest.advanceTimersByTime(2000) })
    expect(onExpire).toHaveBeenCalled()
  })

  it('has correct accessibility label', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.props.accessibilityLabel).toContain('Alice Smith')
  })

  it('has correct accessibility hint', () => {
    render(<IncomingChatRequestIndicator incomingRequest={mockRequest} onExpire={jest.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.props.accessibilityHint).toBe('viewChatRequestHint')
  })
})

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockLogin = jest.fn()
const mockSocialLogin = jest.fn()
jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({
    login: mockLogin,
    socialLogin: mockSocialLogin,
    pendingSocialLogin: null,
    completeSocialSignup: jest.fn(),
    clearPendingSocialLogin: jest.fn(),
  }),
}))

jest.mock('../../lib/keycloak', () => ({
  sendPhoneVerification: jest.fn(),
  confirmPhoneVerification: jest.fn(),
}))

jest.mock('../../contexts/ThemeContext', () => ({
  ...jest.requireActual('../../contexts/ThemeContext'),
  useTheme: () => ({ colors: require('../../constants/Colors').LightTheme, isDark: false }),
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  translateError: (msg) => msg,
}))

jest.mock('../../components/LanguagePicker', () => {
  const { Text } = require('react-native')
  return function MockLanguagePicker() {
    return <Text>LanguagePicker</Text>
  }
})

// Mock SocialLoginButtons — expose isSocialLoginEnabled for per-test override
let mockSocialLoginEnabled = false
jest.mock('../../components/SocialLoginButtons', () => {
  const { Text } = require('react-native')
  const component = function MockSocialLoginButtons() {
    return <Text>SocialLoginButtons</Text>
  }
  return {
    __esModule: true,
    default: component,
    isSocialLoginEnabled: () => mockSocialLoginEnabled,
  }
})

import Login from '../../app/(auth)/login'

beforeEach(() => {
  jest.clearAllMocks()
  mockLogin.mockResolvedValue()
  mockSocialLoginEnabled = false
})

describe('Login screen — no social login configured', () => {
  it('renders username and password inputs directly', () => {
    render(<Login />)
    expect(screen.getByPlaceholderText('usernamePlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('passwordPlaceholder')).toBeTruthy()
  })

  it('does not render "Login with Username" button', () => {
    render(<Login />)
    expect(screen.queryByText('loginWithUsername')).toBeNull()
  })

  it('shows error when submitting empty fields', async () => {
    render(<Login />)
    fireEvent.press(screen.getByText('signIn'))

    await waitFor(() => {
      expect(screen.getByText('usernamePasswordRequired')).toBeTruthy()
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('calls login with trimmed username and password', async () => {
    render(<Login />)

    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), '  alice  ')
    fireEvent.changeText(screen.getByPlaceholderText('passwordPlaceholder'), 'secret123')

    await act(async () => {
      fireEvent.press(screen.getByText('signIn'))
    })

    expect(mockLogin).toHaveBeenCalledWith('alice', 'secret123')
  })

  it('shows error on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))

    render(<Login />)

    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'alice')
    fireEvent.changeText(screen.getByPlaceholderText('passwordPlaceholder'), 'wrong')

    await act(async () => {
      fireEvent.press(screen.getByText('signIn'))
    })

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy()
    })
  })

  it('shows loading state while logging in', async () => {
    let resolveLogin
    mockLogin.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve }))

    render(<Login />)

    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'alice')
    fireEvent.changeText(screen.getByPlaceholderText('passwordPlaceholder'), 'pass')

    await act(async () => {
      fireEvent.press(screen.getByText('signIn'))
    })

    expect(screen.getByText('signingIn')).toBeTruthy()

    await act(async () => {
      resolveLogin()
    })
  })

  it('renders register link', () => {
    render(<Login />)
    expect(screen.getByText('createAccountLink')).toBeTruthy()
  })
})

describe('Login screen — social login configured', () => {
  beforeEach(() => {
    mockSocialLoginEnabled = true
  })

  it('renders social buttons and "Login with Username" button', () => {
    render(<Login />)
    expect(screen.getByText('SocialLoginButtons')).toBeTruthy()
    expect(screen.getByText('loginWithUsername')).toBeTruthy()
  })

  it('does not render credential form initially', () => {
    render(<Login />)
    expect(screen.queryByPlaceholderText('usernamePlaceholder')).toBeNull()
  })

  it('shows credential form after pressing "Login with Username"', async () => {
    render(<Login />)

    await act(async () => {
      fireEvent.press(screen.getByText('loginWithUsername'))
    })

    expect(screen.getByPlaceholderText('usernamePlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('passwordPlaceholder')).toBeTruthy()
    expect(screen.getByText('signIn')).toBeTruthy()
    expect(screen.getByText('createAccountLink')).toBeTruthy()
  })

  it('shows "back to options" link in credential view', async () => {
    render(<Login />)

    await act(async () => {
      fireEvent.press(screen.getByText('loginWithUsername'))
    })

    expect(screen.getByText('backToOptions')).toBeTruthy()
  })
})

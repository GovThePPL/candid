import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockLogin = jest.fn()
jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({ login: mockLogin }),
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

import Login from '../../app/(auth)/login'

beforeEach(() => {
  jest.clearAllMocks()
  mockLogin.mockResolvedValue()
})

describe('Login screen', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('renders username and password inputs', () => {
    render(<Login />)
    expect(screen.getByPlaceholderText('usernamePlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('passwordPlaceholder')).toBeTruthy()
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

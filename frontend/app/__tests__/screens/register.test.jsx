import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockRegister = jest.fn()
jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({ register: mockRegister }),
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

import Register from '../../app/(auth)/register'

beforeEach(() => {
  jest.clearAllMocks()
  mockRegister.mockResolvedValue()
})

describe('Register screen', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  it('renders username, email, and password inputs', () => {
    render(<Register />)
    expect(screen.getByPlaceholderText('usernamePlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('emailPlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('passwordMinPlaceholder')).toBeTruthy()
  })

  it('shows error when username is empty', async () => {
    render(<Register />)
    fireEvent.press(screen.getByText('createAccount'))

    await waitFor(() => {
      expect(screen.getByText('usernameRequired')).toBeTruthy()
    })
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('shows error when username is too short', async () => {
    render(<Register />)
    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'ab')
    fireEvent.press(screen.getByText('createAccount'))

    await waitFor(() => {
      expect(screen.getByText('usernameMinLength')).toBeTruthy()
    })
  })

  it('shows error for invalid email', async () => {
    render(<Register />)
    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'alice')
    fireEvent.changeText(screen.getByPlaceholderText('emailPlaceholder'), 'notanemail')
    fireEvent.press(screen.getByText('createAccount'))

    await waitFor(() => {
      expect(screen.getByText('emailRequired')).toBeTruthy()
    })
  })

  it('shows error when password is too short', async () => {
    render(<Register />)
    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'alice')
    fireEvent.changeText(screen.getByPlaceholderText('emailPlaceholder'), 'alice@test.com')
    fireEvent.changeText(screen.getByPlaceholderText('passwordMinPlaceholder'), 'short')
    fireEvent.press(screen.getByText('createAccount'))

    await waitFor(() => {
      expect(screen.getByText('passwordMinLength')).toBeTruthy()
    })
  })

  it('calls register with trimmed values on valid submit', async () => {
    render(<Register />)
    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), '  alice  ')
    fireEvent.changeText(screen.getByPlaceholderText('emailPlaceholder'), '  alice@test.com  ')
    fireEvent.changeText(screen.getByPlaceholderText('passwordMinPlaceholder'), 'password123')

    await act(async () => {
      fireEvent.press(screen.getByText('createAccount'))
    })

    expect(mockRegister).toHaveBeenCalledWith({
      username: 'alice',
      email: 'alice@test.com',
      password: 'password123',
    })
  })

  it('shows error on registration failure', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Username taken'))

    render(<Register />)
    fireEvent.changeText(screen.getByPlaceholderText('usernamePlaceholder'), 'alice')
    fireEvent.changeText(screen.getByPlaceholderText('emailPlaceholder'), 'alice@test.com')
    fireEvent.changeText(screen.getByPlaceholderText('passwordMinPlaceholder'), 'password123')

    await act(async () => {
      fireEvent.press(screen.getByText('createAccount'))
    })

    await waitFor(() => {
      expect(screen.getByText('Username taken')).toBeTruthy()
    })
  })

})

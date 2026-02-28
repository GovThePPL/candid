import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'

// Mock dependencies
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButton: ({ onPress, ...props }) => {
    const { Pressable, Text } = require('react-native')
    return (
      <Pressable onPress={onPress} {...props} testID="apple-native-button">
        <Text>Sign in with Apple</Text>
      </Pressable>
    )
  },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
}))

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
}))

// Mock the user hook to provide socialLogin
const mockSocialLogin = jest.fn()
jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({
    socialLogin: mockSocialLogin,
  }),
}))

// Mock theme
jest.mock('../../contexts/ThemeContext', () => ({
  ...jest.requireActual('../../contexts/ThemeContext'),
  useTheme: () => ({
    colors: {
      cardBackground: '#FFFFFF',
      cardBorder: '#E0E0E0',
      darkText: '#333333',
    },
    isDark: false,
  }),
}))

jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    cardBackground: '#FFFFFF',
    cardBorder: '#E0E0E0',
    darkText: '#333333',
  }),
}))

// Mock the Google logo asset
jest.mock('../../assets/google-g.png', () => 'google-g-mock')

import SocialLoginButtons, { isSocialLoginEnabled } from '../../components/SocialLoginButtons'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isSocialLoginEnabled', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS
    delete process.env.EXPO_PUBLIC_APPLE_SERVICE_ID
  })

  it('returns false when no env vars are set', () => {
    expect(isSocialLoginEnabled()).toBe(false)
  })

  it('returns true when EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB is set', () => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB = 'test-id'
    expect(isSocialLoginEnabled()).toBe(true)
  })

  it('returns true when EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS is set', () => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS = 'ios-id'
    expect(isSocialLoginEnabled()).toBe(true)
  })

  it('returns true when EXPO_PUBLIC_APPLE_SERVICE_ID is set', () => {
    process.env.EXPO_PUBLIC_APPLE_SERVICE_ID = 'apple-id'
    expect(isSocialLoginEnabled()).toBe(true)
  })
})

describe('SocialLoginButtons component', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB = 'test-client-id'
  })

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB
  })

  it('renders null when social login is not enabled', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB
    const { toJSON } = render(<SocialLoginButtons />)
    expect(toJSON()).toBeNull()
  })

  it('renders Google button on all platforms', () => {
    const { getByLabelText } = render(<SocialLoginButtons />)
    expect(getByLabelText(/google/i)).toBeTruthy()
  })

  it('renders Apple button on iOS', () => {
    const originalPlatform = Platform.OS
    Platform.OS = 'ios'
    try {
      const { getByTestId } = render(<SocialLoginButtons />)
      expect(getByTestId('apple-native-button')).toBeTruthy()
    } finally {
      Platform.OS = originalPlatform
    }
  })

  it('does not render Apple button on Android', () => {
    const originalPlatform = Platform.OS
    Platform.OS = 'android'
    try {
      const { queryByLabelText } = render(<SocialLoginButtons />)
      expect(queryByLabelText(/apple/i)).toBeNull()
    } finally {
      Platform.OS = originalPlatform
    }
  })

  it('renders the "or" divider by default', () => {
    const { getByText } = render(<SocialLoginButtons />)
    expect(getByText('orDivider')).toBeTruthy()
  })

  it('hides divider when showDivider is false', () => {
    const { queryByText } = render(<SocialLoginButtons showDivider={false} />)
    expect(queryByText('orDivider')).toBeNull()
  })

  it('calls socialLogin with google provider on Google button press', async () => {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin')
    GoogleSignin.signIn.mockResolvedValueOnce({ data: { idToken: 'google-id-token' } })
    mockSocialLogin.mockResolvedValueOnce({})

    const originalPlatform = Platform.OS
    Platform.OS = 'android'
    try {
      const { getByLabelText } = render(<SocialLoginButtons />)
      fireEvent.press(getByLabelText(/google/i))

      await waitFor(() => {
        expect(mockSocialLogin).toHaveBeenCalledWith('google', 'google-id-token')
      })
    } finally {
      Platform.OS = originalPlatform
    }
  })

  it('calls onError when Google sign-in fails', async () => {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin')
    GoogleSignin.signIn.mockRejectedValueOnce(new Error('sign in failed'))
    const onError = jest.fn()

    const originalPlatform = Platform.OS
    Platform.OS = 'android'
    try {
      const { getByLabelText } = render(<SocialLoginButtons onError={onError} />)
      fireEvent.press(getByLabelText(/google/i))

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })
    } finally {
      Platform.OS = originalPlatform
    }
  })

  it('does not call onError when user cancels Google sign-in', async () => {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin')
    const cancelError = new Error('cancelled')
    cancelError.code = 'SIGN_IN_CANCELLED'
    GoogleSignin.signIn.mockRejectedValueOnce(cancelError)
    const onError = jest.fn()

    const originalPlatform = Platform.OS
    Platform.OS = 'android'
    try {
      const { getByLabelText } = render(<SocialLoginButtons onError={onError} />)
      fireEvent.press(getByLabelText(/google/i))

      await waitFor(() => {
        expect(GoogleSignin.signIn).toHaveBeenCalled()
      })
      // Wait a tick to ensure no late calls
      await new Promise(r => setTimeout(r, 50))
      expect(onError).not.toHaveBeenCalled()
    } finally {
      Platform.OS = originalPlatform
    }
  })
})

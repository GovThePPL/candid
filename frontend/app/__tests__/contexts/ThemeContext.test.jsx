import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Un-mock ThemeContext (jest.setup.js stubs it out globally)
// We need the real module for these tests
jest.unmock('../../contexts/ThemeContext')

// Mock useColorScheme
let mockColorScheme = 'light'
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}))

import { ThemeProvider, useTheme } from '../../contexts/ThemeContext'
import { LightTheme, DarkTheme } from '../../constants/Colors'

beforeEach(() => {
  jest.clearAllMocks()
  mockColorScheme = 'light'
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.setItem.mockResolvedValue()
})

function renderThemeHook() {
  return renderHook(() => useTheme(), {
    wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
  })
}

describe('ThemeProvider', () => {
  it('defaults to light theme', async () => {
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.colors).toBe(LightTheme)
    })
    expect(result.current.isDark).toBe(false)
    expect(result.current.themePreference).toBe('light')
  })

  it('loads stored "dark" preference', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('dark')
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.isDark).toBe(true)
    })
    expect(result.current.colors).toBe(DarkTheme)
    expect(result.current.themePreference).toBe('dark')
  })

  it('loads stored "system" preference and uses device scheme', async () => {
    mockColorScheme = 'dark'
    AsyncStorage.getItem.mockResolvedValueOnce('system')
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.themePreference).toBe('system')
    })
    expect(result.current.isDark).toBe(true)
    expect(result.current.colors).toBe(DarkTheme)
  })

  it('system preference defaults to light when device scheme is null', async () => {
    mockColorScheme = null
    AsyncStorage.getItem.mockResolvedValueOnce('system')
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.themePreference).toBe('system')
    })
    expect(result.current.isDark).toBe(false)
    expect(result.current.colors).toBe(LightTheme)
  })

  it('provides correct colors for light theme', async () => {
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.colors.background).toBe(LightTheme.background)
    })
  })

  it('provides correct colors for dark theme', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('dark')
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.colors.background).toBe(DarkTheme.background)
    })
  })

  it('setThemePreference persists to AsyncStorage', async () => {
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.themePreference).toBe('light')
    })

    act(() => {
      result.current.setThemePreference('dark')
    })

    expect(result.current.themePreference).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@candid_theme_preference',
      'dark'
    )
  })

  it('ignores invalid stored preferences', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('invalid')
    const { result } = renderThemeHook()
    await waitFor(() => {
      expect(result.current.themePreference).toBe('light')
    })
  })
})

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    // Suppress console.error for the expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useTheme())
    }).toThrow('useTheme must be used within a ThemeProvider')
    spy.mockRestore()
  })
})

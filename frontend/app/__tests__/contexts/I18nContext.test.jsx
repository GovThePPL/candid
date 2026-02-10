import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Un-mock I18nContext (jest.setup.js stubs it out)
jest.unmock('../../contexts/I18nContext')

// Mock expo-localization
let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }]
jest.mock('expo-localization', () => ({
  getLocales: () => mockLocales,
}))

// Mock i18n module — define the mock object inside the factory to avoid TDZ
const _i18nMock = {}
jest.mock('../../i18n', () => {
  _i18nMock.changeLanguage = jest.fn()
  return {
    __esModule: true,
    default: {
      language: 'en',
      changeLanguage: _i18nMock.changeLanguage,
    },
  }
})

import { I18nProvider, useI18n, SUPPORTED_LANGUAGES } from '../../contexts/I18nContext'

beforeEach(() => {
  jest.clearAllMocks()
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }]
  AsyncStorage.getItem.mockResolvedValue(null)
  AsyncStorage.setItem.mockResolvedValue()
  if (_i18nMock.changeLanguage) _i18nMock.changeLanguage.mockResolvedValue()
})

function renderI18nHook() {
  return renderHook(() => useI18n(), {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  })
}

describe('I18nProvider', () => {
  it('defaults to system preference', async () => {
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.languagePreference).toBe('system')
    })
  })

  it('resolves device language for system preference', async () => {
    mockLocales = [{ languageCode: 'es', languageTag: 'es-MX' }]
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.language).toBe('es')
    })
    expect(result.current.languagePreference).toBe('system')
  })

  it('falls back to en for unsupported device language', async () => {
    mockLocales = [{ languageCode: 'fr', languageTag: 'fr-FR' }]
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.language).toBe('en')
    })
  })

  it('loads stored language preference', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('es')
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.languagePreference).toBe('es')
    })
    expect(result.current.language).toBe('es')
  })

  it('setLanguagePreference persists and syncs i18next', async () => {
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.languagePreference).toBe('system')
    })

    act(() => {
      result.current.setLanguagePreference('es')
    })

    expect(result.current.languagePreference).toBe('es')
    expect(result.current.language).toBe('es')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@candid_language_preference',
      'es'
    )
  })

  it('ignores invalid stored preference', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('zh')
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.languagePreference).toBe('system')
    })
  })

  it('loads stored "system" preference', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('system')
    const { result } = renderI18nHook()
    await waitFor(() => {
      expect(result.current.languagePreference).toBe('system')
    })
  })
})

describe('useI18n', () => {
  it('throws when used outside I18nProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useI18n())
    }).toThrow('useI18n must be used within an I18nProvider')
    spy.mockRestore()
  })
})

describe('SUPPORTED_LANGUAGES', () => {
  it('includes en and es', () => {
    expect(SUPPORTED_LANGUAGES).toContain('en')
    expect(SUPPORTED_LANGUAGES).toContain('es')
  })
})

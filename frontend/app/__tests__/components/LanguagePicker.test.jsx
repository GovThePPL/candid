import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockSetLanguagePreference = jest.fn()
jest.mock('../../contexts/I18nContext', () => ({
  useI18n: () => ({
    language: 'en',
    languagePreference: 'en',
    setLanguagePreference: mockSetLanguagePreference,
  }),
  SUPPORTED_LANGUAGES: ['en', 'es'],
}))

import LanguagePicker from '../../components/LanguagePicker'

describe('LanguagePicker', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('pills variant (default)', () => {
    it('renders system option', () => {
      render(<LanguagePicker />)
      // System option text uses the t('systemLanguage') key
      expect(screen.getByText('systemLanguage')).toBeTruthy()
    })

    it('highlights current language preference', () => {
      render(<LanguagePicker />)
      // The "English" pill should be checked since languagePreference is 'en'
      const enPill = screen.getByLabelText('English')
      expect(enPill.props.accessibilityState.checked).toBe(true)

      // Spanish should not be checked
      const esPill = screen.getByLabelText('Espa\u00f1ol')
      expect(esPill.props.accessibilityState.checked).toBe(false)
    })

    it('calls setLanguagePreference on press', () => {
      render(<LanguagePicker />)
      fireEvent.press(screen.getByText('Espa\u00f1ol'))
      expect(mockSetLanguagePreference).toHaveBeenCalledWith('es')
    })
  })

  describe('dropdown variant', () => {
    it('renders trigger button', () => {
      render(<LanguagePicker variant="dropdown" />)
      // Trigger shows the language code "EN"
      expect(screen.getByText('EN')).toBeTruthy()
    })

    it('opens menu on press', () => {
      render(<LanguagePicker variant="dropdown" />)

      // Language options should not be visible yet (inside a modal)
      // Press the trigger to open
      const trigger = screen.getByLabelText('languageA11y English')
      fireEvent.press(trigger)

      // Menu items should now be visible
      expect(screen.getByLabelText('English')).toBeTruthy()
      expect(screen.getByLabelText('Espa\u00f1ol')).toBeTruthy()
    })
  })
})

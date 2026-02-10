import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Mock useThemeColors to return light theme colors
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#5C005C',
    text: '#2C3842',
    title: '#5C005C',
    secondaryText: '#666666',
    placeholderText: '#999999',
    pass: '#CCCCCC',
    navBackground: '#FFFFFF',
    cardBorder: '#E0E0E0',
    badgeText: '#FFFFFF',
  }),
}))

// Mock ThemeContext for components that use it
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#5C005C',
      text: '#2C3842',
      title: '#5C005C',
      secondaryText: '#666666',
      placeholderText: '#999999',
      pass: '#CCCCCC',
    },
    theme: 'light',
  }),
}))

import ThemedText from '../../components/ThemedText'
import ThemedButton from '../../components/ThemedButton'
import Toast, { ToastProvider, useToast } from '../../components/Toast'
import LoadingView from '../../components/LoadingView'
import EmptyState from '../../components/EmptyState'

describe('ThemedText accessibility', () => {
  test('h1 variant has header role', () => {
    render(<ThemedText variant="h1">Page Title</ThemedText>)
    expect(screen.getByRole('header', { name: 'Page Title' })).toBeTruthy()
  })

  test('h2 variant has header role', () => {
    render(<ThemedText variant="h2">Section Title</ThemedText>)
    expect(screen.getByRole('header', { name: 'Section Title' })).toBeTruthy()
  })

  test('h3 variant has header role', () => {
    render(<ThemedText variant="h3">Subsection</ThemedText>)
    expect(screen.getByRole('header', { name: 'Subsection' })).toBeTruthy()
  })

  test('h4 variant has header role', () => {
    render(<ThemedText variant="h4">Small Heading</ThemedText>)
    expect(screen.getByRole('header', { name: 'Small Heading' })).toBeTruthy()
  })

  test('body variant does not have header role', () => {
    render(<ThemedText variant="body">Regular text</ThemedText>)
    expect(screen.queryByRole('header')).toBeNull()
  })

  test('label variant does not have header role', () => {
    render(<ThemedText variant="label">Label text</ThemedText>)
    expect(screen.queryByRole('header')).toBeNull()
  })

  test('no variant does not have header role', () => {
    render(<ThemedText>Plain text</ThemedText>)
    expect(screen.queryByRole('header')).toBeNull()
  })

  test('caller can override accessibilityRole', () => {
    render(<ThemedText variant="h1" accessibilityRole="none">Not a heading</ThemedText>)
    expect(screen.queryByRole('header')).toBeNull()
  })
})

describe('ThemedButton accessibility', () => {
  test('has button role by default', () => {
    render(<ThemedButton onPress={() => {}}>Submit</ThemedButton>)
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  test('auto-derives label from string children', () => {
    render(<ThemedButton onPress={() => {}}>Save Changes</ThemedButton>)
    expect(screen.getByLabelText('Save Changes')).toBeTruthy()
  })

  test('disabled state is exposed', () => {
    render(<ThemedButton onPress={() => {}} disabled>Submit</ThemedButton>)
    const button = screen.getByRole('button', { name: 'Submit' })
    expect(button).toBeDisabled()
  })

  test('enabled state is exposed', () => {
    render(<ThemedButton onPress={() => {}}>Submit</ThemedButton>)
    const button = screen.getByRole('button', { name: 'Submit' })
    expect(button).toBeEnabled()
  })
})

describe('Toast accessibility', () => {
  function ToastTrigger() {
    const showToast = useToast()
    React.useEffect(() => { showToast('Saved!', 60000) }, [])
    return null
  }

  test('has alert role and live region', () => {
    jest.useFakeTimers()
    const { UNSAFE_getByProps } = render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    )
    // Toast container has alert role and polite live region
    const alert = UNSAFE_getByProps({ accessibilityRole: 'alert' })
    expect(alert.props.accessibilityLiveRegion).toBe('polite')
    jest.useRealTimers()
  })
})

describe('LoadingView accessibility', () => {
  test('has live region', () => {
    render(<LoadingView message="Loading data..." />)
    const view = screen.getByLabelText('Loading data...')
    expect(view).toBeTruthy()
    expect(view.props.accessibilityLiveRegion).toBe('polite')
  })

  test('default message is accessible', () => {
    render(<LoadingView />)
    expect(screen.getByLabelText('loading')).toBeTruthy()
  })
})

describe('EmptyState accessibility', () => {
  test('title has header role', () => {
    render(<EmptyState icon="search" title="No results" />)
    expect(screen.getByRole('header', { name: 'No results' })).toBeTruthy()
  })

  test('decorative icon is hidden from accessibility', () => {
    const { UNSAFE_getByProps } = render(<EmptyState icon="search" title="No results" />)
    const icon = UNSAFE_getByProps({ importantForAccessibility: 'no-hide-descendants' })
    expect(icon.props.accessible).toBe(false)
  })
})

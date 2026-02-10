import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockGetRules = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    moderation: {
      getRules: (...args) => mockGetRules(...args),
    },
  },
}))

import ReportModal from '../../components/ReportModal'

const sampleRules = [
  { id: 'rule-1', title: 'Harassment', text: 'No harassing other users' },
  { id: 'rule-2', title: 'Spam', text: 'No spam or repetitive content' },
]

describe('ReportModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRules.mockResolvedValue(sampleRules)
  })

  it('shows loading state initially when visible', async () => {
    // Make getRules hang to observe loading state
    let resolveRules
    mockGetRules.mockReturnValue(new Promise((resolve) => { resolveRules = resolve }))

    render(<ReportModal {...defaultProps} />)

    // While loading, no rule titles should be visible
    expect(screen.queryByText('Harassment')).toBeNull()

    // Resolve to prevent act warnings
    await act(async () => {
      resolveRules(sampleRules)
    })
  })

  it('renders rules after fetch', async () => {
    render(<ReportModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeTruthy()
    })
    expect(screen.getByText('Spam')).toBeTruthy()
    expect(screen.getByText('No harassing other users')).toBeTruthy()
  })

  it('selecting a rule enables submit button', async () => {
    render(<ReportModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeTruthy()
    })

    // Submit button should initially be disabled
    const submitBtn = screen.getByLabelText('submitReport')
    expect(submitBtn.props.accessibilityState.disabled).toBe(true)

    // Select a rule
    fireEvent.press(screen.getByText('Harassment'))

    // Submit should now be enabled
    expect(submitBtn.props.accessibilityState.disabled).toBe(false)
  })

  it('submit button is disabled when no rule is selected', async () => {
    render(<ReportModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeTruthy()
    })

    const submitBtn = screen.getByLabelText('submitReport')
    expect(submitBtn.props.accessibilityState.disabled).toBe(true)
  })

  it('calls onSubmit with selected rule ID and comment', async () => {
    const onSubmit = jest.fn().mockResolvedValue()
    render(<ReportModal {...defaultProps} onSubmit={onSubmit} />)

    await waitFor(() => {
      expect(screen.getByText('Spam')).toBeTruthy()
    })

    // Select second rule
    fireEvent.press(screen.getByText('Spam'))

    // Enter a comment
    const input = screen.getByLabelText('additionalDetails')
    fireEvent.changeText(input, 'This is spam content')

    // Submit
    fireEvent.press(screen.getByLabelText('submitReport'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('rule-2', 'This is spam content')
    })
  })

  it('shows success state after submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue()
    render(<ReportModal {...defaultProps} onSubmit={onSubmit} />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('Harassment'))
    fireEvent.press(screen.getByLabelText('submitReport'))

    await waitFor(() => {
      expect(screen.getByText('reportSubmitted')).toBeTruthy()
    })
  })

  it('comment input works', async () => {
    render(<ReportModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeTruthy()
    })

    const input = screen.getByLabelText('additionalDetails')
    fireEvent.changeText(input, 'test comment')
    expect(input.props.value).toBe('test comment')
  })
})

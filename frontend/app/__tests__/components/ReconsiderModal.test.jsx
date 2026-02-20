import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../constants/SharedStyles', () => ({
  createSharedStyles: () => ({ modalOverlay: {}, modalContent: {} }),
}))

import ReconsiderModal from '../../components/ReconsiderModal'

describe('ReconsiderModal', () => {
  const defaultProps = {
    visible: true,
    countdown: 5,
    onRevise: jest.fn(),
    onSendAnyway: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title and message', () => {
    render(<ReconsiderModal {...defaultProps} />)
    expect(screen.getByText('reconsiderTitle')).toBeTruthy()
    expect(screen.getByText('reconsiderMessage')).toBeTruthy()
  })

  it('renders countdown number while counting', () => {
    render(<ReconsiderModal {...defaultProps} countdown={3} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('does not render countdown when at zero', () => {
    render(<ReconsiderModal {...defaultProps} countdown={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows "Send Anyway" text when countdown reaches zero', () => {
    render(<ReconsiderModal {...defaultProps} countdown={0} />)
    expect(screen.getByText('reconsiderSendAnyway')).toBeTruthy()
  })

  it('does not show Send Anyway text during countdown', () => {
    render(<ReconsiderModal {...defaultProps} countdown={3} />)
    expect(screen.queryByText('reconsiderSendAnyway')).toBeNull()
  })

  it('Revise button calls onRevise', () => {
    const onRevise = jest.fn()
    render(<ReconsiderModal {...defaultProps} onRevise={onRevise} />)
    fireEvent.press(screen.getByRole('button', { name: 'reconsiderReviseA11y' }))
    expect(onRevise).toHaveBeenCalledTimes(1)
  })

  it('Send Anyway button is disabled during countdown', () => {
    const onSendAnyway = jest.fn()
    render(<ReconsiderModal {...defaultProps} countdown={3} onSendAnyway={onSendAnyway} />)
    const btn = screen.getByRole('button', { name: 'reconsiderSendAnywayA11y' })
    expect(btn.props.accessibilityState).toEqual({ disabled: true })
  })

  it('Send Anyway button is enabled after countdown and calls handler', () => {
    const onSendAnyway = jest.fn()
    render(<ReconsiderModal {...defaultProps} countdown={0} onSendAnyway={onSendAnyway} />)
    const btn = screen.getByRole('button', { name: 'reconsiderSendAnywayA11y' })
    expect(btn.props.accessibilityState).toEqual({ disabled: false })
    fireEvent.press(btn)
    expect(onSendAnyway).toHaveBeenCalledTimes(1)
  })

  it('renders heart icon', () => {
    render(<ReconsiderModal {...defaultProps} />)
    expect(screen.getByText('heart')).toBeTruthy()
  })
})

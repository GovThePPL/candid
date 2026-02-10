import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import BottomDrawerModal from '../../components/BottomDrawerModal'

describe('BottomDrawerModal', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    title: 'Drawer Title',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders subtitle text', () => {
    render(
      <BottomDrawerModal {...defaultProps} subtitle="A subtitle">
        <Text>Body</Text>
      </BottomDrawerModal>
    )
    expect(screen.getByText('A subtitle')).toBeTruthy()
  })

  it('close button calls onClose', () => {
    const onClose = jest.fn()
    render(
      <BottomDrawerModal {...defaultProps} onClose={onClose}>
        <Text>Body</Text>
      </BottomDrawerModal>
    )
    // The close button has accessibilityLabel="close" (the t key)
    const closeBtn = screen.getByLabelText('close')
    fireEvent.press(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders headerLeft when provided', () => {
    render(
      <BottomDrawerModal {...defaultProps} headerLeft={<Text>Back</Text>}>
        <Text>Body</Text>
      </BottomDrawerModal>
    )
    expect(screen.getByText('Back')).toBeTruthy()
  })

  it('renders headerRight when provided, replacing close button', () => {
    render(
      <BottomDrawerModal {...defaultProps} headerRight={<Text>Done</Text>}>
        <Text>Body</Text>
      </BottomDrawerModal>
    )
    expect(screen.getByText('Done')).toBeTruthy()
    // Default close button (with "close" icon text) should not be rendered
    expect(screen.queryByLabelText('close')).toBeNull()
  })
})

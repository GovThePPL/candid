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

import InfoModal from '../../components/InfoModal'

describe('InfoModal', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    title: 'Test Title',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders items with icons', () => {
    const items = [
      { icon: 'star', text: 'Item one' },
      { icon: 'heart', text: 'Item two' },
    ]
    render(<InfoModal {...defaultProps} items={items} />)
    expect(screen.getByText('Item one')).toBeTruthy()
    expect(screen.getByText('Item two')).toBeTruthy()
    // Icons are rendered as Text with the icon name
    expect(screen.getByText('star')).toBeTruthy()
    expect(screen.getByText('heart')).toBeTruthy()
  })

  it('renders children when provided, replacing paragraphs and items', () => {
    const { Text } = require('react-native')
    render(
      <InfoModal
        {...defaultProps}
        paragraphs={['Should not appear']}
        items={[{ icon: 'star', text: 'Should not appear either' }]}
      >
        <Text>Custom child content</Text>
      </InfoModal>
    )
    expect(screen.getByText('Custom child content')).toBeTruthy()
    expect(screen.queryByText('Should not appear')).toBeNull()
    expect(screen.queryByText('Should not appear either')).toBeNull()
  })

  it('dismiss button calls onClose', () => {
    const onClose = jest.fn()
    render(<InfoModal {...defaultProps} onClose={onClose} />)
    // The dismiss button shows the translated key "gotIt"
    const button = screen.getByText('gotIt')
    fireEvent.press(button)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('button shows custom buttonText or default "gotIt" key', () => {
    const { unmount } = render(<InfoModal {...defaultProps} />)
    expect(screen.getByText('gotIt')).toBeTruthy()
    unmount()

    render(<InfoModal {...defaultProps} buttonText="OK Thanks" />)
    expect(screen.getByText('OK Thanks')).toBeTruthy()
    expect(screen.queryByText('gotIt')).toBeNull()
  })
})

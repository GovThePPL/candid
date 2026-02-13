import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import DownvoteReasonPicker from '../../components/discuss/DownvoteReasonPicker'

describe('DownvoteReasonPicker', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSelect: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders all 5 reason options when visible', () => {
    render(<DownvoteReasonPicker {...defaultProps} />)
    expect(screen.getByText('reasonOfftopic')).toBeTruthy()
    expect(screen.getByText('reasonUnkind')).toBeTruthy()
    expect(screen.getByText('reasonLowEffort')).toBeTruthy()
    expect(screen.getByText('reasonSpam')).toBeTruthy()
    expect(screen.getByText('reasonMisinformation')).toBeTruthy()
  })

  it('renders descriptions for each reason', () => {
    render(<DownvoteReasonPicker {...defaultProps} />)
    expect(screen.getByText('reasonOfftopicDesc')).toBeTruthy()
    expect(screen.getByText('reasonUnkindDesc')).toBeTruthy()
    expect(screen.getByText('reasonLowEffortDesc')).toBeTruthy()
    expect(screen.getByText('reasonSpamDesc')).toBeTruthy()
    expect(screen.getByText('reasonMisinformationDesc')).toBeTruthy()
  })

  it('calls onSelect with reason key on tap', () => {
    render(<DownvoteReasonPicker {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('reasonSpam'))
    expect(defaultProps.onSelect).toHaveBeenCalledWith('spam')
  })

  it('calls onClose after selection', () => {
    render(<DownvoteReasonPicker {...defaultProps} />)
    fireEvent.press(screen.getByLabelText('reasonOfftopic'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('renders title', () => {
    render(<DownvoteReasonPicker {...defaultProps} />)
    expect(screen.getByText('downvoteReasonTitle')).toBeTruthy()
  })
})

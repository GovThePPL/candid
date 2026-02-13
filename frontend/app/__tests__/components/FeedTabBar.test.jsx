import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import FeedTabBar from '../../components/discuss/FeedTabBar'

describe('FeedTabBar', () => {
  const defaultProps = {
    activeTab: 'discussion',
    onTabChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders both Discussion and Q&A tabs', () => {
    render(<FeedTabBar {...defaultProps} />)
    expect(screen.getByText('tabDiscussion')).toBeTruthy()
    expect(screen.getByText('tabQA')).toBeTruthy()
  })

  it('marks the active tab as selected', () => {
    render(<FeedTabBar {...defaultProps} activeTab="question" />)
    const qaTab = screen.getByLabelText('tabQA')
    expect(qaTab).toBeSelected()
    const discussTab = screen.getByLabelText('tabDiscussion')
    expect(discussTab).not.toBeSelected()
  })

  it('calls onTabChange with tab id when pressed', () => {
    const onTabChange = jest.fn()
    render(<FeedTabBar {...defaultProps} onTabChange={onTabChange} />)

    fireEvent.press(screen.getByText('tabQA'))
    expect(onTabChange).toHaveBeenCalledWith('question')

    fireEvent.press(screen.getByText('tabDiscussion'))
    expect(onTabChange).toHaveBeenCalledWith('discussion')
  })
})

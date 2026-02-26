import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        tabDiscussion: 'Discussion',
        tabQA: 'Q&A',
        tabProposals: 'Proposals',
      }
      return map[key] || key
    },
  }),
}))

import FeedTabBar from '../../components/discuss/FeedTabBar'

describe('FeedTabBar proposal behavior', () => {
  it('shows Q&A tab by default', () => {
    render(
      <FeedTabBar activeTab="discussion" onTabChange={jest.fn()} showProposals={false} />
    )
    expect(screen.getByText('Discussion')).toBeTruthy()
    expect(screen.getByText('Q&A')).toBeTruthy()
  })

  it('hides Q&A tab when hideQA is true', () => {
    render(
      <FeedTabBar activeTab="discussion" onTabChange={jest.fn()} showProposals={false} hideQA={true} />
    )
    expect(screen.getByText('Discussion')).toBeTruthy()
    expect(screen.queryByText('Q&A')).toBeNull()
  })

  it('shows Proposals tab when showProposals is true', () => {
    render(
      <FeedTabBar activeTab="discussion" onTabChange={jest.fn()} showProposals={true} />
    )
    expect(screen.getByText('Proposals')).toBeTruthy()
  })

  it('hides Q&A and shows Proposals during proposal stages', () => {
    render(
      <FeedTabBar activeTab="proposal" onTabChange={jest.fn()} showProposals={true} hideQA={true} />
    )
    expect(screen.getByText('Discussion')).toBeTruthy()
    expect(screen.queryByText('Q&A')).toBeNull()
    expect(screen.getByText('Proposals')).toBeTruthy()
  })
})

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import CommentStageTabBar from '../../components/discuss/CommentStageTabBar'

const baseTabs = [
  { id: 'draft', label: 'Draft' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'opinion', label: 'Opinion' },
]

describe('CommentStageTabBar', () => {
  it('renders the correct number of tabs', () => {
    render(
      <CommentStageTabBar
        tabs={baseTabs}
        selectedTab="draft"
        activeTab="draft"
        onTabChange={() => {}}
      />
    )
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('highlights the selected tab', () => {
    render(
      <CommentStageTabBar
        tabs={baseTabs}
        selectedTab="proposal"
        activeTab="draft"
        onTabChange={() => {}}
      />
    )
    const proposalTab = screen.getByRole('tab', { name: 'Proposal' })
    expect(proposalTab.props.accessibilityState).toEqual({ selected: true })
    const draftTab = screen.getByRole('tab', { name: 'Draft' })
    expect(draftTab.props.accessibilityState).toEqual({ selected: false })
  })

  it('calls onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn()
    render(
      <CommentStageTabBar
        tabs={baseTabs}
        selectedTab="draft"
        activeTab="draft"
        onTabChange={onTabChange}
      />
    )
    fireEvent.press(screen.getByRole('tab', { name: 'Opinion' }))
    expect(onTabChange).toHaveBeenCalledWith('opinion')
  })

  it('shows accessibility hint for read-only (non-active) tabs', () => {
    render(
      <CommentStageTabBar
        tabs={baseTabs}
        selectedTab="draft"
        activeTab="proposal"
        onTabChange={() => {}}
      />
    )
    const draftTab = screen.getByRole('tab', { name: 'Draft' })
    expect(draftTab.props.accessibilityHint).toBe('commentTabReadOnlyHint')
    const proposalTab = screen.getByRole('tab', { name: 'Proposal' })
    expect(proposalTab.props.accessibilityHint).toBeUndefined()
  })

  it('shows active dot only on the active tab', () => {
    const { toJSON } = render(
      <CommentStageTabBar
        tabs={[
          { id: 'draft', label: 'Draft' },
          { id: 'proposal', label: 'Proposal' },
        ]}
        selectedTab="draft"
        activeTab="proposal"
        onTabChange={() => {}}
      />
    )
    // The active tab (proposal) should have an extra child (the dot view)
    const tree = toJSON()
    const tabs = tree.children
    // Draft tab (not active): text only
    const draftChildren = tabs[0].children
    const proposalChildren = tabs[1].children
    // Active tab has 2 children (text + dot), non-active has 1 (text only)
    expect(draftChildren).toHaveLength(1)
    expect(proposalChildren).toHaveLength(2)
  })

  it('renders with only two tabs', () => {
    render(
      <CommentStageTabBar
        tabs={[
          { id: 'draft', label: 'Draft' },
          { id: 'proposal', label: 'Proposal' },
        ]}
        selectedTab="draft"
        activeTab="draft"
        onTabChange={() => {}}
      />
    )
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
})

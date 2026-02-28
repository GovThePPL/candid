import React from 'react'
import { render, act, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

let mockIsDesktop = false
jest.mock('../../hooks/useIsDesktop', () => () => mockIsDesktop)

const mockGetRules = jest.fn()
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    moderation: {
      getRules: (...args) => mockGetRules(...args),
    },
  },
}))

import CommunityRulesModal from '../../components/CommunityRulesModal'

describe('CommunityRulesModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    contentType: 'post',
    locationId: 'loc-1',
    sessionId: 'sess-1',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRules.mockResolvedValue([
      { id: '1', title: 'Rule 1', text: 'Desc 1' },
    ])
  })

  it('passes postType to getRules', async () => {
    render(<CommunityRulesModal {...defaultProps} postType="discussion" />)

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledWith(
        'post',
        expect.objectContaining({ postType: 'discussion' })
      )
    })
  })

  it('re-fetches when postType changes', async () => {
    const { rerender } = render(
      <CommunityRulesModal {...defaultProps} postType="discussion" />
    )

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(1)
    })

    // Change postType — should reset fetched state and re-fetch
    await act(async () => {
      rerender(<CommunityRulesModal {...defaultProps} postType="proposal" />)
    })

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(2)
      expect(mockGetRules).toHaveBeenLastCalledWith(
        'post',
        expect.objectContaining({ postType: 'proposal' })
      )
    })
  })

  it('does not re-fetch when postType stays the same', async () => {
    const { rerender } = render(
      <CommunityRulesModal {...defaultProps} postType="discussion" />
    )

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender(<CommunityRulesModal {...defaultProps} postType="discussion" />)
    })

    // Should still be 1 — no re-fetch
    expect(mockGetRules).toHaveBeenCalledTimes(1)
  })

  it('re-fetches when sessionId changes', async () => {
    const { rerender } = render(
      <CommunityRulesModal {...defaultProps} postType="discussion" />
    )

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender(<CommunityRulesModal {...defaultProps} postType="discussion" sessionId="sess-2" />)
    })

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(2)
      expect(mockGetRules).toHaveBeenLastCalledWith(
        'post',
        expect.objectContaining({ sessionId: 'sess-2' })
      )
    })
  })

  it('re-fetches when locationId changes', async () => {
    const { rerender } = render(
      <CommunityRulesModal {...defaultProps} postType="discussion" />
    )

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender(<CommunityRulesModal {...defaultProps} postType="discussion" locationId="loc-2" />)
    })

    await waitFor(() => {
      expect(mockGetRules).toHaveBeenCalledTimes(2)
    })
  })
})

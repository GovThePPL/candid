import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        proposalDraft: 'Draft',
        proposalFinal: 'Final',
        proposalBadgeA11y: `Proposal status: ${opts?.status || '?'}`,
      }
      return map[key] || key
    },
  }),
}))

import ProposalBadge from '../../components/discuss/ProposalBadge'

describe('ProposalBadge', () => {
  it('renders nothing when status is null', () => {
    const { toJSON } = render(<ProposalBadge status={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders Draft badge for draft status', () => {
    render(<ProposalBadge status="draft" />)
    expect(screen.getByText('Draft')).toBeTruthy()
  })

  it('renders Final badge for finalized status', () => {
    render(<ProposalBadge status="finalized" />)
    expect(screen.getByText('Final')).toBeTruthy()
  })

  it('has correct accessibility label for draft', () => {
    render(<ProposalBadge status="draft" />)
    expect(screen.getByLabelText('Proposal status: Draft')).toBeTruthy()
  })

  it('has correct accessibility label for finalized', () => {
    render(<ProposalBadge status="finalized" />)
    expect(screen.getByLabelText('Proposal status: Final')).toBeTruthy()
  })
})

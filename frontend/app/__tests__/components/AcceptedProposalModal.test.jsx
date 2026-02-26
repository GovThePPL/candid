import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        acceptedProposalTitle: 'Accepted Proposal',
        acceptedProposalCloseA11y: 'Close proposal view',
        proposalFinal: 'Final',
        proposalBadgeA11y: 'Proposal status: Final',
      }
      return map[key] || key
    },
  }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

import AcceptedProposalModal from '../../components/AcceptedProposalModal'

const MOCK_PROPOSAL = {
  id: '1',
  title: 'Healthcare Reform Plan',
  body: '## Overview\n\nA comprehensive approach to healthcare.',
  proposalStatus: 'finalized',
  creatorUsername: 'alice',
  creatorDisplayName: 'Alice Smith',
  creatorAvatarIconUrl: null,
}

describe('AcceptedProposalModal', () => {
  it('renders nothing when proposal is null', () => {
    const { toJSON } = render(
      <AcceptedProposalModal visible={true} onClose={jest.fn()} proposal={null} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders proposal title and body when visible', () => {
    render(
      <AcceptedProposalModal visible={true} onClose={jest.fn()} proposal={MOCK_PROPOSAL} />
    )
    expect(screen.getByText('Healthcare Reform Plan')).toBeTruthy()
    expect(screen.getByText('## Overview\n\nA comprehensive approach to healthcare.')).toBeTruthy()
  })

  it('renders author name', () => {
    render(
      <AcceptedProposalModal visible={true} onClose={jest.fn()} proposal={MOCK_PROPOSAL} />
    )
    expect(screen.getByText('Alice Smith')).toBeTruthy()
  })

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn()
    render(
      <AcceptedProposalModal visible={true} onClose={onClose} proposal={MOCK_PROPOSAL} />
    )
    fireEvent.press(screen.getByLabelText('Close proposal view'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows header with Accepted Proposal label', () => {
    render(
      <AcceptedProposalModal visible={true} onClose={jest.fn()} proposal={MOCK_PROPOSAL} />
    )
    expect(screen.getByText('Accepted Proposal')).toBeTruthy()
  })
})

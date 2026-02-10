import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockGetChatLog = jest.fn()
jest.mock('../../../lib/api', () => ({
  __esModule: true,
  chatApiWrapper: {
    getChatLog: (...args) => mockGetChatLog(...args),
  },
}))

import AgreedStatementsModal from '../../../components/stats/AgreedStatementsModal'

describe('AgreedStatementsModal', () => {
  // NOTE: "renders without crashing" smoke tests were intentionally removed.
  // Interaction tests below already render the component, making smoke tests redundant.

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    chatLogId: 'chat-1',
    closureText: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows empty state when no statements', async () => {
    mockGetChatLog.mockResolvedValue({
      log: {
        agreedPositions: [],
        agreedClosure: null,
      },
    })

    render(<AgreedStatementsModal {...defaultProps} closureText={null} />)

    await waitFor(() => {
      expect(screen.getByText('noAgreedStatements')).toBeTruthy()
    })
  })

  it('dismiss button calls onClose', async () => {
    mockGetChatLog.mockResolvedValue({
      log: { agreedPositions: [], agreedClosure: null },
    })
    const onClose = jest.fn()

    render(<AgreedStatementsModal {...defaultProps} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('common:done')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('common:done'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows closure text from fetched data', async () => {
    mockGetChatLog.mockResolvedValue({
      log: {
        agreedPositions: [],
        agreedClosure: { content: 'Final agreement text' },
      },
    })

    render(<AgreedStatementsModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText(/"Final agreement text"/)).toBeTruthy()
    })
  })

  it('shows closure text from prop when fetch has no closure', async () => {
    mockGetChatLog.mockResolvedValue({
      log: {
        agreedPositions: [],
        agreedClosure: null,
      },
    })

    render(
      <AgreedStatementsModal
        {...defaultProps}
        closureText={{ content: 'Prop closure text' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/"Prop closure text"/)).toBeTruthy()
    })
  })
})

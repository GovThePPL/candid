import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import EndorsementManageModal from '../../components/discuss/EndorsementManageModal'

// Mock BottomDrawerModal to just render children when visible
jest.mock('../../components/BottomDrawerModal', () => {
  const { View, Text } = require('react-native')
  return ({ visible, children, title }) =>
    visible ? (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ) : null
})

// Mock ThemedText
jest.mock('../../components/ThemedText', () => {
  const { Text } = require('react-native')
  return (props) => <Text {...props}>{props.children}</Text>
})

// Mock useThemeColors
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#5C005C',
    secondaryText: '#666',
    cardBorder: '#ccc',
    cardBackground: '#fff',
  }),
}))

const mockEndorsedPosts = [
  { id: 'post-1', title: 'Better Parks' },
  { id: 'post-2', title: 'School Funding' },
]

describe('EndorsementManageModal', () => {
  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <EndorsementManageModal
        visible={false}
        onClose={jest.fn()}
        endorsedPosts={mockEndorsedPosts}
        onRemove={jest.fn()}
      />
    )
    expect(queryByText('endorsementManageTitle')).toBeNull()
  })

  it('renders endorsed proposals with full titles when visible', () => {
    const { getByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={mockEndorsedPosts}
        onRemove={jest.fn()}
      />
    )
    expect(getByText('Better Parks')).toBeTruthy()
    expect(getByText('School Funding')).toBeTruthy()
  })

  it('shows empty message when no endorsements', () => {
    const { getByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={[]}
        onRemove={jest.fn()}
      />
    )
    expect(getByText('endorsementManageEmpty')).toBeTruthy()
  })

  it('calls onRemove when remove button is pressed', () => {
    const onRemove = jest.fn()
    const { getAllByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={mockEndorsedPosts}
        onRemove={onRemove}
      />
    )
    const removeButtons = getAllByText('endorsementManageRemove')
    fireEvent.press(removeButtons[0])
    expect(onRemove).toHaveBeenCalledWith('post-1')
  })

  it('shows over-limit message when pendingPostTitle is set', () => {
    const { getByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={mockEndorsedPosts}
        onRemove={jest.fn()}
        pendingPostTitle="New Proposal"
      />
    )
    expect(getByText('endorseOverLimitMessage')).toBeTruthy()
  })

  it('does not show over-limit message when no pendingPostTitle', () => {
    const { queryByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={mockEndorsedPosts}
        onRemove={jest.fn()}
      />
    )
    expect(queryByText('endorseOverLimitMessage')).toBeNull()
  })

  it('calls onPostPress and onClose when title is tapped', () => {
    const onPostPress = jest.fn()
    const onClose = jest.fn()
    const { getByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={onClose}
        endorsedPosts={mockEndorsedPosts}
        onRemove={jest.fn()}
        onPostPress={onPostPress}
      />
    )
    fireEvent.press(getByText('Better Parks'))
    expect(onClose).toHaveBeenCalled()
    expect(onPostPress).toHaveBeenCalledWith('post-1')
  })

  it('renders title without numberOfLines (full title visible)', () => {
    const { getByText } = render(
      <EndorsementManageModal
        visible={true}
        onClose={jest.fn()}
        endorsedPosts={[{ id: 'p1', title: 'A very long proposal title that should be fully visible' }]}
        onRemove={jest.fn()}
      />
    )
    const title = getByText('A very long proposal title that should be fully visible')
    expect(title.props.numberOfLines).toBeUndefined()
  })
})

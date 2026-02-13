import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { LightTheme } from '../../constants/Colors'

const mockColors = LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../hooks/useKeyboardHeight', () => () => ({
  keyboardHeight: 0,
  webInitialHeight: 0,
}))

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockNavigation = { getParent: () => ({ setOptions: jest.fn() }), replace: jest.fn() }
let mockSearchParams = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useNavigation: () => mockNavigation,
}))

const mockCreatePost = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    posts: {
      createPost: (...args) => mockCreatePost(...args),
    },
  },
}))

jest.mock('../../components/Header', () => {
  const { Text } = require('react-native')
  return function MockHeader({ onBack }) {
    return <Text>Header</Text>
  }
})

jest.mock('../../components/LocationCategorySelector', () => {
  const React = require('react')
  const { View, Text, TouchableOpacity } = require('react-native')
  return function MockLocationCategorySelector({ onLocationChange, onCategoryChange }) {
    React.useEffect(() => {
      onLocationChange?.('loc-1')
    }, [])
    return (
      <View>
        <Text>LocationCategorySelector</Text>
        <TouchableOpacity
          testID="set-category"
          onPress={() => onCategoryChange?.('cat-1')}
        >
          <Text>Set Category</Text>
        </TouchableOpacity>
      </View>
    )
  }
})

jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

import CreatePost from '../../app/(dashboard)/discuss/create'

describe('CreatePost', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = {}
  })

  it('renders title and body inputs', () => {
    render(<CreatePost />)
    expect(screen.getByLabelText('titleInputA11y')).toBeTruthy()
    expect(screen.getByLabelText('bodyInputA11y')).toBeTruthy()
  })

  it('shows "New Post" heading by default', () => {
    render(<CreatePost />)
    expect(screen.getByText('createPostTitle')).toBeTruthy()
  })

  it('shows "New Question" heading when type=question', () => {
    mockSearchParams = { type: 'question' }
    render(<CreatePost />)
    expect(screen.getByText('createQuestionTitle')).toBeTruthy()
  })

  it('type toggle switches between discussion and question', () => {
    render(<CreatePost />)
    // Initially shows "New Post"
    expect(screen.getByText('createPostTitle')).toBeTruthy()

    // Tap question tab
    fireEvent.press(screen.getByText('typeQuestion'))
    expect(screen.getByText('createQuestionTitle')).toBeTruthy()

    // Tap back to discussion
    fireEvent.press(screen.getByText('typeDiscussion'))
    expect(screen.getByText('createPostTitle')).toBeTruthy()
  })

  it('character count updates on title input', () => {
    render(<CreatePost />)
    const titleInput = screen.getByLabelText('titleInputA11y')
    fireEvent.changeText(titleInput, 'Hello World')
    expect(screen.getByText('charsRemaining 11 200')).toBeTruthy()
  })

  it('character count updates on body input', () => {
    render(<CreatePost />)
    const bodyInput = screen.getByLabelText('bodyInputA11y')
    fireEvent.changeText(bodyInput, 'Some body text')
    expect(screen.getByText('charsRemaining 14 10,000')).toBeTruthy()
  })

  it('submit button disabled when title empty', () => {
    render(<CreatePost />)
    const bodyInput = screen.getByLabelText('bodyInputA11y')
    fireEvent.changeText(bodyInput, 'Some body text')
    const submitBtn = screen.getByLabelText('submitA11y')
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true)
  })

  it('submit button disabled when body empty', () => {
    render(<CreatePost />)
    const titleInput = screen.getByLabelText('titleInputA11y')
    fireEvent.changeText(titleInput, 'Some title')
    const submitBtn = screen.getByLabelText('submitA11y')
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true)
  })

  it('calls api.posts.createPost with correct params on submit', async () => {
    mockCreatePost.mockResolvedValue({ id: 'new-post-1' })
    render(<CreatePost />)

    // Fill form
    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Post Title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'My post body text')

    // Location auto-set by mock, set category
    fireEvent.press(screen.getByTestId('set-category'))

    // Submit
    fireEvent.press(screen.getByLabelText('submitA11y'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith({
        title: 'My Post Title',
        body: 'My post body text',
        locationId: 'loc-1',
        categoryId: 'cat-1',
        postType: 'discussion',
      })
    })

    expect(mockNavigation.replace).toHaveBeenCalledWith('[id]', { id: 'new-post-1' })
  })

  it('shows error banner on API failure', async () => {
    mockCreatePost.mockRejectedValue(new Error('Server error'))
    render(<CreatePost />)

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Post Title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'My post body text')

    fireEvent.press(screen.getByLabelText('submitA11y'))

    await waitFor(() => {
      expect(screen.getByText('errorCreatePost')).toBeTruthy()
    })
  })

  it('shows rate limit error on 429', async () => {
    mockCreatePost.mockRejectedValue({ status: 429 })
    render(<CreatePost />)

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Post Title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'My post body text')

    fireEvent.press(screen.getByLabelText('submitA11y'))

    await waitFor(() => {
      expect(screen.getByText('errorRateLimited')).toBeTruthy()
    })
  })

  it('category required validation for question type', async () => {
    render(<CreatePost />)

    // Switch to question
    fireEvent.press(screen.getByText('typeQuestion'))

    // Fill title and body but no category
    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Question')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'Question details')

    // Submit should be disabled since no category selected
    const submitBtn = screen.getByLabelText('submitA11y')
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true)
  })

  it('shows preview when preview toggle tapped', () => {
    render(<CreatePost />)

    // Enter body text
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'Some **bold** text')

    // Tap preview toggle
    fireEvent.press(screen.getByLabelText('previewToggleA11y'))

    // Body input should be replaced by markdown renderer showing the content
    expect(screen.getByText('Some **bold** text')).toBeTruthy()
    // Empty preview message should NOT be present
    expect(screen.queryByText('previewEmpty')).toBeNull()
  })

  it('shows empty preview message when body is empty', () => {
    render(<CreatePost />)

    // Tap preview toggle with empty body
    fireEvent.press(screen.getByLabelText('previewToggleA11y'))

    expect(screen.getByText('previewEmpty')).toBeTruthy()
  })
})

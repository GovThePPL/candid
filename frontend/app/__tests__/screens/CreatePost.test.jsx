import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
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

// Mock WysiwygEditor with a TextInput that exposes the imperative API
let mockEditorContent = ''
jest.mock('../../components/WysiwygEditor', () => {
  const React = require('react')
  const { TextInput } = require('react-native')
  return React.forwardRef(function MockWysiwygEditor({ onContentChange, placeholder }, ref) {
    React.useImperativeHandle(ref, () => ({
      getMarkdown: () => Promise.resolve(mockEditorContent),
      getHtml: () => Promise.resolve(`<p>${mockEditorContent}</p>`),
      focus: jest.fn(),
      blur: jest.fn(),
      setContent: jest.fn(),
    }))
    return (
      <TextInput
        accessibilityLabel="bodyInputA11y"
        placeholder={placeholder}
        onChangeText={(text) => {
          mockEditorContent = text
          onContentChange?.(`<p>${text}</p>`)
        }}
      />
    )
  })
})

jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'u1', username: 'alice' } }),
}))

jest.mock('../../lib/cache', () => ({
  CacheManager: { invalidate: jest.fn() },
  CacheKeys: { activityPosts: (id) => `activity-posts:${id}` },
}))

let mockSelectedLocation = 'loc-1'
let mockSelectedSession = 'sess-1'
jest.mock('../../contexts/LocationSessionContext', () => ({
  useLocationSession: () => ({
    selectedLocation: mockSelectedLocation,
    selectedSession: mockSelectedSession,
    sessionData: null,
    viewingStage: null,
    isReadOnly: false,
    currentStage: null,
    effectiveStage: null,
  }),
}))

import CreatePost from '../../app/(dashboard)/(tabs)/discuss/create'

describe('CreatePost', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = {}
    mockEditorContent = ''
    mockSelectedLocation = 'loc-1'
    mockSelectedSession = 'sess-1'
  })

  it('renders title input and editor', () => {
    render(<CreatePost />)
    expect(screen.getByLabelText('titleInputA11y')).toBeTruthy()
    expect(screen.getByLabelText('bodyInputA11y')).toBeTruthy()
  })

  it('uses discussion type by default', () => {
    render(<CreatePost />)
    expect(screen.getByText('submitPost')).toBeTruthy()
  })

  it('uses question type from search params', () => {
    mockSearchParams = { type: 'question' }
    render(<CreatePost />)
    expect(screen.getByText('submitQuestion')).toBeTruthy()
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

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Post Title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'My post body text')

    await act(async () => {
      fireEvent.press(screen.getByLabelText('submitA11y'))
    })

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith({
        title: 'My Post Title',
        body: 'My post body text',
        locationId: 'loc-1',
        sessionId: 'sess-1',
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

    await act(async () => {
      fireEvent.press(screen.getByLabelText('submitA11y'))
    })

    await waitFor(() => {
      expect(screen.getByText('errorCreatePost')).toBeTruthy()
    })
  })

  it('shows rate limit error on 429', async () => {
    mockCreatePost.mockRejectedValue({ status: 429 })
    render(<CreatePost />)

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Post Title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'My post body text')

    await act(async () => {
      fireEvent.press(screen.getByLabelText('submitA11y'))
    })

    await waitFor(() => {
      expect(screen.getByText('errorRateLimited')).toBeTruthy()
    })
  })

  it('submit button disabled for question type when no session', () => {
    mockSearchParams = { type: 'question' }
    mockSelectedSession = null
    render(<CreatePost />)

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'My Question')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'Question details')

    const submitBtn = screen.getByLabelText('submitA11y')
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true)
  })

  it('submit button disabled when context has no location', () => {
    mockSelectedLocation = null
    render(<CreatePost />)

    fireEvent.changeText(screen.getByLabelText('titleInputA11y'), 'Some title')
    fireEvent.changeText(screen.getByLabelText('bodyInputA11y'), 'Some body text')

    const submitBtn = screen.getByLabelText('submitA11y')
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true)
  })

  it('redirects proposal type to wizard screen', () => {
    mockSearchParams = { type: 'proposal' }
    render(<CreatePost />)
    expect(mockRouter.replace).toHaveBeenCalledWith('/discuss/proposal-wizard')
  })
})

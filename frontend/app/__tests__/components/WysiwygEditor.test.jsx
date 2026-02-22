import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

// Mock actions + state returned by useWysiwygVisual hook
const mockActions = {
  toggleBold: jest.fn(),
  toggleItalic: jest.fn(),
  toggleStrike: jest.fn(),
  toggleHeading: jest.fn(),
  setLink: jest.fn(),
  setImage: jest.fn(),
  toggleBulletList: jest.fn(),
  toggleOrderedList: jest.fn(),
  toggleBlockquote: jest.fn(),
  toggleSuperscript: jest.fn(),
  toggleSubscript: jest.fn(),
  toggleTaskList: jest.fn(),
  setHorizontalRule: jest.fn(),
  insertTable: jest.fn(),
  insertFootnote: jest.fn(),
  updateFootnoteText: jest.fn(),
  undo: jest.fn(),
  redo: jest.fn(),
}

const mockGetHTML = jest.fn().mockResolvedValue('<p>test</p>')
const mockSetContent = jest.fn()
const mockFocus = jest.fn()
const mockBlur = jest.fn()

const mockEditorState = {
  isReady: true,
  isBoldActive: false,
  canToggleBold: true,
  isItalicActive: false,
  canToggleItalic: true,
  isStrikeActive: false,
  canToggleStrike: true,
  headingLevel: undefined,
  canToggleHeading: true,
  isLinkActive: false,
  isBulletListActive: false,
  canToggleBulletList: true,
  isOrderedListActive: false,
  canToggleOrderedList: true,
  isBlockquoteActive: false,
  canToggleBlockquote: true,
  isSuperscriptActive: false,
  canToggleSuperscript: true,
  isSubscriptActive: false,
  canToggleSubscript: true,
  isTaskListActive: false,
  canToggleTaskList: true,
  canUndo: true,
  canRedo: false,
}

jest.mock('../../lib/useWysiwygVisual', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: () => ({
      editorJSX: <View testID="rich-text" />,
      themeJSX: null,
      editorState: mockEditorState,
      actions: mockActions,
      getHTML: mockGetHTML,
      setContent: mockSetContent,
      focus: mockFocus,
      blur: mockBlur,
      editingFootnote: null,
      clearEditingFootnote: jest.fn(),
    }),
  }
})

jest.mock('../../lib/markdownConvert', () => ({
  markdownToHtml: jest.fn(md => `<p>${md}</p>`),
  htmlToMarkdown: jest.fn(html => html.replace(/<[^>]*>/g, '')),
}))

jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { View, Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <View testID="markdown-renderer"><Text>{content}</Text></View>
  }
})

import WysiwygEditor from '../../components/WysiwygEditor'

describe('WysiwygEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the visual editor by default', () => {
    render(<WysiwygEditor />)
    expect(screen.getByTestId('rich-text')).toBeTruthy()
  })

  it('renders mode toggle pills', () => {
    render(<WysiwygEditor />)
    expect(screen.getByText('modeVisual')).toBeTruthy()
    expect(screen.getByText('modeMarkdown')).toBeTruthy()
  })

  it('renders toolbar buttons with accessibility labels in visual mode', () => {
    render(<WysiwygEditor />)
    expect(screen.getByLabelText('boldA11y')).toBeTruthy()
    expect(screen.getByLabelText('italicA11y')).toBeTruthy()
    expect(screen.getByLabelText('heading1A11y')).toBeTruthy()
    expect(screen.getByLabelText('heading2A11y')).toBeTruthy()
    expect(screen.getByLabelText('heading3A11y')).toBeTruthy()
    expect(screen.getByLabelText('linkA11y')).toBeTruthy()
    expect(screen.getByLabelText('bulletListA11y')).toBeTruthy()
    expect(screen.getByLabelText('numberedListA11y')).toBeTruthy()
    expect(screen.getByLabelText('blockquoteA11y')).toBeTruthy()
    expect(screen.getByLabelText('undoA11y')).toBeTruthy()
    expect(screen.getByLabelText('redoA11y')).toBeTruthy()
  })

  it('does not show image button when allowImages is false', () => {
    render(<WysiwygEditor allowImages={false} />)
    expect(screen.queryByLabelText('imageA11y')).toBeNull()
  })

  it('shows image button when allowImages is true', () => {
    render(<WysiwygEditor allowImages={true} />)
    expect(screen.getByLabelText('imageA11y')).toBeTruthy()
  })

  it('calls toggleBold on bold button press', () => {
    render(<WysiwygEditor />)
    fireEvent.press(screen.getByLabelText('boldA11y'))
    expect(mockActions.toggleBold).toHaveBeenCalled()
  })

  it('calls toggleItalic on italic button press', () => {
    render(<WysiwygEditor />)
    fireEvent.press(screen.getByLabelText('italicA11y'))
    expect(mockActions.toggleItalic).toHaveBeenCalled()
  })

  it('calls toggleHeading with correct level on heading button press', () => {
    render(<WysiwygEditor />)
    fireEvent.press(screen.getByLabelText('heading1A11y'))
    expect(mockActions.toggleHeading).toHaveBeenCalledWith(1)
    fireEvent.press(screen.getByLabelText('heading2A11y'))
    expect(mockActions.toggleHeading).toHaveBeenCalledWith(2)
    fireEvent.press(screen.getByLabelText('heading3A11y'))
    expect(mockActions.toggleHeading).toHaveBeenCalledWith(3)
  })

  it('calls undo on undo button press', () => {
    render(<WysiwygEditor />)
    fireEvent.press(screen.getByLabelText('undoA11y'))
    expect(mockActions.undo).toHaveBeenCalled()
  })

  it('opens link modal on link button press', () => {
    render(<WysiwygEditor />)
    fireEvent.press(screen.getByLabelText('linkA11y'))
    expect(screen.getByLabelText('linkUrl')).toBeTruthy()
    expect(screen.getByLabelText('linkText')).toBeTruthy()
  })

  it('exposes imperative methods via ref', () => {
    const ref = React.createRef()
    render(<WysiwygEditor ref={ref} />)

    expect(ref.current).toBeTruthy()
    expect(typeof ref.current.getMarkdown).toBe('function')
    expect(typeof ref.current.getHtml).toBe('function')
    expect(typeof ref.current.focus).toBe('function')
    expect(typeof ref.current.blur).toBe('function')
    expect(typeof ref.current.setContent).toBe('function')
  })

  it('getMarkdown calls getHTML and converts to markdown in visual mode', async () => {
    const ref = React.createRef()
    render(<WysiwygEditor ref={ref} />)

    const md = await ref.current.getMarkdown()
    expect(mockGetHTML).toHaveBeenCalled()
    expect(typeof md).toBe('string')
  })

  it('switches to markdown mode and hides formatting buttons', async () => {
    render(<WysiwygEditor />)

    await act(async () => {
      fireEvent.press(screen.getByText('modeMarkdown'))
    })

    await waitFor(() => {
      expect(screen.queryByLabelText('boldA11y')).toBeNull()
    })
  })

  it('shows preview toggle in markdown mode', async () => {
    render(<WysiwygEditor />)

    await act(async () => {
      fireEvent.press(screen.getByText('modeMarkdown'))
    })

    await waitFor(() => {
      expect(screen.getByLabelText('markdownPreviewA11y')).toBeTruthy()
    })
  })

  it('getMarkdown returns raw text in markdown mode', async () => {
    const ref = React.createRef()
    render(<WysiwygEditor ref={ref} initialMarkdown="hello world" />)

    await act(async () => {
      fireEvent.press(screen.getByText('modeMarkdown'))
    })

    const md = await ref.current.getMarkdown()
    expect(typeof md).toBe('string')
  })

  it('hides wiki-only toolbar buttons by default (discuss variant)', () => {
    render(<WysiwygEditor />)
    expect(screen.queryByLabelText('tableA11y')).toBeNull()
    expect(screen.queryByLabelText('footnoteA11y')).toBeNull()
    expect(screen.queryByLabelText('superscriptA11y')).toBeNull()
    expect(screen.queryByLabelText('subscriptA11y')).toBeNull()
    expect(screen.queryByLabelText('taskListA11y')).toBeNull()
    expect(screen.queryByLabelText('horizontalRuleA11y')).toBeNull()
    // Basic buttons should still be present
    expect(screen.getByLabelText('boldA11y')).toBeTruthy()
    expect(screen.getByLabelText('italicA11y')).toBeTruthy()
  })

  it('shows all toolbar buttons including wiki-only for variant="wiki"', () => {
    render(<WysiwygEditor variant="wiki" />)
    expect(screen.getByLabelText('tableA11y')).toBeTruthy()
    expect(screen.getByLabelText('footnoteA11y')).toBeTruthy()
    expect(screen.getByLabelText('superscriptA11y')).toBeTruthy()
    expect(screen.getByLabelText('subscriptA11y')).toBeTruthy()
    expect(screen.getByLabelText('taskListA11y')).toBeTruthy()
    expect(screen.getByLabelText('horizontalRuleA11y')).toBeTruthy()
    // Basic buttons should also be present
    expect(screen.getByLabelText('boldA11y')).toBeTruthy()
    expect(screen.getByLabelText('italicA11y')).toBeTruthy()
  })
})

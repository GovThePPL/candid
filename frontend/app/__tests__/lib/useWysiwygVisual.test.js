/**
 * Tests for the native WYSIWYG visual hook configuration.
 * Verifies that custom bridges and customSource are properly wired.
 */

// Capture args passed to useEditorBridge and bridgeExtensions
let capturedBridgeExtensions = []
let capturedEditorOptions = {}

jest.mock('@10play/tentap-editor', () => ({
  useEditorBridge: jest.fn((options) => {
    capturedEditorOptions = options || {}
    return {
      toggleBold: jest.fn(),
      toggleItalic: jest.fn(),
      toggleStrike: jest.fn(),
      toggleHeading: jest.fn(),
      setLink: jest.fn(),
      setImage: jest.fn(),
      toggleBulletList: jest.fn(),
      toggleOrderedList: jest.fn(),
      toggleTaskList: jest.fn(),
      toggleBlockquote: jest.fn(),
      toggleSuperscript: jest.fn(),
      toggleSubscript: jest.fn(),
      setHorizontalRule: jest.fn(),
      insertTable: jest.fn(),
      insertFootnote: jest.fn(),
      updateFootnoteText: jest.fn(),
      insertLinkContent: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
      getHTML: jest.fn().mockResolvedValue(''),
      setContent: jest.fn(),
      focus: jest.fn(),
      blur: jest.fn(),
      injectCSS: jest.fn(),
    }
  }),
  RichText: 'RichText',
  useBridgeState: jest.fn(() => ({
    isReady: false,
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
    isTaskListActive: false,
    canToggleTaskList: true,
    isBlockquoteActive: false,
    canToggleBlockquote: true,
    isSuperscriptActive: false,
    canToggleSuperscript: true,
    isSubscriptActive: false,
    canToggleSubscript: true,
    canUndo: false,
    canRedo: false,
    editingFootnoteLabel: null,
    editingFootnoteText: null,
  })),
  CoreBridge: { name: 'core', configureCSS: jest.fn(() => ({ name: 'core' })) },
  BoldBridge: { name: 'bold' },
  ItalicBridge: { name: 'italic' },
  StrikeBridge: { name: 'strike' },
  HeadingBridge: { name: 'heading' },
  LinkBridge: { name: 'link' },
  BulletListBridge: { name: 'bulletList' },
  OrderedListBridge: { name: 'orderedList' },
  TaskListBridge: { name: 'taskList' },
  BlockquoteBridge: { name: 'blockquote' },
  ImageBridge: { name: 'image' },
  PlaceholderBridge: { name: 'placeholder', configureExtension: jest.fn(() => ({ name: 'placeholder' })) },
  HistoryBridge: { name: 'history' },
}))

// Mock the custom bridges
jest.mock('../../lib/bridges/SuperscriptBridge', () => ({
  SuperscriptBridge: { name: 'superscript' },
}))
jest.mock('../../lib/bridges/SubscriptBridge', () => ({
  SubscriptBridge: { name: 'subscript' },
}))
jest.mock('../../lib/bridges/HorizontalRuleBridge', () => ({
  HorizontalRuleBridge: { name: 'horizontalRule' },
}))
jest.mock('../../lib/bridges/TableBridge', () => ({
  TableBridge: { name: 'table' },
}))
jest.mock('../../lib/bridges/FootnoteBridge', () => ({
  FootnoteBridge: { name: 'footnoteRef' },
}))
jest.mock('../../lib/bridges/LinkContentBridge', () => ({
  LinkContentBridge: { name: 'linkContent' },
}))

// Mock the custom editor HTML
jest.mock('../../lib/customEditor/build/editorHtml', () => '<html>custom editor</html>')

const { renderHook } = require('@testing-library/react-native')
const useWysiwygVisual = require('../../lib/useWysiwygVisual').default
const { useEditorBridge } = require('@10play/tentap-editor')

const defaultArgs = {
  initialHtml: '',
  placeholder: 'Type...',
  onContentChange: null,
  allowImages: false,
  colors: {
    cardBackground: '#fff',
    text: '#000',
    primary: '#5C005C',
    cardBorder: '#ccc',
    secondaryText: '#666',
    background: '#f5f5f5',
    placeholderText: '#999',
  },
}

describe('useWysiwygVisual', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedEditorOptions = {}
  })

  it('includes custom bridges in bridgeExtensions', () => {
    renderHook(() => useWysiwygVisual(defaultArgs))

    const call = useEditorBridge.mock.calls[0][0]
    const names = call.bridgeExtensions.map(b => b.name)

    expect(names).toContain('superscript')
    expect(names).toContain('subscript')
    expect(names).toContain('horizontalRule')
    expect(names).toContain('table')
    expect(names).toContain('footnoteRef')
  })

  it('passes customSource to useEditorBridge', () => {
    renderHook(() => useWysiwygVisual(defaultArgs))

    const call = useEditorBridge.mock.calls[0][0]
    expect(call.customSource).toBe('<html>custom editor</html>')
  })

  it('maps bridge state for superscript/subscript', () => {
    const { useBridgeState } = require('@10play/tentap-editor')
    useBridgeState.mockReturnValue({
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
      isTaskListActive: false,
      canToggleTaskList: true,
      isBlockquoteActive: false,
      canToggleBlockquote: true,
      isSuperscriptActive: true,
      canToggleSuperscript: true,
      isSubscriptActive: false,
      canToggleSubscript: true,
      canUndo: false,
      canRedo: false,
      editingFootnoteLabel: null,
      editingFootnoteText: null,
    })

    const { result } = renderHook(() => useWysiwygVisual(defaultArgs))

    expect(result.current.editorState.isSuperscriptActive).toBe(true)
    expect(result.current.editorState.canToggleSuperscript).toBe(true)
    expect(result.current.editorState.isSubscriptActive).toBe(false)
  })

  it('derives editingFootnote from bridge state', () => {
    const { useBridgeState } = require('@10play/tentap-editor')
    useBridgeState.mockReturnValue({
      isReady: true,
      isBoldActive: false, canToggleBold: true,
      isItalicActive: false, canToggleItalic: true,
      isStrikeActive: false, canToggleStrike: true,
      headingLevel: undefined, canToggleHeading: true,
      isLinkActive: false,
      isBulletListActive: false, canToggleBulletList: true,
      isOrderedListActive: false, canToggleOrderedList: true,
      isTaskListActive: false, canToggleTaskList: true,
      isBlockquoteActive: false, canToggleBlockquote: true,
      isSuperscriptActive: false, canToggleSuperscript: true,
      isSubscriptActive: false, canToggleSubscript: true,
      canUndo: false, canRedo: false,
      editingFootnoteLabel: '1',
      editingFootnoteText: 'A footnote',
    })

    const { result } = renderHook(() => useWysiwygVisual(defaultArgs))

    expect(result.current.editingFootnote).toEqual({ label: '1', text: 'A footnote' })
  })

  it('returns null editingFootnote when no footnote is selected', () => {
    const { useBridgeState } = require('@10play/tentap-editor')
    useBridgeState.mockReturnValue({
      isReady: true,
      isBoldActive: false, canToggleBold: true,
      isItalicActive: false, canToggleItalic: true,
      isStrikeActive: false, canToggleStrike: true,
      headingLevel: undefined, canToggleHeading: true,
      isLinkActive: false,
      isBulletListActive: false, canToggleBulletList: true,
      isOrderedListActive: false, canToggleOrderedList: true,
      isTaskListActive: false, canToggleTaskList: true,
      isBlockquoteActive: false, canToggleBlockquote: true,
      isSuperscriptActive: false, canToggleSuperscript: true,
      isSubscriptActive: false, canToggleSubscript: true,
      canUndo: false, canRedo: false,
      editingFootnoteLabel: null,
      editingFootnoteText: null,
    })

    const { result } = renderHook(() => useWysiwygVisual(defaultArgs))

    expect(result.current.editingFootnote).toBeNull()
  })

  it('wires real bridge actions instead of no-ops', () => {
    const { result } = renderHook(() => useWysiwygVisual(defaultArgs))

    // Call each action — they should call through to the mock editor methods
    result.current.actions.toggleSuperscript()
    result.current.actions.toggleSubscript()
    result.current.actions.setHorizontalRule()
    result.current.actions.insertTable()
    result.current.actions.insertFootnote('1', 'note')
    result.current.actions.updateFootnoteText('1', 'updated')

    // Verify each called the editor mock (not a no-op)
    const editor = useEditorBridge.mock.results[0].value
    expect(editor.toggleSuperscript).toHaveBeenCalled()
    expect(editor.toggleSubscript).toHaveBeenCalled()
    expect(editor.setHorizontalRule).toHaveBeenCalled()
    expect(editor.insertTable).toHaveBeenCalled()
    expect(editor.insertFootnote).toHaveBeenCalledWith('1', 'note')
    expect(editor.updateFootnoteText).toHaveBeenCalledWith('1', 'updated')
  })

  it('includes LinkContentBridge in bridgeExtensions', () => {
    renderHook(() => useWysiwygVisual(defaultArgs))

    const call = useEditorBridge.mock.calls[0][0]
    const names = call.bridgeExtensions.map(b => b.name)

    expect(names).toContain('linkContent')
  })

  it('setLink action calls insertLinkContent with url and text', () => {
    const { result } = renderHook(() => useWysiwygVisual(defaultArgs))

    result.current.actions.setLink('https://example.com', 'Example')

    const editor = useEditorBridge.mock.results[0].value
    expect(editor.insertLinkContent).toHaveBeenCalledWith('https://example.com', 'Example')
  })
})

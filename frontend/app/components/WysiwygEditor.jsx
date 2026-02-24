import {
  useState, useEffect, useMemo, useCallback, useRef,
  forwardRef, useImperativeHandle,
} from 'react'
import {
  View, TouchableOpacity, Modal, TextInput, StyleSheet,
  ScrollView, Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../constants/Theme'
import ThemedText from './ThemedText'
import MarkdownRenderer from './discuss/MarkdownRenderer'
import MentionAutocomplete from './discuss/MentionAutocomplete'
import { markdownToHtml, htmlToMarkdown } from '../lib/markdownConvert'
import useWysiwygVisual from '../lib/useWysiwygVisual'

const KBAvoidingView = Platform.OS !== 'web'
  ? require('react-native-keyboard-controller').KeyboardAvoidingView
  : null

const EDITOR_MODE_KEY = '@candid_editor_mode_preference'

/**
 * WYSIWYG rich text editor with Visual/Markdown mode toggle.
 *
 * Visual mode: TenTap (native) or TipTap (web) via useWysiwygVisual hook.
 * Markdown mode: plain TextInput with optional preview.
 *
 * @param {Object} props
 * @param {string} [props.initialMarkdown] - Markdown to load into editor
 * @param {Function} [props.onContentChange] - Callback with HTML (visual) or markdown (markdown mode)
 * @param {boolean} [props.allowImages] - Show image toolbar button
 * @param {boolean} [props.deferUpload] - When true, images are inserted as local URIs and uploaded on uploadPendingImages()
 * @param {string} [props.placeholder] - Placeholder text
 * @param {number} [props.minHeight] - Min editor height
 * @param {number} [props.maxHeight] - Max editor height
 * @param {boolean} [props.fullScreen] - When true, editor fills its parent (flex: 1, no border)
 * @param {string} [props.externalMode] - 'visual' | 'markdown' — externally controlled mode (hides internal toggle)
 * @param {'discuss'|'wiki'} [props.variant='discuss'] - 'wiki' shows advanced toolbar buttons (table, footnote, sup/sub, task list, hr)
 * @param {React.Ref} ref - Imperative ref: { getMarkdown(), getHtml(), focus(), blur(), setContent(md), uploadPendingImages() }
 */

const WIKI_ONLY_KEYS = new Set(['table', 'footnote', 'superscript', 'subscript', 'taskList', 'horizontalRule'])

const WysiwygEditor = forwardRef(function WysiwygEditor({
  initialMarkdown,
  onContentChange,
  allowImages = false,
  deferUpload = false,
  placeholder,
  minHeight,
  maxHeight,
  fullScreen = false,
  externalMode,
  variant = 'discuss',
  mentionParticipants,
}, ref) {
  const { t } = useTranslation('markdown')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors, minHeight, maxHeight, fullScreen, externalMode), [colors, minHeight, maxHeight, fullScreen, externalMode])

  // Editor mode: 'visual' or 'markdown' — persisted across the app
  const [editorMode, setEditorModeRaw] = useState(externalMode || 'visual')
  const [modeLoaded, setModeLoaded] = useState(false)
  const [markdownText, setMarkdownText] = useState(initialMarkdown || '')
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false)
  const pendingVisualHtml = useRef(null)

  // Load saved preference on mount (skip if externally controlled)
  useEffect(() => {
    if (externalMode) {
      setModeLoaded(true)
      return
    }
    AsyncStorage.getItem(EDITOR_MODE_KEY)
      .then((stored) => {
        if (stored === 'markdown') setEditorModeRaw('markdown')
      })
      .catch(() => {})
      .finally(() => setModeLoaded(true))
  }, [])

  // Persist mode changes (skip persistence when externally controlled)
  const setEditorMode = useCallback((mode) => {
    setEditorModeRaw(mode)
    if (!externalMode) {
      AsyncStorage.setItem(EDITOR_MODE_KEY, mode).catch(() => {})
    }
  }, [externalMode])

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

  // Footnote modal state
  const [showFootnoteModal, setShowFootnoteModal] = useState(false)
  const [footnoteText, setFootnoteText] = useState('')
  const [editingFootnoteLabel, setEditingFootnoteLabel] = useState(null)
  const footnoteModalClosedAt = useRef(0) // timestamp to suppress auto-open after close
  const markdownSelectionRef = useRef({ start: 0, end: 0 })

  // Mention autocomplete state
  const [mentionVisible, setMentionVisible] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const mentionStartRef = useRef(null) // character index of the '@'

  // Visual editor hook
  const initialHtml = useMemo(
    () => initialMarkdown ? markdownToHtml(initialMarkdown) : '',
    [] // Only compute once on mount
  )

  const placeholderText = placeholder || t('editorPlaceholder')

  const {
    editorJSX, themeJSX, editorState, actions,
    getHTML, setContent, focus, blur,
    editingFootnote, clearEditingFootnote,
  } = useWysiwygVisual({
    initialHtml,
    placeholder: placeholderText,
    onContentChange: editorMode === 'visual' ? onContentChange : undefined,
    allowImages,
    colors,
  })

  // Mode switching
  const switchToMarkdown = useCallback(async () => {
    const html = await getHTML()
    const md = htmlToMarkdown(html)
    setMarkdownText(md)
    setEditorMode('markdown')
    onContentChange?.(html) // keep callback flowing
  }, [getHTML, setEditorMode, onContentChange])

  const switchToVisual = useCallback(() => {
    const html = markdownToHtml(markdownText)
    pendingVisualHtml.current = html
    setEditorMode('visual')
    setShowMarkdownPreview(false)
    onContentChange?.(html)
  }, [markdownText, setEditorMode, onContentChange])

  // Apply pending content after the visual editor becomes visible
  useEffect(() => {
    if (editorMode === 'visual' && pendingVisualHtml.current !== null) {
      const html = pendingVisualHtml.current
      pendingVisualHtml.current = null
      requestAnimationFrame(() => setContent(html))
    }
  }, [editorMode, setContent])

  const handleModeToggle = useCallback((mode) => {
    if (mode === editorMode) return
    if (mode === 'markdown') {
      switchToMarkdown()
    } else {
      switchToVisual()
    }
  }, [editorMode, switchToMarkdown, switchToVisual])

  // Sync with external mode changes
  const prevExternalMode = useRef(externalMode)
  useEffect(() => {
    if (!externalMode) return
    if (externalMode === prevExternalMode.current) return
    prevExternalMode.current = externalMode
    handleModeToggle(externalMode)
  }, [externalMode, handleModeToggle])

  // Markdown text change — with @mention detection
  const handleMarkdownChange = useCallback((text) => {
    setMarkdownText(text)
    // Fire onContentChange with HTML equivalent
    onContentChange?.(markdownToHtml(text))

    // Mention detection: look backward from cursor for @ preceded by whitespace/start
    if (mentionParticipants) {
      const cursor = markdownSelectionRef.current?.start ?? text.length
      // Find the last '@' before/at cursor that's preceded by whitespace or start-of-string
      let atPos = -1
      for (let i = Math.min(cursor, text.length) - 1; i >= 0; i--) {
        const ch = text[i]
        if (ch === ' ' || ch === '\n' || ch === '\t') break // hit whitespace before finding @
        if (ch === '@') {
          // Must be at start of string or preceded by whitespace
          if (i === 0 || /\s/.test(text[i - 1])) {
            atPos = i
          }
          break
        }
      }
      if (atPos >= 0) {
        const query = text.slice(atPos + 1, cursor).toLowerCase()
        // Only show if query has no spaces (still typing a username)
        if (!/\s/.test(query) && query.length <= 30) {
          mentionStartRef.current = atPos
          setMentionQuery(query)
          setMentionVisible(true)
          return
        }
      }
      setMentionVisible(false)
      mentionStartRef.current = null
    }
  }, [onContentChange, mentionParticipants])

  // Handle mention selection — splice @username into text
  const handleMentionSelect = useCallback((username) => {
    const atPos = mentionStartRef.current
    if (atPos == null) return
    setMarkdownText(prev => {
      const cursor = markdownSelectionRef.current?.start ?? prev.length
      const before = prev.slice(0, atPos)
      const after = prev.slice(cursor)
      const inserted = `@${username} `
      const newText = before + inserted + after
      onContentChange?.(markdownToHtml(newText))
      return newText
    })
    setMentionVisible(false)
    mentionStartRef.current = null
  }, [onContentChange])

  // Image upload helper for deferred mode — must be defined before useImperativeHandle
  const pendingImagesRef = useRef(new Map()) // tempUrl -> { formData, name }

  const uploadPendingImages = useCallback(async (markdown) => {
    const api = require('../lib/api').default
    const pending = pendingImagesRef.current
    if (pending.size === 0) return markdown

    let result = markdown
    for (const [tempUrl, { formData }] of pending.entries()) {
      const serverUrl = await api.wiki.uploadImage(formData)
      if (serverUrl) {
        result = result.split(tempUrl).join(serverUrl)
      }
    }

    // Clean up blob URLs on web
    if (Platform.OS === 'web') {
      for (const tempUrl of pending.keys()) {
        try { URL.revokeObjectURL(tempUrl) } catch {}
      }
    }
    pending.clear()
    return result
  }, [])

  // Imperative handle — branches on mode
  useImperativeHandle(ref, () => ({
    async getMarkdown() {
      if (editorMode === 'markdown') {
        return markdownText
      }
      const html = await getHTML()
      return htmlToMarkdown(html)
    },
    async getHtml() {
      if (editorMode === 'markdown') {
        return markdownToHtml(markdownText)
      }
      return await getHTML()
    },
    focus() {
      focus()
    },
    blur() {
      blur()
    },
    setContent(md) {
      setMarkdownText(md || '')
      setContent(md ? markdownToHtml(md) : '')
    },
    /** Upload deferred images and return markdown with real server URLs. */
    async uploadPendingImages() {
      let md
      if (editorMode === 'markdown') {
        md = markdownText
      } else {
        const html = await getHTML()
        md = htmlToMarkdown(html)
      }
      return uploadPendingImages(md)
    },
    /** Whether there are pending images that need uploading. */
    hasPendingImages() {
      return pendingImagesRef.current.size > 0
    },
    /** Return pending images map entries so parent can save before unmount. */
    getPendingImages() {
      return new Map(pendingImagesRef.current)
    },
    /** Restore pending images map (e.g. when editor remounts). */
    setPendingImages(map) {
      pendingImagesRef.current = map instanceof Map ? map : new Map()
    },
  }), [editorMode, markdownText, getHTML, focus, blur, setContent, uploadPendingImages])

  // Link insertion
  const handleOpenLinkModal = useCallback(() => {
    setLinkUrl('')
    setLinkText('')
    setShowLinkModal(true)
  }, [])

  const handleInsertLink = useCallback(() => {
    const url = linkUrl.trim()
    if (!url) return
    actions.setLink(url, linkText.trim() || undefined)
    setShowLinkModal(false)
  }, [linkUrl, linkText, actions])

  // Open footnote modal in edit mode when a footnote definition is clicked
  // in the WebView. Suppressed briefly after modal close to prevent the
  // cursor-adjacent-to-footnote bridge state from immediately re-opening it.
  useEffect(() => {
    if (editingFootnote && editorMode === 'visual' && !showFootnoteModal) {
      if (Date.now() - footnoteModalClosedAt.current < 800) return
      setEditingFootnoteLabel(editingFootnote.label)
      setFootnoteText(editingFootnote.text)
      setShowFootnoteModal(true)
    }
  }, [editingFootnote, editorMode, showFootnoteModal])

  const closeFootnoteModal = useCallback(() => {
    setShowFootnoteModal(false)
    setEditingFootnoteLabel(null)
    footnoteModalClosedAt.current = Date.now()
  }, [])

  // Footnote insertion / editing (visual + markdown mode)
  const handleOpenFootnoteModal = useCallback(() => {
    setEditingFootnoteLabel(null)
    setFootnoteText('')
    setShowFootnoteModal(true)
  }, [])

  const handleSaveFootnote = useCallback(async () => {
    const text = footnoteText.trim()
    if (!text) return

    if (editingFootnoteLabel) {
      // Edit mode — update existing footnote text
      if (editorMode === 'visual') {
        actions.updateFootnoteText(editingFootnoteLabel, text)
      } else {
        // Markdown mode — replace the definition line
        const defRegex = new RegExp(`^\\[\\^${editingFootnoteLabel}\\]:\\s*.+$`, 'm')
        const newText = markdownText.replace(defRegex, `[^${editingFootnoteLabel}]: ${text}`)
        handleMarkdownChange(newText)
      }
    } else {
      // Insert mode — add new footnote
      if (editorMode === 'visual') {
        const html = await getHTML()
        const existing = html.match(/data-footnote="(\d+)"/g) || []
        const usedNums = existing.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10))
        const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1
        actions.insertFootnote(nextNum, text)
      } else {
        const existing = markdownText.match(/\[\^(\d+)\]/g) || []
        const usedNums = existing.map(m => parseInt(m.replace(/\[\^|\]/g, ''), 10)).filter(n => !isNaN(n))
        const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1

        const ref = `[^${nextNum}]`
        const def = `${ref}: ${text}`
        const { start, end } = markdownSelectionRef.current
        const before = markdownText.slice(0, start)
        const after = markdownText.slice(end)
        const newText = before + ref + after + '\n' + def
        handleMarkdownChange(newText)
      }
    }
    closeFootnoteModal()
  }, [footnoteText, editingFootnoteLabel, editorMode, getHTML, actions, markdownText, handleMarkdownChange, closeFootnoteModal])

  // Image insertion — supports immediate upload or deferred (local preview + upload on submit)
  const handleInsertImage = useCallback(async () => {
    try {
      const api = require('../lib/api').default

      if (Platform.OS === 'web') {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async (e) => {
          const file = e.target.files?.[0]
          if (!file) return

          if (deferUpload) {
            // Create a blob URL for inline preview, defer actual upload
            const blobUrl = URL.createObjectURL(file)
            const formData = new FormData()
            formData.append('file', file)
            pendingImagesRef.current.set(blobUrl, { formData, name: file.name })
            actions.setImage(blobUrl)
          } else {
            const formData = new FormData()
            formData.append('file', file)
            try {
              const imageUrl = await api.wiki.uploadImage(formData)
              if (imageUrl) actions.setImage(imageUrl)
            } catch (err) {
              console.error('Image upload failed:', err)
            }
          }
        }
        input.click()
        return
      }

      const ImagePicker = require('expo-image-picker')

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') return

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      })
      if (result.canceled) return

      const asset = result.assets[0]
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'image.jpg',
        type: asset.mimeType || 'image/jpeg',
      })

      if (deferUpload) {
        // WebView can't load file:// URIs and full-res base64 freezes the
        // bridge, so create a small thumbnail for inline preview only.
        const { manipulateAsync, SaveFormat } = require('expo-image-manipulator')
        const thumb = await manipulateAsync(
          asset.uri,
          [{ resize: { width: 600 } }],
          { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        )
        const tempUrl = thumb.base64
          ? `data:image/jpeg;base64,${thumb.base64}`
          : asset.uri // fallback
        pendingImagesRef.current.set(tempUrl, { formData, name: asset.fileName || 'image.jpg' })
        actions.setImage(tempUrl)
      } else {
        const imageUrl = await api.wiki.uploadImage(formData)
        if (imageUrl) {
          actions.setImage(imageUrl)
        }
      }
    } catch (err) {
      console.error('Image upload failed:', err)
    }
  }, [actions, deferUpload])


  // Toolbar buttons (only shown in visual mode)
  const toolbarButtons = useMemo(() => {
    const buttons = [
      {
        key: 'bold',
        icon: 'text',
        customText: 'B',
        customStyle: { fontWeight: '900' },
        label: t('boldA11y'),
        onPress: actions.toggleBold,
        active: editorState.isBoldActive,
        disabled: !editorState.canToggleBold,
      },
      {
        key: 'italic',
        icon: 'text',
        customText: 'I',
        customStyle: { fontStyle: 'italic' },
        label: t('italicA11y'),
        onPress: actions.toggleItalic,
        active: editorState.isItalicActive,
        disabled: !editorState.canToggleItalic,
      },
      {
        key: 'strike',
        icon: 'text',
        customText: 'S',
        customStyle: { textDecorationLine: 'line-through' },
        label: t('strikethroughA11y'),
        onPress: actions.toggleStrike,
        active: editorState.isStrikeActive,
        disabled: !editorState.canToggleStrike,
      },
      {
        key: 'superscript',
        customText: 'X\u00B2',
        label: t('superscriptA11y'),
        onPress: actions.toggleSuperscript,
        active: editorState.isSuperscriptActive,
        disabled: !editorState.canToggleSuperscript,
      },
      {
        key: 'subscript',
        customText: 'X\u2082',
        label: t('subscriptA11y'),
        onPress: actions.toggleSubscript,
        active: editorState.isSubscriptActive,
        disabled: !editorState.canToggleSubscript,
      },
      {
        key: 'h1',
        customText: 'H1',
        label: t('heading1A11y'),
        onPress: () => actions.toggleHeading(1),
        active: editorState.headingLevel === 1,
        disabled: !editorState.canToggleHeading,
      },
      {
        key: 'h2',
        customText: 'H2',
        label: t('heading2A11y'),
        onPress: () => actions.toggleHeading(2),
        active: editorState.headingLevel === 2,
        disabled: !editorState.canToggleHeading,
      },
      {
        key: 'h3',
        customText: 'H3',
        label: t('heading3A11y'),
        onPress: () => actions.toggleHeading(3),
        active: editorState.headingLevel === 3,
        disabled: !editorState.canToggleHeading,
      },
      {
        key: 'link',
        icon: 'link',
        label: t('linkA11y'),
        onPress: handleOpenLinkModal,
        active: editorState.isLinkActive,
        disabled: false,
      },
      {
        key: 'bulletList',
        icon: 'list',
        label: t('bulletListA11y'),
        onPress: actions.toggleBulletList,
        active: editorState.isBulletListActive,
        disabled: !editorState.canToggleBulletList,
      },
      {
        key: 'orderedList',
        icon: 'list',
        customText: '1.',
        label: t('numberedListA11y'),
        onPress: actions.toggleOrderedList,
        active: editorState.isOrderedListActive,
        disabled: !editorState.canToggleOrderedList,
      },
      {
        key: 'blockquote',
        icon: 'chatbox-ellipses-outline',
        label: t('blockquoteA11y'),
        onPress: actions.toggleBlockquote,
        active: editorState.isBlockquoteActive,
        disabled: !editorState.canToggleBlockquote,
      },
      {
        key: 'taskList',
        icon: 'checkbox-outline',
        label: t('taskListA11y'),
        onPress: actions.toggleTaskList,
        active: editorState.isTaskListActive,
        disabled: !editorState.canToggleTaskList,
      },
      {
        key: 'horizontalRule',
        icon: 'remove-outline',
        label: t('horizontalRuleA11y'),
        onPress: actions.setHorizontalRule,
        active: false,
        disabled: false,
      },
      {
        key: 'table',
        icon: 'grid-outline',
        label: t('tableA11y'),
        onPress: () => actions.insertTable(),
        active: false,
        disabled: false,
      },
      {
        key: 'footnote',
        customText: 'fn\u207D\u00B9\u207E',
        label: t('footnoteA11y'),
        onPress: handleOpenFootnoteModal,
        active: false,
        disabled: false,
      },
    ]

    if (allowImages) {
      buttons.push({
        key: 'image',
        icon: 'image-outline',
        label: t('imageA11y'),
        onPress: handleInsertImage,
        active: false,
        disabled: false,
      })
    }

    buttons.push(
      {
        key: 'undo',
        icon: 'arrow-undo',
        label: t('undoA11y'),
        onPress: actions.undo,
        active: false,
        disabled: !editorState.canUndo,
      },
      {
        key: 'redo',
        icon: 'arrow-redo',
        label: t('redoA11y'),
        onPress: actions.redo,
        active: false,
        disabled: !editorState.canRedo,
      },
    )

    // Filter out wiki-only buttons for non-wiki variants
    if (variant !== 'wiki') {
      return buttons.filter(btn => !WIKI_ONLY_KEYS.has(btn.key))
    }
    return buttons
  }, [actions, editorState, allowImages, handleOpenLinkModal, handleInsertImage, t, variant])

  // Contextual table toolbar buttons — shown only when cursor is inside a table
  const tableButtons = useMemo(() => [
    { key: 'addRowAbove',  label: t('tableAddRowAbove'),  a11y: t('tableAddRowAboveA11y'),  onPress: actions.addRowBefore },
    { key: 'addRowBelow',  label: t('tableAddRowBelow'),  a11y: t('tableAddRowBelowA11y'),  onPress: actions.addRowAfter },
    { key: 'deleteRow',    label: t('tableDeleteRow'),    a11y: t('tableDeleteRowA11y'),    onPress: actions.deleteRow },
    { key: 'addColLeft',   label: t('tableAddColLeft'),   a11y: t('tableAddColLeftA11y'),   onPress: actions.addColumnBefore },
    { key: 'addColRight',  label: t('tableAddColRight'),  a11y: t('tableAddColRightA11y'),  onPress: actions.addColumnAfter },
    { key: 'deleteCol',    label: t('tableDeleteCol'),    a11y: t('tableDeleteColA11y'),    onPress: actions.deleteColumn },
  ], [actions, t])

  return (
    <View style={styles.container}>
      {/* Theme CSS for web TipTap */}
      {themeJSX}

      {/* Toolbar — hidden entirely in external markdown mode */}
      {(!externalMode || editorMode === 'visual') && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbarContent}
        style={styles.toolbar}
        keyboardShouldPersistTaps="always"
      >
        {/* Mode toggle pills (internal mode only) */}
        {!externalMode && <View style={styles.modeToggle} accessibilityRole="tablist">
          {['visual', 'markdown'].map((mode) => {
            const isActive = editorMode === mode
            const label = mode === 'visual' ? t('modeVisual') : t('modeMarkdown')
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => handleModeToggle(mode)}
                style={[styles.modePill, isActive && styles.modePillActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t('modeToggleA11y')}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              >
                <ThemedText
                  variant="caption"
                  style={[
                    styles.modePillText,
                    isActive && styles.modePillTextActive,
                  ]}
                >
                  {label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>}

        {/* Separator (internal mode only) */}
        {!externalMode && <View style={styles.toolbarSeparator} />}

        {/* Visual mode: formatting buttons */}
        {editorMode === 'visual' && toolbarButtons.map(btn => (
          <TouchableOpacity
            key={btn.key}
            onPress={btn.onPress}
            disabled={btn.disabled}
            style={[
              styles.toolbarButton,
              btn.active && styles.toolbarButtonActive,
              btn.disabled && styles.toolbarButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={btn.label}
            accessibilityState={{ selected: btn.active, disabled: btn.disabled }}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
          >
            {btn.customText ? (
              <ThemedText
                variant="label"
                style={[
                  styles.toolbarButtonText,
                  btn.customStyle,
                  btn.active && { color: colors.buttonSelectedText },
                  btn.disabled && { opacity: 0.4 },
                ]}
              >
                {btn.customText}
              </ThemedText>
            ) : (
              <Ionicons
                name={btn.icon}
                size={18}
                color={btn.active ? colors.buttonSelectedText : btn.disabled ? colors.placeholderText : colors.text}
              />
            )}
          </TouchableOpacity>
        ))}

        {/* Markdown mode: footnote (wiki only) + preview toggle */}
        {editorMode === 'markdown' && (
          <>
            {variant === 'wiki' && (
              <TouchableOpacity
                onPress={handleOpenFootnoteModal}
                style={styles.toolbarButton}
                accessibilityRole="button"
                accessibilityLabel={t('footnoteA11y')}
              >
                <ThemedText variant="label" style={styles.toolbarButtonText}>
                  {'fn\u207D\u00B9\u207E'}
                </ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowMarkdownPreview(!showMarkdownPreview)}
              style={[styles.toolbarButton, showMarkdownPreview && styles.toolbarButtonActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: showMarkdownPreview }}
              accessibilityLabel={t('markdownPreviewA11y')}
            >
              <Ionicons
                name={showMarkdownPreview ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={showMarkdownPreview ? colors.buttonSelectedText : colors.text}
              />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      )}

      {/* Contextual table toolbar — visible when cursor is inside a table (wiki variant only) */}
      {editorMode === 'visual' && editorState.isInTable && variant === 'wiki' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tableToolbarContent}
          style={styles.tableToolbar}
          keyboardShouldPersistTaps="always"
        >
          {tableButtons.map(btn => (
            <TouchableOpacity
              key={btn.key}
              onPress={btn.onPress}
              style={styles.tableToolbarButton}
              accessibilityRole="button"
              accessibilityLabel={btn.a11y}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            >
              <ThemedText variant="caption" style={styles.tableToolbarButtonText}>
                {btn.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Editor area — both editors stay mounted to preserve state */}
      <View style={[styles.editorContainer, editorMode !== 'visual' && styles.hiddenEditor]}>
        {editorJSX}
      </View>
      <View style={[styles.editorContainer, editorMode !== 'markdown' && styles.hiddenEditor]}>
        {/* Mention autocomplete (markdown mode only) */}
        {mentionVisible && mentionParticipants && (
          <MentionAutocomplete
            visible={mentionVisible}
            query={mentionQuery}
            participants={mentionParticipants}
            onSelect={handleMentionSelect}
            onDismiss={() => setMentionVisible(false)}
          />
        )}
        {showMarkdownPreview ? (
          <View style={styles.markdownPreview}>
            {markdownText.trim() ? (
              <MarkdownRenderer content={markdownText} variant="post" />
            ) : (
              <ThemedText variant="bodySmall" color="secondary" style={styles.previewEmpty}>
                {t('markdownPreviewEmpty')}
              </ThemedText>
            )}
          </View>
        ) : (
          <TextInput
            style={[styles.markdownInput, { color: colors.text }]}
            value={markdownText}
            onChangeText={handleMarkdownChange}
            onSelectionChange={(e) => { markdownSelectionRef.current = e.nativeEvent.selection }}
            multiline
            placeholder={placeholderText}
            placeholderTextColor={colors.placeholderText}
            textAlignVertical="top"
            accessibilityLabel={t('modeMarkdown')}
            maxFontSizeMultiplier={1.5}
          />
        )}
      </View>

      {/* Link Modal */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}
      >
        {Platform.OS === 'web' ? (
        <View style={styles.linkOverlay}>
          <View style={styles.linkModal}>
            <ThemedText variant="h3" style={styles.linkModalTitle}>
              {t('linkTitle')}
            </ThemedText>
            <TextInput
              style={[styles.linkInput, { color: colors.text }]}
              placeholder={t('linkUrl')}
              placeholderTextColor={colors.placeholderText}
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('linkUrl')}
            />
            <TextInput
              style={[styles.linkInput, { color: colors.text }]}
              placeholder={t('linkText')}
              placeholderTextColor={colors.placeholderText}
              value={linkText}
              onChangeText={setLinkText}
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('linkText')}
            />
            <View style={styles.linkModalActions}>
              <TouchableOpacity
                onPress={() => setShowLinkModal(false)}
                style={styles.linkCancelButton}
                accessibilityRole="button"
                accessibilityLabel={t('linkCancel')}
              >
                <ThemedText variant="button" color="secondary">{t('linkCancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleInsertLink}
                disabled={!linkUrl.trim()}
                style={[styles.linkInsertButton, !linkUrl.trim() && styles.linkInsertButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t('linkInsert')}
              >
                <ThemedText variant="button" color="inverse">{t('linkInsert')}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        ) : (
        <KBAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.linkOverlay}>
            <View style={styles.linkModal}>
              <ThemedText variant="h3" style={styles.linkModalTitle}>
                {t('linkTitle')}
              </ThemedText>
              <TextInput
                style={[styles.linkInput, { color: colors.text }]}
                placeholder={t('linkUrl')}
                placeholderTextColor={colors.placeholderText}
                value={linkUrl}
                onChangeText={setLinkUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('linkUrl')}
              />
              <TextInput
                style={[styles.linkInput, { color: colors.text }]}
                placeholder={t('linkText')}
                placeholderTextColor={colors.placeholderText}
                value={linkText}
                onChangeText={setLinkText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('linkText')}
              />
              <View style={styles.linkModalActions}>
                <TouchableOpacity
                  onPress={() => setShowLinkModal(false)}
                  style={styles.linkCancelButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('linkCancel')}
                >
                  <ThemedText variant="button" color="secondary">{t('linkCancel')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleInsertLink}
                  disabled={!linkUrl.trim()}
                  style={[styles.linkInsertButton, !linkUrl.trim() && styles.linkInsertButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('linkInsert')}
                >
                  <ThemedText variant="button" color="inverse">{t('linkInsert')}</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KBAvoidingView>
        )}
      </Modal>

      {/* Footnote Modal (insert or edit) */}
      <Modal
        visible={showFootnoteModal}
        transparent
        animationType="fade"
        onRequestClose={closeFootnoteModal}
      >
        {Platform.OS === 'web' ? (
        <View style={styles.linkOverlay}>
          <View style={styles.linkModal}>
            <ThemedText variant="h3" style={styles.linkModalTitle}>
              {editingFootnoteLabel ? t('footnoteEditTitle') : t('footnoteTitle')}
            </ThemedText>
            <TextInput
              style={[styles.linkInput, styles.footnoteInput, { color: colors.text }]}
              placeholder={t('footnotePlaceholder')}
              placeholderTextColor={colors.placeholderText}
              value={footnoteText}
              onChangeText={setFootnoteText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('footnotePlaceholder')}
              autoFocus
            />
            <View style={styles.linkModalActions}>
              <TouchableOpacity
                onPress={closeFootnoteModal}
                style={styles.linkCancelButton}
                accessibilityRole="button"
                accessibilityLabel={t('footnoteCancel')}
              >
                <ThemedText variant="button" color="secondary">{t('footnoteCancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveFootnote}
                disabled={!footnoteText.trim()}
                style={[styles.linkInsertButton, !footnoteText.trim() && styles.linkInsertButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={editingFootnoteLabel ? t('footnoteSave') : t('footnoteInsert')}
              >
                <ThemedText variant="button" color="inverse">
                  {editingFootnoteLabel ? t('footnoteSave') : t('footnoteInsert')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        ) : (
        <KBAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.linkOverlay}>
            <View style={styles.linkModal}>
              <ThemedText variant="h3" style={styles.linkModalTitle}>
                {editingFootnoteLabel ? t('footnoteEditTitle') : t('footnoteTitle')}
              </ThemedText>
              <TextInput
                style={[styles.linkInput, styles.footnoteInput, { color: colors.text }]}
                placeholder={t('footnotePlaceholder')}
                placeholderTextColor={colors.placeholderText}
                value={footnoteText}
                onChangeText={setFootnoteText}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('footnotePlaceholder')}
                autoFocus
              />
              <View style={styles.linkModalActions}>
                <TouchableOpacity
                  onPress={closeFootnoteModal}
                  style={styles.linkCancelButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('footnoteCancel')}
                >
                  <ThemedText variant="button" color="secondary">{t('footnoteCancel')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveFootnote}
                  disabled={!footnoteText.trim()}
                  style={[styles.linkInsertButton, !footnoteText.trim() && styles.linkInsertButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={editingFootnoteLabel ? t('footnoteSave') : t('footnoteInsert')}
                >
                  <ThemedText variant="button" color="inverse">
                    {editingFootnoteLabel ? t('footnoteSave') : t('footnoteInsert')}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KBAvoidingView>
        )}
      </Modal>
    </View>
  )
})

export default WysiwygEditor

const createStyles = (colors, minHeight, maxHeight, fullScreen, externalMode) => StyleSheet.create({
  container: {
    ...(fullScreen ? {
      flex: 1,
      ...(externalMode ? {} : { backgroundColor: colors.cardBackground }),
    } : externalMode ? {
      ...(Platform.OS === 'web' ? { flex: 1, overflow: 'hidden' } : {}),
    } : {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
      backgroundColor: colors.cardBackground,
    }),
  },
  toolbar: {
    flexShrink: 0,
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  toolbarContent: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: 2,
    alignItems: 'center',
  },
  // Mode toggle pills
  modeToggle: {
    flexDirection: 'row',
    gap: 2,
    marginRight: 4,
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  modePillActive: {
    backgroundColor: colors.buttonSelected,
  },
  modePillText: {
    color: colors.secondaryText,
  },
  modePillTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  toolbarSeparator: {
    width: 1,
    height: 20,
    backgroundColor: colors.cardBorder,
    marginHorizontal: 4,
  },
  toolbarButton: {
    padding: 6,
    borderRadius: BorderRadius.sm,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Table contextual toolbar
  tableToolbar: {
    flexShrink: 0,
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  tableToolbarContent: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    gap: 4,
    alignItems: 'center',
  },
  tableToolbarButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  tableToolbarButtonText: {
    color: colors.text,
  },
  toolbarButtonActive: {
    backgroundColor: colors.buttonSelected,
  },
  toolbarButtonDisabled: {
    opacity: 0.4,
  },
  toolbarButtonText: {
    color: colors.text,
  },
  editorContainer: {
    ...(fullScreen ? {
      flex: 1,
      ...(Platform.OS === 'web' ? { overflow: 'auto' } : {}),
    } : externalMode ? {
      ...(Platform.OS === 'web' ? { flex: 1, overflow: 'auto' } : {}),
    } : {
      minHeight: minHeight || 120,
      maxHeight: maxHeight || undefined,
    }),
  },
  hiddenEditor: {
    display: 'none',
  },
  // Markdown mode
  markdownInput: {
    ...(externalMode ? {
      fontSize: 15,
      lineHeight: 22,
      padding: Spacing.sm,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
      ...(fullScreen ? {
        flex: 1,
      } : {
        minHeight: minHeight || 80,
        maxHeight: maxHeight || undefined,
      }),
    } : {
      fontFamily: 'monospace',
      fontSize: 14,
      lineHeight: 20,
      padding: Spacing.md,
      ...(fullScreen ? {
        flex: 1,
      } : {
        minHeight: minHeight || 120,
        maxHeight: maxHeight || undefined,
      }),
    }),
  },
  markdownPreview: {
    padding: Spacing.md,
    minHeight: minHeight || 120,
  },
  previewEmpty: {
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
  // Link modal
  linkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  linkModal: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  linkModalTitle: {
    marginBottom: Spacing.lg,
  },
  linkInput: {
    backgroundColor: colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: Spacing.md,
  },
  linkModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  linkCancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  linkInsertButton: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
  },
  linkInsertButtonDisabled: {
    opacity: 0.5,
  },
  footnoteInput: {
    minHeight: 72,
  },
})

import React, { useMemo, useEffect, useCallback } from 'react'
import { useEditorBridge, RichText, useBridgeState } from '@10play/tentap-editor'
import {
  CoreBridge, BoldBridge, ItalicBridge, HeadingBridge,
  LinkBridge, BulletListBridge, OrderedListBridge,
  BlockquoteBridge, ImageBridge, PlaceholderBridge,
  HistoryBridge, StrikeBridge, TaskListBridge,
} from '@10play/tentap-editor'

// Custom bridges for wiki features
import { SuperscriptBridge } from './bridges/SuperscriptBridge'
import { SubscriptBridge } from './bridges/SubscriptBridge'
import { HorizontalRuleBridge } from './bridges/HorizontalRuleBridge'
import { TableBridge } from './bridges/TableBridge'
import { FootnoteBridge } from './bridges/FootnoteBridge'
import { LinkContentBridge } from './bridges/LinkContentBridge'

// Custom WebView HTML that includes all TipTap extensions (built via Vite)
import customEditorHtml from './customEditor/build/editorHtml'

/**
 * Native (TenTap) implementation of the visual WYSIWYG hook.
 * Returns a unified API consumed by WysiwygEditor.
 */
export default function useWysiwygVisual({ initialHtml, placeholder, onContentChange, allowImages, colors }) {
  const bridgeExtensions = useMemo(() => {
    // Bake initial background/text colors into the HTML template so the WebView
    // doesn't flash white before the full theme CSS is injected via injectCSS().
    const initialCSS = `body { background-color: ${colors.cardBackground}; color: ${colors.text}; }`
    const extensions = [
      CoreBridge.configureCSS?.(initialCSS) || CoreBridge,
      BoldBridge,
      ItalicBridge,
      StrikeBridge,
      HeadingBridge,
      LinkBridge,
      BulletListBridge,
      OrderedListBridge,
      TaskListBridge,
      BlockquoteBridge,
      HistoryBridge,
      PlaceholderBridge.configureExtension?.({ placeholder: placeholder || '' }) || PlaceholderBridge,
      // Custom bridges for wiki-specific features
      SuperscriptBridge,
      SubscriptBridge,
      HorizontalRuleBridge,
      TableBridge,
      FootnoteBridge,
      LinkContentBridge,
    ]
    if (allowImages) {
      extensions.push(ImageBridge)
    }
    return extensions
  }, [allowImages, placeholder])

  const editor = useEditorBridge({
    initialContent: initialHtml || '',
    bridgeExtensions,
    customSource: customEditorHtml,
    avoidIosKeyboard: true,
    autofocus: false,
    onChange: onContentChange ? () => {
      editor.getHTML().then(html => onContentChange(html))
    } : undefined,
  })

  const bridgeState = useBridgeState(editor)

  // Inject theme CSS when colors change
  useEffect(() => {
    if (!bridgeState.isReady) return
    const css = `
      body {
        background-color: ${colors.cardBackground};
        color: ${colors.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 15px;
        line-height: 1.5;
        padding: 8px 12px;
        margin: 0;
      }
      a { color: ${colors.primary}; }
      blockquote {
        border-left: 3px solid ${colors.cardBorder};
        padding-left: 12px;
        margin-left: 0;
        color: ${colors.secondaryText};
      }
      code {
        background-color: ${colors.background};
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 13px;
      }
      pre {
        background-color: ${colors.background};
        padding: 12px;
        border-radius: 6px;
        overflow-x: auto;
      }
      img {
        max-width: 100%;
        border-radius: 6px;
      }
      h1, h2, h3 { color: ${colors.text}; }
      s { text-decoration: line-through; }
      hr {
        border: none;
        border-top: 1px solid ${colors.cardBorder};
        margin: 12px 0;
      }
      ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }
      ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .tiptap p.is-editor-empty:first-child::before {
        color: ${colors.placeholderText};
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
      }
      td, th {
        border: 1px solid ${colors.cardBorder};
        padding: 6px 10px;
        min-width: 40px;
        vertical-align: top;
      }
      th {
        background-color: ${colors.background};
        font-weight: 600;
      }
      sup { vertical-align: super; font-size: 0.75em; }
      sub { vertical-align: sub; font-size: 0.75em; }
      .footnote-ref {
        color: ${colors.primary};
        cursor: pointer;
        font-size: 0.75em;
        vertical-align: super;
        font-weight: 600;
      }
      .footnote-defs {
        border-top: 1px solid ${colors.cardBorder};
        margin-top: 16px;
        padding-top: 8px;
        font-size: 0.85em;
        color: ${colors.secondaryText};
      }
      .footnote-def { padding: 2px 0; cursor: pointer; }
      .footnote-def:hover { background-color: ${colors.background}; }
      .footnote-def-label { font-weight: 600; color: ${colors.primary}; margin-right: 4px; }
      .footnote-highlight { background-color: rgba(92, 0, 92, 0.15); transition: background-color 0.3s; }
    `
    editor.injectCSS(css, 'candid-theme')
  }, [bridgeState.isReady, colors])

  // Derive editingFootnote from bridge state
  const editingFootnote = bridgeState.editingFootnoteLabel
    ? { label: bridgeState.editingFootnoteLabel, text: bridgeState.editingFootnoteText || '' }
    : null

  const editorJSX = React.createElement(RichText, {
    editor,
    style: { backgroundColor: colors.cardBackground },
  })

  return {
    editorJSX,
    themeJSX: null,
    editingFootnote,
    clearEditingFootnote: () => {},
    editorState: {
      isBoldActive: bridgeState.isBoldActive,
      canToggleBold: bridgeState.canToggleBold,
      isItalicActive: bridgeState.isItalicActive,
      canToggleItalic: bridgeState.canToggleItalic,
      isStrikeActive: bridgeState.isStrikeActive,
      canToggleStrike: bridgeState.canToggleStrike,
      headingLevel: bridgeState.headingLevel,
      canToggleHeading: bridgeState.canToggleHeading,
      isLinkActive: bridgeState.isLinkActive,
      isBulletListActive: bridgeState.isBulletListActive,
      canToggleBulletList: bridgeState.canToggleBulletList,
      isOrderedListActive: bridgeState.isOrderedListActive,
      canToggleOrderedList: bridgeState.canToggleOrderedList,
      isTaskListActive: bridgeState.isTaskListActive ?? false,
      canToggleTaskList: bridgeState.canToggleTaskList ?? true,
      isBlockquoteActive: bridgeState.isBlockquoteActive,
      canToggleBlockquote: bridgeState.canToggleBlockquote,
      isSuperscriptActive: bridgeState.isSuperscriptActive ?? false,
      canToggleSuperscript: bridgeState.canToggleSuperscript ?? false,
      isSubscriptActive: bridgeState.isSubscriptActive ?? false,
      canToggleSubscript: bridgeState.canToggleSubscript ?? false,
      canUndo: bridgeState.canUndo,
      canRedo: bridgeState.canRedo,
      isReady: bridgeState.isReady,
      isInTable: bridgeState.isInTable ?? false,
    },
    actions: {
      toggleBold: () => editor.toggleBold(),
      toggleItalic: () => editor.toggleItalic(),
      toggleStrike: () => editor.toggleStrike(),
      toggleHeading: (level) => editor.toggleHeading(level),
      setLink: (url, text) => editor.insertLinkContent(url, text),
      setImage: (url) => editor.setImage(url),
      toggleBulletList: () => editor.toggleBulletList(),
      toggleOrderedList: () => editor.toggleOrderedList(),
      toggleTaskList: () => editor.toggleTaskList(),
      toggleBlockquote: () => editor.toggleBlockquote(),
      toggleSuperscript: () => editor.toggleSuperscript(),
      toggleSubscript: () => editor.toggleSubscript(),
      setHorizontalRule: () => editor.setHorizontalRule(),
      insertTable: (args) => editor.insertTable(args),
      addRowBefore: () => editor.addRowBefore(),
      addRowAfter: () => editor.addRowAfter(),
      deleteRow: () => editor.deleteRow(),
      addColumnBefore: () => editor.addColumnBefore(),
      addColumnAfter: () => editor.addColumnAfter(),
      deleteColumn: () => editor.deleteColumn(),
      insertFootnote: (label, text) => editor.insertFootnote(label, text),
      updateFootnoteText: (label, text) => editor.updateFootnoteText(label, text),
      undo: () => editor.undo(),
      redo: () => editor.redo(),
    },
    getHTML: () => editor.getHTML(),
    setContent: (html) => editor.setContent(html || ''),
    focus: () => editor.focus(),
    blur: () => editor.blur(),
  }
}

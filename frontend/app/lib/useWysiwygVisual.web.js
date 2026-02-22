import React, { useMemo, useCallback, useState, useReducer } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { FootnoteRef, extractFootnotes } from './tiptapFootnote'

/**
 * Web (TipTap) implementation of the visual WYSIWYG hook.
 * Returns the same unified API as the native TenTap hook.
 */
export default function useWysiwygVisual({ initialHtml, placeholder, onContentChange, allowImages, colors }) {
  const extensions = useMemo(() => {
    const exts = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        strike: true, // strikethrough via StarterKit
      }),
      Placeholder.configure({ placeholder: placeholder || '' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Superscript,
      Subscript,
      FootnoteRef,
    ]
    if (allowImages) {
      exts.push(Image)
    }
    return exts
  }, [allowImages, placeholder])

  // Force re-render on selection/content changes so editorState stays in sync
  const [, forceUpdate] = useReducer(x => x + 1, 0)

  const editor = useEditor({
    extensions,
    content: initialHtml || '',
    onUpdate: ({ editor: e }) => {
      onContentChange?.(e.getHTML())
      forceUpdate()
    },
    onSelectionUpdate: () => {
      forceUpdate()
    },
    editorProps: {
      attributes: { class: 'candid-tiptap-editor' },
    },
  })

  const editorState = useMemo(() => {
    if (!editor) {
      return {
        isBoldActive: false,
        canToggleBold: false,
        isItalicActive: false,
        canToggleItalic: false,
        isStrikeActive: false,
        canToggleStrike: false,
        headingLevel: undefined,
        canToggleHeading: false,
        isLinkActive: false,
        isBulletListActive: false,
        canToggleBulletList: false,
        isOrderedListActive: false,
        canToggleOrderedList: false,
        isTaskListActive: false,
        canToggleTaskList: false,
        isBlockquoteActive: false,
        canToggleBlockquote: false,
        isSuperscriptActive: false,
        canToggleSuperscript: false,
        isSubscriptActive: false,
        canToggleSubscript: false,
        canUndo: false,
        canRedo: false,
        isReady: false,
      }
    }
    return {
      isBoldActive: editor.isActive('bold'),
      canToggleBold: true,
      isItalicActive: editor.isActive('italic'),
      canToggleItalic: true,
      isStrikeActive: editor.isActive('strike'),
      canToggleStrike: true,
      headingLevel: editor.isActive('heading', { level: 1 }) ? 1
        : editor.isActive('heading', { level: 2 }) ? 2
        : editor.isActive('heading', { level: 3 }) ? 3
        : undefined,
      canToggleHeading: true,
      isLinkActive: editor.isActive('link'),
      isBulletListActive: editor.isActive('bulletList'),
      canToggleBulletList: true,
      isOrderedListActive: editor.isActive('orderedList'),
      canToggleOrderedList: true,
      isTaskListActive: editor.isActive('taskList'),
      canToggleTaskList: true,
      isBlockquoteActive: editor.isActive('blockquote'),
      canToggleBlockquote: true,
      isSuperscriptActive: editor.isActive('superscript'),
      canToggleSuperscript: true,
      isSubscriptActive: editor.isActive('subscript'),
      canToggleSubscript: true,
      canUndo: editor.can().chain().focus().undo().run(),
      canRedo: editor.can().chain().focus().redo().run(),
      isReady: true,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state])

  // Theme CSS as a <style> tag
  const themeJSX = useMemo(() => {
    if (!colors) return null
    const css = `
      .candid-editor-wrap {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .candid-editor-wrap > div:first-child {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .candid-tiptap-editor {
        background-color: ${colors.cardBackground};
        color: ${colors.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 15px;
        line-height: 1.5;
        padding: 8px 12px;
        outline: none;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
      .candid-tiptap-editor a { color: ${colors.primary}; }
      .candid-tiptap-editor blockquote {
        border-left: 3px solid ${colors.cardBorder};
        padding-left: 12px;
        margin-left: 0;
        color: ${colors.secondaryText};
      }
      .candid-tiptap-editor code {
        background-color: ${colors.background};
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 13px;
      }
      .candid-tiptap-editor pre {
        background-color: ${colors.background};
        padding: 12px;
        border-radius: 6px;
        overflow-x: auto;
      }
      .candid-tiptap-editor img {
        max-width: 100%;
        border-radius: 6px;
      }
      .candid-tiptap-editor h1,
      .candid-tiptap-editor h2,
      .candid-tiptap-editor h3 { color: ${colors.text}; }
      .candid-tiptap-editor p.is-editor-empty:first-child::before {
        color: ${colors.placeholderText};
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
      }
      .candid-tiptap-editor s { text-decoration: line-through; }
      .candid-tiptap-editor sup { vertical-align: super; font-size: 0.75em; }
      .candid-tiptap-editor sub { vertical-align: sub; font-size: 0.75em; }
      .candid-tiptap-editor hr {
        border: none;
        border-top: 1px solid ${colors.cardBorder};
        margin: 12px 0;
      }
      .candid-tiptap-editor table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
      }
      .candid-tiptap-editor th,
      .candid-tiptap-editor td {
        border: 1px solid ${colors.cardBorder};
        padding: 6px 10px;
        text-align: left;
      }
      .candid-tiptap-editor th {
        background-color: ${colors.background};
        font-weight: 600;
      }
      .candid-tiptap-editor ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }
      .candid-tiptap-editor ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .candid-tiptap-editor ul[data-type="taskList"] li label input[type="checkbox"] {
        margin-top: 3px;
      }
      .candid-tiptap-editor .footnote-ref {
        color: ${colors.primary};
        cursor: pointer;
        font-weight: 600;
        font-size: 0.7em;
        padding: 0 1px;
        vertical-align: super;
      }
      .candid-tiptap-editor .footnote-ref:hover {
        text-decoration: underline;
      }
      .footnote-highlight {
        background-color: ${colors.primary}22;
        border-radius: 3px;
        transition: background-color 0.3s ease;
      }
      .candid-footnotes-section {
        padding: 0 12px 8px;
      }
      .candid-footnotes-divider {
        border: none;
        border-top: 1px solid ${colors.cardBorder};
        margin: 8px 0;
      }
      .candid-footnote-def {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-size: 13px;
        line-height: 1.5;
        color: ${colors.secondaryText};
        padding: 2px 4px;
        border-radius: 3px;
      }
      .candid-footnote-def:hover {
        background-color: ${colors.background};
      }
      .candid-footnote-def-label {
        color: ${colors.primary};
        font-weight: 600;
        margin-right: 4px;
        cursor: pointer;
      }
      .candid-footnote-def-label:hover {
        text-decoration: underline;
      }
      .candid-footnote-def-text {
        cursor: pointer;
        flex: 1;
      }
      .candid-footnote-def-text:hover {
        text-decoration: underline;
        text-decoration-style: dotted;
      }
      .candid-footnote-edit-btn,
      .candid-footnote-delete-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0 3px;
        font-size: 13px;
        color: ${colors.secondaryText};
        opacity: 0;
        transition: opacity 0.15s;
        flex-shrink: 0;
      }
      .candid-footnote-def:hover .candid-footnote-edit-btn,
      .candid-footnote-def:hover .candid-footnote-delete-btn {
        opacity: 1;
      }
      .candid-footnote-edit-btn:hover {
        color: ${colors.primary};
      }
      .candid-footnote-delete-btn:hover {
        color: ${colors.error || '#d32f2f'};
      }
    `
    return React.createElement('style', { dangerouslySetInnerHTML: { __html: css } })
  }, [colors])

  // Extract footnotes reactively from editor state
  const footnotes = useMemo(() => {
    if (!editor) return []
    return extractFootnotes(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state])

  // Footnote editing state — WysiwygEditor watches this to open the modal
  const [editingFootnote, setEditingFootnote] = useState(null)
  const clearEditingFootnote = useCallback(() => setEditingFootnote(null), [])

  const editorJSX = editor ? React.createElement('div', { className: 'candid-editor-wrap' },
    React.createElement(EditorContent, { editor }),
    footnotes.length > 0 ? React.createElement('div', { className: 'candid-footnotes-section' },
      React.createElement('hr', { className: 'candid-footnotes-divider' }),
      ...footnotes.map(fn =>
        React.createElement('div', {
          key: fn.label,
          id: `fndef-${fn.label}`,
          className: 'candid-footnote-def',
        },
          React.createElement('span', {
            className: 'candid-footnote-def-label',
            onClick: () => {
              const ref = document.getElementById(`fnref-${fn.label}`)
              if (ref) {
                ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                ref.classList.add('footnote-highlight')
                setTimeout(() => ref.classList.remove('footnote-highlight'), 1500)
              }
            },
          }, `[${fn.label}]`),
          React.createElement('span', {
            className: 'candid-footnote-def-text',
            onClick: () => setEditingFootnote({ label: fn.label, text: fn.text }),
            title: 'Click to edit',
          }, ` ${fn.text}`),
          React.createElement('button', {
            className: 'candid-footnote-edit-btn',
            onClick: (e) => { e.stopPropagation(); setEditingFootnote({ label: fn.label, text: fn.text }) },
            'aria-label': 'Edit footnote',
          }, '\u270E'),
          React.createElement('button', {
            className: 'candid-footnote-delete-btn',
            onClick: (e) => {
              e.stopPropagation()
              if (!editor) return
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'footnoteRef' && node.attrs.label === fn.label) {
                  editor.chain().focus().command(({ tr }) => {
                    tr.delete(pos, pos + node.nodeSize)
                    return true
                  }).run()
                }
              })
            },
            'aria-label': 'Delete footnote',
          }, '\u00D7'),
        )
      )
    ) : null,
  ) : null

  // Update the text attribute of an existing footnoteRef node
  const updateFootnoteText = useCallback((label, newText) => {
    if (!editor) return
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'footnoteRef' && node.attrs.label === label) {
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: newText })
          return true
        }).run()
      }
    })
  }, [editor])

  return {
    editorJSX,
    themeJSX,
    editorState,
    editingFootnote,
    clearEditingFootnote,
    actions: {
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
      toggleHeading: (level) => editor?.chain().focus().toggleHeading({ level }).run(),
      setLink: (url) => editor?.chain().focus().setLink({ href: url }).run(),
      setImage: (url) => editor?.chain().focus().setImage({ src: url }).run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleTaskList: () => editor?.chain().focus().toggleTaskList().run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleSuperscript: () => editor?.chain().focus().toggleSuperscript().run(),
      toggleSubscript: () => editor?.chain().focus().toggleSubscript().run(),
      setHorizontalRule: () => editor?.chain().focus().setHorizontalRule().run(),
      insertTable: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      insertFootnote: (label, text) => editor?.chain().focus().insertContent({
        type: 'footnoteRef',
        attrs: { label: String(label), text },
      }).run(),
      updateFootnoteText,
      undo: () => editor?.chain().focus().undo().run(),
      redo: () => editor?.chain().focus().redo().run(),
    },
    getHTML: async () => editor?.getHTML() || '',
    setContent: (html) => editor?.commands.setContent(html || ''),
    focus: () => editor?.commands.focus(),
    blur: () => editor?.commands.blur(),
  }
}

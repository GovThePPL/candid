import { FootnoteRef } from '../tiptapFootnote'
import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

export const FootnoteBridge = new BridgeExtension({
  tiptapExtension: FootnoteRef,
  onBridgeMessage: (editor, message) => {
    if (message.type === 'insert-footnote') {
      const { label, text } = message.payload || {}
      editor.chain().focus().insertContent({
        type: 'footnoteRef',
        attrs: { label: label || '1', text: text || '' },
      }).run()
    }
    if (message.type === 'update-footnote-text') {
      const { label, text } = message.payload || {}
      // Traverse the doc and update the matching footnoteRef node
      const { state } = editor
      let found = false
      state.doc.descendants((node, pos) => {
        if (found) return false
        if (node.type.name === 'footnoteRef' && node.attrs.label === label) {
          editor.chain().focus()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, text })
              return true
            })
            .run()
          found = true
          return false
        }
      })
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertFootnote: (label, text) =>
      sendBridgeMessage({
        type: 'insert-footnote',
        payload: { label, text },
      }),
    updateFootnoteText: (label, text) =>
      sendBridgeMessage({
        type: 'update-footnote-text',
        payload: { label, text },
      }),
  }),
  extendEditorState: (editor) => {
    // Check if cursor is on or adjacent to a footnoteRef node
    const { selection } = editor.state
    const { $from } = selection
    let editingFootnoteLabel = null
    let editingFootnoteText = null

    // Check node at cursor position
    const nodeAfter = $from.nodeAfter
    if (nodeAfter && nodeAfter.type.name === 'footnoteRef') {
      editingFootnoteLabel = nodeAfter.attrs.label
      editingFootnoteText = nodeAfter.attrs.text
    } else {
      // Check node before cursor (common when cursor is right after a footnote)
      const nodeBefore = $from.nodeBefore
      if (nodeBefore && nodeBefore.type.name === 'footnoteRef') {
        editingFootnoteLabel = nodeBefore.attrs.label
        editingFootnoteText = nodeBefore.attrs.text
      }
    }

    return {
      editingFootnoteLabel,
      editingFootnoteText,
    }
  },
  extendCSS: `
    .footnote-ref {
      color: #5C005C;
      cursor: pointer;
      font-size: 0.75em;
      vertical-align: super;
      font-weight: 600;
    }
    .footnote-ref:hover { text-decoration: underline; }
    .footnote-highlight { background-color: rgba(92, 0, 92, 0.15); transition: background-color 0.3s; }
    .footnote-defs { border-top: 1px solid #ccc; margin-top: 16px; padding-top: 8px; font-size: 0.85em; }
    .footnote-def { padding: 2px 0; cursor: pointer; }
    .footnote-def:hover { background-color: rgba(0,0,0,0.04); }
    .footnote-def-label { font-weight: 600; color: #5C005C; margin-right: 4px; }
  `,
})

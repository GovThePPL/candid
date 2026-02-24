import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

/**
 * Custom bridge for inserting a link with text at the cursor.
 *
 * TenTap's built-in LinkBridge.setLink() only applies a mark to the
 * current selection.  On Android, opening a Modal clears the WebView's
 * selection, so setLink() does nothing.  This bridge checks the selection
 * on the WebView side and inserts text + link mark when nothing is selected.
 *
 * No tiptapExtension needed — the Link extension is already loaded via
 * the standard LinkBridge.
 */
export const LinkInsertBridge = new BridgeExtension({
  onBridgeMessage: (editor, message) => {
    if (message.type === 'insert-link-content') {
      const { url, text } = message.payload || {}
      if (!url) return false

      const { from, to } = editor.state.selection
      if (from !== to) {
        // Text is selected — apply link mark to selection
        editor.chain().focus().setLink({ href: url }).run()
      } else {
        // No selection — insert text with link mark
        editor.chain().focus().insertContent({
          type: 'text',
          text: text || url,
          marks: [{ type: 'link', attrs: { href: url } }],
        }).run()
      }
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertLinkContent: (url, text) =>
      sendBridgeMessage({
        type: 'insert-link-content',
        payload: { url, text },
      }),
  }),
})

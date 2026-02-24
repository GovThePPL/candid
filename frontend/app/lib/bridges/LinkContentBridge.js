import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

/**
 * Custom bridge that extends TenTap's built-in LinkBridge to support
 * inserting a link with custom text when nothing is selected.
 *
 * TenTap's LinkBridge only applies a link URL to the current selection.
 * This bridge adds `insertLinkContent(url, text)` which inserts new text
 * with a link mark at the cursor position.
 */
export const LinkContentBridge = new BridgeExtension({
  forceName: 'linkContent',
  onBridgeMessage: (editor, message) => {
    if (message.type === 'insert-link-content') {
      const { url, text } = message.payload || {}
      if (!url) return false

      const { from, to } = editor.state.selection
      if (from !== to) {
        // Text is selected — apply link to selection
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

import { Subscript } from '@tiptap/extension-subscript'
import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

export const SubscriptBridge = new BridgeExtension({
  tiptapExtension: Subscript,
  onBridgeMessage: (editor, message) => {
    if (message.type === 'toggle-subscript') {
      editor.chain().focus().toggleSubscript().run()
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    toggleSubscript: () =>
      sendBridgeMessage({ type: 'toggle-subscript' }),
  }),
  extendEditorState: (editor) => ({
    isSubscriptActive: editor.isActive('subscript'),
    canToggleSubscript: editor.can().toggleSubscript(),
  }),
  extendCSS: 'sub { vertical-align: sub; font-size: 0.75em; }',
})

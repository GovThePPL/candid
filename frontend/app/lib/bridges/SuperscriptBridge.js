import { Superscript } from '@tiptap/extension-superscript'
import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

export const SuperscriptBridge = new BridgeExtension({
  tiptapExtension: Superscript,
  onBridgeMessage: (editor, message) => {
    if (message.type === 'toggle-superscript') {
      editor.chain().focus().toggleSuperscript().run()
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    toggleSuperscript: () =>
      sendBridgeMessage({ type: 'toggle-superscript' }),
  }),
  extendEditorState: (editor) => ({
    isSuperscriptActive: editor.isActive('superscript'),
    canToggleSuperscript: editor.can().toggleSuperscript(),
  }),
  extendCSS: 'sup { vertical-align: super; font-size: 0.75em; }',
})

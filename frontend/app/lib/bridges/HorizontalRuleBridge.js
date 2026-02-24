import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

// HorizontalRule is included in TipTap's StarterKit (via CoreBridge),
// so no tiptapExtension needed — just the bridge for native actions.
export const HorizontalRuleBridge = new BridgeExtension({
  forceName: 'horizontalRule',
  onBridgeMessage: (editor, message) => {
    if (message.type === 'set-horizontal-rule') {
      editor.chain().focus().setHorizontalRule().run()
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    setHorizontalRule: () =>
      sendBridgeMessage({ type: 'set-horizontal-rule' }),
  }),
  extendEditorState: () => ({
    canSetHorizontalRule: true,
  }),
})

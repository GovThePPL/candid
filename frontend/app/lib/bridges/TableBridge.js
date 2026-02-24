import BridgeExtension from '@10play/tentap-editor/src/bridges/base'

// Table TipTap extensions (Table, TableRow, TableHeader, TableCell) are registered
// directly in customEditor/src/Tiptap.tsx via tiptapOptions.extensions.
// They MUST NOT be imported here — Table.configure() creates objects with circular
// references that break JSON.stringify in TenTap's bridge message path.

const TABLE_COMMANDS = {
  insertTable: (editor, args) =>
    editor.chain().focus().insertTable(args || { rows: 3, cols: 3, withHeaderRow: true }).run(),
  deleteTable: (editor) =>
    editor.chain().focus().deleteTable().run(),
  addRowBefore: (editor) =>
    editor.chain().focus().addRowBefore().run(),
  addRowAfter: (editor) =>
    editor.chain().focus().addRowAfter().run(),
  deleteRow: (editor) =>
    editor.chain().focus().deleteRow().run(),
  addColumnBefore: (editor) =>
    editor.chain().focus().addColumnBefore().run(),
  addColumnAfter: (editor) =>
    editor.chain().focus().addColumnAfter().run(),
  deleteColumn: (editor) =>
    editor.chain().focus().deleteColumn().run(),
  mergeCells: (editor) =>
    editor.chain().focus().mergeCells().run(),
  splitCell: (editor) =>
    editor.chain().focus().splitCell().run(),
  toggleHeaderRow: (editor) =>
    editor.chain().focus().toggleHeaderRow().run(),
  toggleHeaderColumn: (editor) =>
    editor.chain().focus().toggleHeaderColumn().run(),
}

export const TableBridge = new BridgeExtension({
  forceName: 'table',
  onBridgeMessage: (editor, message) => {
    if (message.type === 'table-command') {
      const handler = TABLE_COMMANDS[message.payload?.command]
      if (handler) handler(editor, message.payload?.args)
    }
    return false
  },
  extendEditorInstance: (sendBridgeMessage) => {
    const send = (command, args) =>
      sendBridgeMessage({ type: 'table-command', payload: { command, args } })
    return {
      insertTable: (args) => send('insertTable', args),
      deleteTable: () => send('deleteTable'),
      addRowBefore: () => send('addRowBefore'),
      addRowAfter: () => send('addRowAfter'),
      deleteRow: () => send('deleteRow'),
      addColumnBefore: () => send('addColumnBefore'),
      addColumnAfter: () => send('addColumnAfter'),
      deleteColumn: () => send('deleteColumn'),
      mergeCells: () => send('mergeCells'),
      splitCell: () => send('splitCell'),
      toggleHeaderRow: () => send('toggleHeaderRow'),
      toggleHeaderColumn: () => send('toggleHeaderColumn'),
    }
  },
  extendEditorState: (editor) => ({
    isInTable: editor.isActive('table'),
  }),
  extendCSS: `
    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    td, th { border: 1px solid #ccc; padding: 6px 10px; min-width: 40px; vertical-align: top; }
    th { background-color: rgba(0,0,0,0.05); font-weight: 600; }
    .selectedCell { background-color: rgba(200, 200, 255, 0.3); }
  `,
})

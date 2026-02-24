import React, { useEffect, useState, useCallback } from 'react'
import { EditorContent } from '@tiptap/react'
import { useTenTap, TenTapStartKit } from '@10play/tentap-editor/web'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

// Custom bridges — resolved via Vite alias 'tentap-bridges-base' → source file
import { SuperscriptBridge } from '../../bridges/SuperscriptBridge'
import { SubscriptBridge } from '../../bridges/SubscriptBridge'
import { HorizontalRuleBridge } from '../../bridges/HorizontalRuleBridge'
import { TableBridge } from '../../bridges/TableBridge'
import { FootnoteBridge } from '../../bridges/FootnoteBridge'
import { LinkContentBridge } from '../../bridges/LinkContentBridge'

// TableBridge has no tiptapExtension on the native side (Table.configure() creates
// circular refs that break JSON.stringify). Set them here on the web side only —
// native and WebView are separate JS environments so this mutation is web-only.
TableBridge.tiptapExtension = Table.configure({ resizable: false })
TableBridge.tiptapExtensionDeps = [TableRow, TableHeader, TableCell]

// HorizontalRuleBridge also has no tiptapExtension on the native side (CoreBridge
// uses Document, not StarterKit, so HorizontalRule must be registered explicitly).
HorizontalRuleBridge.tiptapExtension = HorizontalRule

declare global {
  interface Window {
    whiteListBridgeExtensions?: string[]
    dynamicHeight?: boolean
    contentInjected?: boolean
  }
}

// Combine default TenTap bridges with our custom ones
const allBridges = [
  ...TenTapStartKit,
  SuperscriptBridge,
  SubscriptBridge,
  HorizontalRuleBridge,
  TableBridge,
  FootnoteBridge,
  LinkContentBridge,
]

// Filter by whitelist if present (same as TenTap default)
const tenTapExtensions = allBridges.filter(
  (e) =>
    !window.whiteListBridgeExtensions ||
    window.whiteListBridgeExtensions.includes(e.name)
)

/**
 * Extract footnote definitions from the editor's document.
 * Returns array of { label, text } sorted by label.
 */
function extractFootnotes(editor: any): Array<{ label: string; text: string }> {
  if (!editor) return []
  const notes: Array<{ label: string; text: string }> = []
  editor.state.doc.descendants((node: any) => {
    if (node.type.name === 'footnoteRef') {
      notes.push({ label: node.attrs.label, text: node.attrs.text })
    }
  })
  return notes
}

export default function Tiptap() {
  const editor = useTenTap({ bridges: tenTapExtensions })
  const [footnotes, setFootnotes] = useState<Array<{ label: string; text: string }>>([])

  // Update footnotes on every editor update
  useEffect(() => {
    if (!editor) return
    const updateFootnotes = () => setFootnotes(extractFootnotes(editor))
    updateFootnotes()
    editor.on('update', updateFootnotes)
    editor.on('selectionUpdate', updateFootnotes)
    return () => {
      editor.off('update', updateFootnotes)
      editor.off('selectionUpdate', updateFootnotes)
    }
  }, [editor])

  const scrollToRef = useCallback((label: string) => {
    const el = document.getElementById(`fnref-${label}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      el.classList.add('footnote-highlight')
      setTimeout(() => el.classList.remove('footnote-highlight'), 1500)
    }
  }, [])

  return (
    <div className={window.dynamicHeight ? 'dynamic-height' : undefined}>
      <EditorContent editor={editor} />
      {footnotes.length > 0 && (
        <div className="footnote-defs">
          {footnotes.map((fn) => (
            <div
              key={fn.label}
              id={`fndef-${fn.label}`}
              className="footnote-def"
              onClick={() => scrollToRef(fn.label)}
            >
              <span className="footnote-def-label">[{fn.label}]</span>
              {fn.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

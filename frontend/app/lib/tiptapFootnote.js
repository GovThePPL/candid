import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const footnotePluginKey = new PluginKey('footnoteRenumber')

/**
 * TipTap extension for inline footnote references.
 *
 * Renders as a clickable wiki-style [1] bracket in the editor. The footnote
 * text is stored in a `data-footnote-text` attribute so it round-trips through
 * HTML without needing a separate definition block.
 *
 * A ProseMirror plugin auto-renumbers all footnotes sequentially (1, 2, 3...)
 * by document order after every transaction.
 *
 * Clicking an inline [1] ref scrolls to the definition at the bottom; clicking
 * a definition scrolls back to the ref.
 *
 * HTML format:
 *   <span data-footnote="1" data-footnote-text="Some note">[1]</span>
 *
 * Markdown format:
 *   Reference: [^1]
 *   Definition: [^1]: Some note
 */
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      label: {
        default: '1',
        parseHTML: (el) => el.getAttribute('data-footnote') || '1',
        renderHTML: (attrs) => ({ 'data-footnote': attrs.label }),
      },
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-footnote-text') || '',
        renderHTML: (attrs) => ({ 'data-footnote-text': attrs.text }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-footnote]' },
      { tag: 'sup[data-footnote]' }, // backwards compat
    ]
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        'data-footnote': node.attrs.label,
        'data-footnote-text': node.attrs.text,
        class: 'footnote-ref',
        id: `fnref-${node.attrs.label}`,
        title: node.attrs.text,
      },
      `[${node.attrs.label}]`,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('sup')
      dom.className = 'footnote-ref'
      dom.setAttribute('data-footnote', node.attrs.label)
      dom.setAttribute('data-footnote-text', node.attrs.text)
      dom.textContent = `[${node.attrs.label}]`
      dom.title = node.attrs.text
      dom.id = `fnref-${node.attrs.label}`
      dom.style.cursor = 'pointer'

      const scrollToDef = () => {
        const target = document.getElementById(`fndef-${node.attrs.label}`)
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          target.classList.add('footnote-highlight')
          setTimeout(() => target.classList.remove('footnote-highlight'), 1500)
        }
      }
      dom.addEventListener('click', scrollToDef)

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'footnoteRef') return false
          dom.setAttribute('data-footnote', updatedNode.attrs.label)
          dom.setAttribute('data-footnote-text', updatedNode.attrs.text)
          dom.textContent = `[${updatedNode.attrs.label}]`
          dom.title = updatedNode.attrs.text
          dom.id = `fnref-${updatedNode.attrs.label}`
          dom.onclick = () => {
            const target = document.getElementById(`fndef-${updatedNode.attrs.label}`)
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              target.classList.add('footnote-highlight')
              setTimeout(() => target.classList.remove('footnote-highlight'), 1500)
            }
          }
          return true
        },
        destroy() {
          dom.removeEventListener('click', scrollToDef)
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnotePluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          // Collect all footnoteRef nodes with their positions
          const footnotes = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'footnoteRef') {
              footnotes.push({ pos, node })
            }
          })

          // Check if any label doesn't match its sequential position
          let needsUpdate = false
          for (let i = 0; i < footnotes.length; i++) {
            if (footnotes[i].node.attrs.label !== String(i + 1)) {
              needsUpdate = true
              break
            }
          }
          if (!needsUpdate) return null

          // Renumber all footnotes sequentially by document order
          const tr = newState.tr
          for (let i = 0; i < footnotes.length; i++) {
            const { pos, node } = footnotes[i]
            if (node.attrs.label !== String(i + 1)) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                label: String(i + 1),
              })
            }
          }
          return tr
        },
      }),
    ]
  },
})

/**
 * Extract all footnotes from a TipTap editor's document in order.
 * Returns [{ label: '1', text: '...' }, ...].
 */
export function extractFootnotes(editor) {
  if (!editor) return []
  const notes = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef') {
      notes.push({ label: node.attrs.label, text: node.attrs.text })
    }
  })
  return notes
}

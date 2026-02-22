import { marked } from 'marked'

// Enable GFM features (strikethrough, tables, task lists)
marked.use({ gfm: true })

let turndown = null

function getTurndown() {
  if (!turndown) {
    const _td = require('turndown')
    const TurndownService = _td.default || _td
    const _gfm = require('turndown-plugin-gfm')
    const gfm = _gfm.gfm || _gfm.default?.gfm || _gfm.default
    turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    })
    turndown.use(gfm) // strikethrough, tables, task lists

    // Strip <p> wrappers inside table cells and list items so conversion
    // produces clean text without extra blank lines
    turndown.addRule('blockParagraph', {
      filter: (node) => {
        if (node.nodeName !== 'P' || !node.parentNode) return false
        const parent = node.parentNode.nodeName
        return parent === 'TD' || parent === 'TH' || parent === 'LI'
      },
      replacement: (content) => content.trim(),
    })

    // Custom table rule — overrides GFM plugin to reliably handle TipTap's
    // table format (colspan/rowspan attrs, <p> wrappers, no <thead>)
    turndown.addRule('tiptapTable', {
      filter: 'table',
      replacement: (_content, node) => {
        const rows = []
        let hasHeader = false
        // Walk descendants to find <tr> elements
        const collectNodes = (parent, tag) => {
          const found = []
          for (let c = parent.firstChild; c; c = c.nextSibling) {
            if (c.nodeName === tag) found.push(c)
            else found.push(...collectNodes(c, tag))
          }
          return found
        }
        const trs = collectNodes(node, 'TR')
        for (let i = 0; i < trs.length; i++) {
          const tr = trs[i]
          const cells = []
          let allTh = true
          for (let c = tr.firstChild; c; c = c.nextSibling) {
            if (c.nodeName === 'TH' || c.nodeName === 'TD') {
              if (c.nodeName !== 'TH') allTh = false
              cells.push(c.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' '))
            }
          }
          if (i === 0 && allTh) hasHeader = true
          rows.push(cells)
        }
        if (rows.length === 0) return ''
        const colCount = Math.max(...rows.map(r => r.length))
        const pad = r => r.concat(Array(Math.max(0, colCount - r.length)).fill(''))
        const lines = []
        lines.push('| ' + pad(rows[0]).join(' | ') + ' |')
        lines.push('| ' + Array(colCount).fill('---').join(' | ') + ' |')
        for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
          lines.push('| ' + pad(rows[i]).join(' | ') + ' |')
        }
        return '\n\n' + lines.join('\n') + '\n\n'
      },
    })

    // Clean list items — turndown defaults to 3-space indent after markers,
    // override to standard 1-space (e.g. "- Item" not "-   Item")
    turndown.addRule('listItem', {
      filter: 'li',
      replacement: (content, node, options) => {
        content = content
          .replace(/^\n+/, '')
          .replace(/\n+$/, '\n')
          .replace(/\n/gm, '\n  ')
        let prefix = options.bulletListMarker + ' '
        const parent = node.parentNode
        if (parent.nodeName === 'OL') {
          const start = parent.getAttribute('start')
          const index = Array.prototype.indexOf.call(parent.children, node)
          prefix = (start ? Number(start) + index : index + 1) + '. '
        }
        return prefix + content.trim() + (node.nextSibling ? '\n' : '')
      },
    })

    // Superscript/subscript — no standard markdown, keep as HTML
    turndown.addRule('superscript', {
      filter: (node) => node.nodeName === 'SUP' && !node.hasAttribute('data-footnote'),
      replacement: (content) => `<sup>${content}</sup>`,
    })
    turndown.addRule('subscript', {
      filter: 'sub',
      replacement: (content) => `<sub>${content}</sub>`,
    })

    // Footnote refs: <span data-footnote="1" ...>[1]</span> → [^1]
    turndown.addRule('footnoteRef', {
      filter: (node) =>
        (node.nodeName === 'SPAN' || node.nodeName === 'SUP') &&
        node.hasAttribute('data-footnote'),
      replacement: (_content, node) => `[^${node.getAttribute('data-footnote')}]`,
    })
  }
  return turndown
}

/**
 * Extract footnote definitions from markdown and replace refs with
 * TipTap-compatible <span> elements before passing to marked.
 */
function preprocessFootnotes(md) {
  // Extract [^label]: text definitions
  const defs = {}
  let cleaned = md.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, label, text) => {
    defs[label] = text.trim()
    return ''
  })

  // Replace [^label] references with <span> HTML (marked passes raw HTML through)
  cleaned = cleaned.replace(/\[\^([^\]]+)\]/g, (_, label) => {
    const text = (defs[label] || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return `<span data-footnote="${label}" data-footnote-text="${text}">[${label}]</span>`
  })

  return cleaned
}

/**
 * Collect footnote definitions from HTML data attributes and append
 * as markdown definitions at the end of the converted markdown.
 */
function appendFootnoteDefs(md, html) {
  const defs = []
  const seen = new Set()
  const regex = /data-footnote="([^"]*)"[^>]*data-footnote-text="([^"]*)"/g
  let m
  while ((m = regex.exec(html)) !== null) {
    const label = m[1]
    if (seen.has(label)) continue
    seen.add(label)
    const text = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    if (text) defs.push(`[^${label}]: ${text}`)
  }
  if (defs.length > 0) {
    return md.trimEnd() + '\n\n' + defs.join('\n')
  }
  return md
}

export function markdownToHtml(md) {
  if (!md) return ''
  return marked.parse(preprocessFootnotes(md))
}

export function htmlToMarkdown(html) {
  if (!html) return ''
  let md
  if (typeof document !== 'undefined') {
    md = getTurndown().turndown(html)
  } else {
    md = htmlToMarkdownRegex(html)
  }
  // Collapse excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n').trim()
  return appendFootnoteDefs(md, html)
}

/**
 * Regex-based HTML→markdown fallback for native (no DOM required).
 * Handles the subset of HTML that TenTap/TipTap produces.
 */
function htmlToMarkdownRegex(html) {
  let md = html

  // Pre/code blocks (before other processing)
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) =>
    '\n```\n' + decodeEntities(code).trim() + '\n```\n'
  )

  // Headings
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) =>
    '\n' + '#'.repeat(Number(level)) + ' ' + stripTags(text).trim() + '\n'
  )

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = htmlToMarkdownRegex(inner).trim()
    return '\n' + text.split('\n').map(l => '> ' + l).join('\n') + '\n'
  })

  // Task lists (before regular lists)
  md = md.replace(/<ul[^>]*class="[^"]*contains-task-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, li) => {
      const checked = /<input[^>]*checked[^>]*>/i.test(li)
      const text = stripTags(li).trim()
      return `- [${checked ? 'x' : ' '}] ${text}\n`
    })
    return '\n' + items
  })

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableInner) => {
    const rows = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch
    while ((rowMatch = rowRegex.exec(tableInner)) !== null) {
      const cells = []
      const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
      let cellMatch
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripTags(cellMatch[1]).trim())
      }
      rows.push(cells)
    }
    if (rows.length === 0) return ''
    const colCount = Math.max(...rows.map(r => r.length))
    const lines = rows.map(r => '| ' + r.concat(Array(colCount - r.length).fill('')).join(' | ') + ' |')
    if (lines.length > 0) {
      const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |'
      lines.splice(1, 0, sep)
    }
    return '\n' + lines.join('\n') + '\n'
  })

  // Footnote refs (before generic tag stripping)
  md = md.replace(/<(?:span|sup)[^>]*data-footnote="([^"]*)"[^>]*>[^<]*<\/(?:span|sup)>/gi, (_, label) =>
    `[^${label}]`
  )

  // Lists
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let i = 0
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, li) => {
      i++
      return i + '. ' + stripTags(li).trim() + '\n'
    })
    return '\n' + stripTags(items)
  })
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, li) =>
      '- ' + stripTags(li).trim() + '\n'
    )
    return '\n' + stripTags(items)
  })

  // Horizontal rule
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n')

  // Images (before links)
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, (_, src) => `![](${src})`)

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) =>
    `[${stripTags(text).trim()}](${href})`
  )

  // Strikethrough
  md = md.replace(/<(del|s|strike)>([\s\S]*?)<\/\1>/gi, (_, _t, text) => `~~${text}~~`)

  // Bold
  md = md.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, _t, text) => `**${text}**`)

  // Italic
  md = md.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_, _t, text) => `_${text}_`)

  // Inline code
  md = md.replace(/<code>([\s\S]*?)<\/code>/gi, (_, text) => '`' + decodeEntities(text) + '`')

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n')

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => text.trim() + '\n\n')

  // Strip remaining tags
  md = stripTags(md)

  // Decode HTML entities
  md = decodeEntities(md)

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n').trim()

  return md
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '')
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

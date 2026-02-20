/**
 * Quote utilities for the chat quoting system.
 *
 * Quote format uses markdown link syntax:
 *   [excerpt...](M5)         — full quote of message #5
 *   [excerpt...](M5:25-128)  — characters 25-128 of message #5
 *   [excerpt...](S2)         — full quote of agreed statement #2
 *   [excerpt...](D1)         — full quote of definition #1
 *   [excerpt...](E1)         — full quote of explanation #1
 *
 * M = message, S = agreed statement, D = definition, E = explanation. Numbers are 1-based sequential within the chat.
 */

/** Matches a single quote-link line: [text](M5) or [text](M5:25-128) or [text](S2) or [text](D1) or [text](E1) */
export const QUOTE_LINK_RE = /^\[([^\]]*)\]\(([MSDE])(\d+)(?::(\d+)-(\d+))?\)$/

/** Inline regex for detecting quote links within mixed content */
const QUOTE_LINK_INLINE_RE = /\[([^\]]*)\]\(([MSDE])(\d+)(?::(\d+)-(\d+))?\)/

/**
 * Check if a single line is a quote link.
 * @param {string} line
 * @returns {boolean}
 */
export function isQuoteLine(line) {
  return QUOTE_LINK_RE.test(line.trim())
}

/**
 * Split message content into segments for rendering.
 * Lines that are purely a quote link become 'quote' segments;
 * consecutive non-quote lines become 'text' segments.
 *
 * @param {string} content
 * @returns {Array<{type: 'quote'|'text', ...}>}
 */
export function splitIntoSegments(content) {
  if (!content) return []

  const lines = content.split('\n')
  const segments = []
  let textBuffer = []

  const flushText = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer.join('\n') })
      textBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(QUOTE_LINK_RE)

    if (match) {
      flushText()
      segments.push({
        type: 'quote',
        excerptText: match[1],
        prefix: match[2],
        num: parseInt(match[3], 10),
        start: match[4] != null ? parseInt(match[4], 10) : null,
        end: match[5] != null ? parseInt(match[5], 10) : null,
        rawLine: trimmed,
      })
    } else {
      textBuffer.push(line)
    }
  }

  flushText()
  return segments
}

/**
 * Build quote markup to insert into the text input.
 * Truncates the excerpt to ~40 characters.
 *
 * @param {string} prefix - 'M' or 'S'
 * @param {number} num - sequential number
 * @param {string} fullText - the source text being quoted
 * @param {{ start: number, end: number }} [range] - optional character range
 * @returns {string}
 */
export function buildQuoteMarkup(prefix, num, fullText, range) {
  const MAX_EXCERPT = 40
  let text = fullText || ''

  // If range specified, extract the ranged text
  if (range && range.start != null && range.end != null) {
    text = text.slice(range.start, range.end)
  }

  // Strip any existing quote markup from the excerpt display
  // Replace newlines with spaces so the quote link stays on a single line
  text = stripQuoteMarkup(text).replace(/\n/g, ' ').trim()

  // Truncate for display
  const excerpt = text.length > MAX_EXCERPT
    ? text.slice(0, MAX_EXCERPT) + '...'
    : text

  const ref = range && range.start != null && range.end != null
    ? `${prefix}${num}:${range.start}-${range.end}`
    : `${prefix}${num}`

  return `[${excerpt}](${ref})`
}

/**
 * Strip all quote markup from content, returning plain text.
 * Replaces quote links with just their excerpt text.
 *
 * @param {string} content
 * @returns {string}
 */
export function stripQuoteMarkup(content) {
  if (!content) return ''
  return content.replace(
    new RegExp(QUOTE_LINK_INLINE_RE.source, 'g'),
    (_, excerpt) => excerpt
  )
}

/**
 * Check if content contains any quote links.
 * @param {string} content
 * @returns {boolean}
 */
export function hasQuotes(content) {
  if (!content) return false
  return QUOTE_LINK_INLINE_RE.test(content)
}

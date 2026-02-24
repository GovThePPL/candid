import { Text, Platform } from 'react-native'

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,30})/g
const ROLE_KEYWORDS = new Set(['admin', 'moderator', 'facilitator', 'liaison', 'expert'])

/**
 * Apply mention highlighting to a text string. Returns an array of
 * string/element segments suitable for nesting inside a <Text>.
 */
function applyMentionHighlight(text, nodeKey, mentionStyle, roleStyle, onMentionPress) {
  if (!text || !onMentionPress || !text.includes('@')) return [text]

  const parts = []
  let lastIndex = 0
  let match

  MENTION_REGEX.lastIndex = 0
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const username = match[1]
    const isRole = ROLE_KEYWORDS.has(username.toLowerCase())
    parts.push(
      <Text
        key={`${nodeKey}-m-${match.index}`}
        onPress={() => onMentionPress(username)}
        accessibilityRole="link"
        style={isRole ? roleStyle : mentionStyle}
      >
        {match[0]}
      </Text>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

/**
 * Create a custom react-native-markdown-display rule for the `text` node type
 * that post-processes text nodes to inject glossary term highlights and/or
 * @mention highlights.
 *
 * @param {RegExp} matchPattern - Glossary term regex (with capture group)
 * @param {Map} termMap - Map from lowercase term/alias → { slug, term }
 * @param {Function} onTermPress - Called with slug when a highlighted term is tapped
 * @param {Object} highlightStyle - Style object for highlighted terms
 * @param {Object} [mentionOpts] - Optional mention highlighting options
 * @param {Function} [mentionOpts.onMentionPress] - Called with username on tap
 * @param {Object} [mentionOpts.mentionStyle] - Style for user mentions
 * @param {Object} [mentionOpts.roleStyle] - Style for role mentions
 * @returns {Object} Rules object to merge into markdown component's `rules` prop
 */
export function createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle, mentionOpts) {
  const hasGlossary = matchPattern && termMap && onTermPress
  const hasMention = mentionOpts?.onMentionPress

  if (!hasGlossary && !hasMention) return {}

  return {
    text: (node, children, parent, styles) => {
      const content = node.content || ''
      if (!content) return null

      // --- Glossary-only path ---
      if (hasGlossary && !hasMention) {
        const segments = content.split(matchPattern)
        if (segments.length === 1) {
          return <Text key={node.key} style={styles.text}>{content}</Text>
        }
        return (
          <Text key={node.key} style={styles.text}>
            {segments.map((segment, i) => {
              if (!segment) return null
              if (i % 2 === 0) return segment
              const info = termMap.get(segment.toLowerCase())
              if (!info) return segment
              return (
                <Text key={`${node.key}-${i}`} onPress={() => onTermPress(info.slug)} accessibilityRole="link" style={highlightStyle}>
                  {segment}
                </Text>
              )
            })}
          </Text>
        )
      }

      // --- Mention-only path ---
      if (!hasGlossary && hasMention) {
        const parts = applyMentionHighlight(content, node.key, mentionOpts.mentionStyle, mentionOpts.roleStyle, mentionOpts.onMentionPress)
        if (parts.length === 1 && typeof parts[0] === 'string') {
          return <Text key={node.key} style={styles.text}>{content}</Text>
        }
        return <Text key={node.key} style={styles.text}>{parts}</Text>
      }

      // --- Combined path (glossary + mention) ---
      const segments = content.split(matchPattern)
      if (segments.length === 1) {
        // No glossary matches — try mentions
        const parts = applyMentionHighlight(content, node.key, mentionOpts.mentionStyle, mentionOpts.roleStyle, mentionOpts.onMentionPress)
        if (parts.length === 1 && typeof parts[0] === 'string') {
          return <Text key={node.key} style={styles.text}>{content}</Text>
        }
        return <Text key={node.key} style={styles.text}>{parts}</Text>
      }

      return (
        <Text key={node.key} style={styles.text}>
          {segments.map((segment, i) => {
            if (!segment) return null
            // Odd indices are glossary matches
            if (i % 2 !== 0) {
              const info = termMap.get(segment.toLowerCase())
              if (!info) return segment
              return (
                <Text key={`${node.key}-g-${i}`} onPress={() => onTermPress(info.slug)} accessibilityRole="link" style={highlightStyle}>
                  {segment}
                </Text>
              )
            }
            // Even indices are plain text — apply mention highlighting
            const parts = applyMentionHighlight(segment, `${node.key}-${i}`, mentionOpts.mentionStyle, mentionOpts.roleStyle, mentionOpts.onMentionPress)
            return parts.length === 1 && typeof parts[0] === 'string' ? segment : parts
          })}
        </Text>
      )
    },
  }
}

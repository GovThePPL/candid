import { Text } from 'react-native'

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,30})/g
const ROLE_KEYWORDS = new Set(['admin', 'moderator', 'facilitator', 'liaison', 'expert'])

/**
 * Create a custom react-native-markdown-display rule for the `text` node type
 * that highlights @mentions as colored tappable text.
 *
 * @param {Function} onMentionPress - Called with username when a mention is tapped
 * @param {Object} mentionStyle - Style object for user @mentions
 * @param {Object} roleStyle - Style object for role @mentions (@admin, etc.)
 * @returns {Object} Rules object to merge into markdown component's `rules` prop
 */
export function createMentionTextRule(onMentionPress, mentionStyle, roleStyle) {
  if (!onMentionPress) return {}

  return {
    text: (node, children, parent, styles) => {
      const content = node.content || ''
      if (!content || !content.includes('@')) {
        return (
          <Text key={node.key} style={styles.text}>
            {content}
          </Text>
        )
      }

      // Split on @mention pattern
      const parts = []
      let lastIndex = 0
      let match

      MENTION_REGEX.lastIndex = 0
      while ((match = MENTION_REGEX.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
        }
        const username = match[1]
        const isRole = ROLE_KEYWORDS.has(username.toLowerCase())
        parts.push({ type: 'mention', value: match[0], username, isRole })
        lastIndex = match.index + match[0].length
      }

      // Add remaining text
      if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) })
      }

      // No mentions found
      if (parts.length === 1 && parts[0].type === 'text') {
        return (
          <Text key={node.key} style={styles.text}>
            {content}
          </Text>
        )
      }

      return (
        <Text key={node.key} style={styles.text}>
          {parts.map((part, i) => {
            if (part.type === 'text') return part.value
            return (
              <Text
                key={`${node.key}-m-${i}`}
                onPress={() => onMentionPress(part.username)}
                accessibilityRole="link"
                style={part.isRole ? roleStyle : mentionStyle}
              >
                {part.value}
              </Text>
            )
          })}
        </Text>
      )
    },
  }
}

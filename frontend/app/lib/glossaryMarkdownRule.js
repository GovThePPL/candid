import { Text, Platform } from 'react-native'

/**
 * Create a custom react-native-markdown-display rule for the `text` node type
 * that post-processes text nodes to inject glossary term highlights.
 *
 * @param {RegExp} matchPattern - Glossary term regex (with capture group)
 * @param {Map} termMap - Map from lowercase term/alias → { slug, term }
 * @param {Function} onTermPress - Called with slug when a highlighted term is tapped
 * @param {Object} highlightStyle - Style object for highlighted terms
 * @returns {Object} Rules object to merge into markdown component's `rules` prop
 */
export function createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle) {
  if (!matchPattern || !termMap || !onTermPress) return {}

  return {
    text: (node, children, parent, styles) => {
      const content = node.content || ''
      if (!content) return null

      const segments = content.split(matchPattern)

      // No matches — return as-is with default styling
      if (segments.length === 1) {
        return (
          <Text key={node.key} style={styles.text}>
            {content}
          </Text>
        )
      }

      return (
        <Text key={node.key} style={styles.text}>
          {segments.map((segment, i) => {
            if (!segment) return null

            // Even indices are plain text, odd indices are regex matches
            if (i % 2 === 0) return segment

            const info = termMap.get(segment.toLowerCase())
            if (!info) return segment

            return (
              <Text
                key={`${node.key}-${i}`}
                onPress={() => onTermPress(info.slug)}
                accessibilityRole="link"
                style={highlightStyle}
              >
                {segment}
              </Text>
            )
          })}
        </Text>
      )
    },
  }
}

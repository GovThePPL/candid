import { memo, useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import ThemedText from '../ThemedText'

/**
 * Embedded quote bubble rendered inside a parent message bubble.
 *
 * @param {Object} props
 * @param {string|null} props.senderName - "@username" or null for own messages
 * @param {string} props.bubbleColor - Background color (sender's bubble color)
 * @param {ReactNode} props.children - Recursive ChatMessageContent
 * @param {Function} [props.onPress] - Tap-to-scroll callback
 */
export default memo(function QuotedBlock({ senderName, bubbleColor, children, onPress }) {
  const { t } = useTranslation('chat')
  const styles = useMemo(() => createStyles(bubbleColor), [bubbleColor])

  const content = (
    <View style={styles.container}>
      {senderName && (
        <ThemedText variant="caption" style={styles.senderName}>
          {senderName}
        </ThemedText>
      )}
      <View style={styles.contentWrapper}>
        {children}
      </View>
    </View>
  )

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityHint={t('scrollToQuoteA11y')}
        style={styles.touchable}
      >
        {content}
      </TouchableOpacity>
    )
  }

  return content
})

/**
 * Lighten a hex color by mixing it with white.
 * @param {string} hex - e.g. '#5C005C'
 * @param {number} amount - 0 = no change, 1 = white (0.3 = 30% lighter)
 */
function lightenColor(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `rgb(${lr}, ${lg}, ${lb})`
}

const createStyles = (bubbleColor) => StyleSheet.create({
  touchable: {
    marginVertical: 4,
  },
  container: {
    // Use a solid lightened shade — semi-transparent over a colored parent produces wrong hues
    backgroundColor: bubbleColor ? lightenColor(bubbleColor, 0.25) : 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.5)',
  },
  senderName: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginBottom: 2,
  },
  contentWrapper: {
    // Content is rendered by recursive ChatMessageContent
  },
})

import { useMemo, useState, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BorderRadius, Spacing } from '../../constants/Theme'
import ThemedText from '../ThemedText'

/**
 * Extracts headings from markdown content and renders a collapsible
 * table of contents for wiki articles.
 *
 * @param {Object} props
 * @param {string} props.content - Markdown content to extract headings from
 * @param {Function} [props.onHeadingPress] - Called with heading text when tapped
 */
export default function TableOfContents({ content, onHeadingPress }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [expanded, setExpanded] = useState(true)

  const headings = useMemo(() => {
    if (!content) return []
    const lines = content.split('\n')
    const result = []
    let inCodeBlock = false
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        result.push({ level: match[1].length, text: match[2].replace(/[*_~`]/g, '').trim() })
      }
    }
    return result
  }, [content])

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  if (headings.length < 2) return null

  const minLevel = Math.min(...headings.map(h => h.level))

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={t('tocToggleA11y')}
        accessibilityState={{ expanded }}
      >
        <Ionicons name="list-outline" size={16} color={colors.secondaryText} />
        <ThemedText variant="label" color="secondary">{t('tocTitle')}</ThemedText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.secondaryText}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {headings.map((heading, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.item, { paddingLeft: 12 + (heading.level - minLevel) * 16 }]}
              onPress={() => onHeadingPress?.(heading.text)}
              accessibilityRole="link"
              accessibilityLabel={heading.text}
            >
              <ThemedText
                variant={heading.level <= 2 ? 'bodySmall' : 'caption'}
                color={heading.level <= 2 ? 'dark' : 'secondary'}
                numberOfLines={1}
              >
                {heading.text}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.cardBackground,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingVertical: Spacing.xs,
  },
  item: {
    paddingVertical: 4,
    paddingRight: 12,
  },
})

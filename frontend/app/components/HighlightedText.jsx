import { memo, useMemo } from 'react'
import { Text, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { Typography, TypographyScaleCaps } from '../constants/Theme'
import { useGlossary } from '../contexts/GlossaryContext'

const HEADING_VARIANTS = new Set(['h1', 'h2', 'h3', 'h4'])

// Map color shortcut names to theme/semantic color tokens (same as ThemedText)
function resolveColor(colorName, colors) {
  if (!colorName) return undefined
  const map = {
    text: colors.text,
    title: colors.title,
    primary: colors.primary,
    secondary: colors.secondaryText,
    placeholder: colors.placeholderText,
    dark: colors.darkText,
    badge: colors.badgeText,
    inverse: '#FFFFFF',
  }
  return map[colorName]
}

/**
 * Text component that auto-highlights glossary terms as tappable links.
 * Wraps the same logic as ThemedText but splits text by glossary regex.
 *
 * @param {Object} props - All ThemedText props plus:
 * @param {boolean} [props.highlightTerms=true] - Enable/disable glossary highlighting
 * @param {Function} [props.onTermPress] - Called with term slug when tapped
 * @param {string} [props.sessionId] - Filter terms to this session context
 */
const HighlightedText = memo(({
  style,
  variant,
  color,
  title = false,
  maxFontSizeMultiplier,
  accessibilityRole,
  highlightTerms = true,
  onTermPress,
  sessionId,
  children,
  ...props
}) => {
  const colors = useThemeColors()
  const { t } = useTranslation('glossary')
  const { matchPattern, termMap, getFilteredPattern } = useGlossary()

  const resolvedColor = color
    ? resolveColor(color, colors)
    : title ? colors.title : colors.text

  const variantStyle = variant ? Typography[variant] : undefined

  const scaleCap = maxFontSizeMultiplier !== undefined
    ? maxFontSizeMultiplier
    : variant ? TypographyScaleCaps[variant] : undefined

  const resolvedRole = accessibilityRole !== undefined
    ? accessibilityRole
    : HEADING_VARIANTS.has(variant) ? 'header' : undefined

  // Choose the appropriate pattern based on category context
  const pattern = useMemo(() => {
    if (!highlightTerms || !onTermPress) return null
    return sessionId ? getFilteredPattern(sessionId) : matchPattern
  }, [highlightTerms, onTermPress, sessionId, getFilteredPattern, matchPattern])

  // Determine highlight color based on text color context
  const isInverse = color === 'inverse'
  const highlightColor = isInverse ? '#FFFFFF' : colors.primary

  const baseStyle = [{ color: resolvedColor }, variantStyle, style]

  // If no pattern or children is not a string, render as plain text
  if (!pattern || typeof children !== 'string') {
    return (
      <Text
        accessibilityRole={resolvedRole}
        maxFontSizeMultiplier={scaleCap}
        style={baseStyle}
        {...props}
      >
        {children}
      </Text>
    )
  }

  // Split text by glossary regex (capture group produces alternating segments)
  const segments = children.split(pattern)

  return (
    <Text
      accessibilityRole={resolvedRole}
      maxFontSizeMultiplier={scaleCap}
      style={baseStyle}
      {...props}
    >
      {segments.map((segment, i) => {
        if (!segment) return null

        // Even indices are plain text, odd indices are matches
        if (i % 2 === 0) return segment

        const info = termMap.get(segment.toLowerCase())
        if (!info) return segment

        return (
          <Text
            key={`${i}-${segment}`}
            onPress={() => onTermPress(info.slug)}
            accessibilityRole="link"
            accessibilityHint={t('termLinkA11y', { term: info.term })}
            style={{
              color: highlightColor,
              ...(Platform.OS === 'web'
                ? { textDecorationLine: 'underline', textDecorationStyle: 'dotted' }
                : { backgroundColor: colors.primary + '20', borderRadius: 2 }),
            }}
          >
            {segment}
          </Text>
        )
      })}
    </Text>
  )
})

export default HighlightedText

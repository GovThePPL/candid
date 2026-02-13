import { useMemo, useCallback } from 'react'
import { Linking } from 'react-native'
import Markdown from 'react-native-markdown-display'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography } from '../../constants/Theme'

/**
 * Themed markdown renderer for post bodies and comments.
 *
 * @param {Object} props
 * @param {string} props.content - Markdown string to render
 * @param {'post'|'comment'} [props.variant='post'] - Controls heading/sizing
 */
export default function MarkdownRenderer({ content, variant = 'post' }) {
  const colors = useThemeColors()
  const markdownStyles = useMemo(() => createMarkdownStyles(colors, variant), [colors, variant])
  const rules = useMemo(() => ({
    image: () => null,
  }), [])

  const handleLinkPress = useCallback((url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      Linking.openURL(url)
      return false
    }
    return true
  }, [])

  if (!content) return null

  return (
    <Markdown style={markdownStyles} rules={rules} onLinkPress={handleLinkPress}>
      {content}
    </Markdown>
  )
}

const createMarkdownStyles = (colors, variant) => {
  const isComment = variant === 'comment'

  const base = {
    body: {
      color: colors.text,
      ...(isComment ? Typography.bodySmall : Typography.body),
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    link: {
      color: colors.primary,
    },
    blockquote: {
      borderLeftColor: colors.cardBorder,
      borderLeftWidth: 3,
      paddingLeft: 12,
      marginLeft: 0,
      backgroundColor: 'transparent',
    },
    code_inline: {
      backgroundColor: colors.cardBackground,
      color: colors.text,
      borderColor: colors.cardBorder,
    },
    fence: {
      backgroundColor: colors.cardBackground,
      color: colors.text,
      borderColor: colors.cardBorder,
      borderRadius: 6,
      padding: 12,
    },
    code_block: {
      backgroundColor: colors.cardBackground,
      color: colors.text,
      borderColor: colors.cardBorder,
      borderRadius: 6,
      padding: 12,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    strong: {
      fontWeight: '700',
    },
    em: {
      fontStyle: 'italic',
    },
    hr: {
      backgroundColor: colors.cardBorder,
      height: 1,
    },
  }

  // Only enable headings for post variant
  if (!isComment) {
    base.heading1 = {
      ...Typography.h1,
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    }
    base.heading2 = {
      ...Typography.h2,
      color: colors.text,
      marginTop: 12,
      marginBottom: 6,
    }
    base.heading3 = {
      ...Typography.h3,
      color: colors.text,
      marginTop: 8,
      marginBottom: 4,
    }
  } else {
    // Flatten headings to body text in comments
    base.heading1 = { ...Typography.bodySmall, color: colors.text, fontWeight: '700' }
    base.heading2 = { ...Typography.bodySmall, color: colors.text, fontWeight: '700' }
    base.heading3 = { ...Typography.bodySmall, color: colors.text, fontWeight: '700' }
  }

  return base
}

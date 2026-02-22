import { memo, useMemo, useCallback, useRef } from 'react'
import { View, Text, Image, Linking } from 'react-native'
import Markdown from 'react-native-markdown-display'
import MarkdownIt from 'markdown-it'
import taskListPlugin from 'markdown-it-task-lists'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography } from '../../constants/Theme'
import { API_BASE_URL } from '../../lib/api'

// No markdown-it-footnote — its tokens have block=false which breaks
// react-native-markdown-display's groupTextTokens (corrupts the AST).
// Footnotes are preprocessed into standard markdown instead.
const mdParser = MarkdownIt({ typographer: true, html: true })
  .use(taskListPlugin, { enabled: true })

/**
 * Preprocess footnote syntax into standard markdown before parsing.
 * Converts [^N] refs to <sup> HTML tags and appends definitions at the end.
 */
function preprocessFootnotes(md) {
  if (!md || !md.includes('[^')) return md

  // Extract definitions: [^label]: text
  const defs = {}
  const defRegex = /^\[\^([^\]]+)\]:\s*(.+)$/gm
  let cleaned = md.replace(defRegex, (match, label, text) => {
    defs[label] = text.trim()
    return ''
  })

  // No definitions found — return as-is
  if (Object.keys(defs).length === 0) return md

  // Assign sequential numbers to labels in order of first reference
  const labelOrder = []
  const refRegex = /\[\^([^\]]+)\]/g
  let refMatch
  while ((refMatch = refRegex.exec(cleaned)) !== null) {
    if (defs[refMatch[1]] && !labelOrder.includes(refMatch[1])) {
      labelOrder.push(refMatch[1])
    }
  }

  // Replace references with self-closing HTML tag that the html_inline rule renders as tappable superscript
  cleaned = cleaned.replace(/\[\^([^\]]+)\]/g, (match, label) => {
    const idx = labelOrder.indexOf(label)
    if (idx === -1) return match
    return `<fnref data-n="${idx + 1}"/>`
  })

  // Remove trailing blank lines from removed definitions
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trimEnd()

  // Append footnotes section
  if (labelOrder.length > 0) {
    cleaned += '\n\n---\n\n'
    labelOrder.forEach((label, i) => {
      cleaned += `**[${i + 1}]** ${defs[label] || ''}\n\n`
    })
  }

  return cleaned
}

/**
 * Extract plain text from a react-native-markdown-display AST node.
 */
function extractNodeText(node) {
  if (node.content) return node.content
  if (node.children) return node.children.map(extractNodeText).join('')
  return ''
}

/**
 * Themed markdown renderer for post bodies and comments.
 *
 * @param {Object} props
 * @param {string} props.content - Markdown string to render
 * @param {'post'|'comment'|'wiki'} [props.variant='post'] - Controls heading/sizing; 'wiki' allows images
 * @param {Function} [props.onHeadingLayout] - Called with (headingText, yPosition) when a heading is laid out
 */
export default memo(function MarkdownRenderer({ content, variant = 'post', glossaryRules, onLinkPress: onLinkPressProp, onHeadingLayout }) {
  const colors = useThemeColors()
  const linkPressRef = useRef(onLinkPressProp)
  linkPressRef.current = onLinkPressProp
  const markdownStyles = useMemo(() => createMarkdownStyles(colors, variant), [colors, variant])
  const rules = useMemo(() => {
    const r = { ...glossaryRules }
    if (variant !== 'wiki') {
      r.image = () => null
    } else {
      // Wiki images: resolve relative API URLs (e.g. /api/v1/wiki/images/{id})
      const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
      r.image = (node, children, parent, styles) => {
        let src = node.attributes?.src || ''
        if (src.startsWith('/')) {
          src = apiOrigin + src
        }
        return (
          <Image
            key={node.key}
            source={{ uri: src }}
            style={{ width: '100%', minHeight: 200, borderRadius: 6 }}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel={node.attributes?.alt || ''}
          />
        )
      }
    }

    // Heading render rules — report layout positions for scroll-to-heading
    if (onHeadingLayout) {
      const headingRule = (level) => (node, children, parent, styles) => {
        const text = extractNodeText(node).replace(/[*_~`]/g, '').trim()
        return (
          <View
            key={node.key}
            style={styles[`_VIEW_SAFE_heading${level}`]}
            onLayout={(e) => onHeadingLayout(text, e.nativeEvent.layout.y)}
          >
            {children}
          </View>
        )
      }
      for (let i = 1; i <= 6; i++) r[`heading${i}`] = headingRule(i)
    }

    // html_inline render rules (sup, sub, task list checkboxes, footnote refs)
    r.html_inline = (node) => {
      const raw = node.content || ''
      const fnMatch = raw.match(/^<fnref data-n="(\d+)"\s*\/>$/)
      if (fnMatch) {
        const fnNum = fnMatch[1]
        return (
          <Text
            key={node.key}
            style={{ fontSize: 10, lineHeight: 14, color: colors.primary }}
            onPress={() => linkPressRef.current?.(`#fn-${fnNum}`)}
            accessibilityRole="link"
          >
            [{fnNum}]
          </Text>
        )
      }
      if (raw.startsWith('<sup>')) {
        const text = raw.replace(/<\/?sup>/g, '')
        return <Text key={node.key} style={{ fontSize: 10, lineHeight: 14 }}>{text}</Text>
      }
      if (raw.startsWith('<sub>')) {
        const text = raw.replace(/<\/?sub>/g, '')
        return <Text key={node.key} style={{ fontSize: 10, lineHeight: 14 }}>{text}</Text>
      }
      if (raw.includes('type="checkbox"')) {
        const checked = raw.includes('checked')
        return <Text key={node.key}>{checked ? '\u2611 ' : '\u2610 '}</Text>
      }
      if (raw.startsWith('</')) return null
      return null
    }

    return r
  }, [glossaryRules, variant, colors, onHeadingLayout])

  const handleLinkPress = useCallback((url) => {
    if (onLinkPressProp) return onLinkPressProp(url)
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      Linking.openURL(url)
      return false
    }
    return true
  }, [onLinkPressProp])

  const processed = useMemo(() => content ? preprocessFootnotes(content) : null, [content])

  if (!processed) return null

  return (
    <Markdown style={markdownStyles} rules={rules} onLinkPress={handleLinkPress} markdownit={mdParser}>
      {processed}
    </Markdown>
  )
})

const createMarkdownStyles = (colors, variant) => {
  const isComment = variant === 'comment'

  const base = {
    body: {
      color: colors.text,
      ...(isComment ? Typography.bodySmall : Typography.body),
    },
    text: {
      color: colors.text,
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
    s: {
      textDecorationLine: 'line-through',
    },
    table: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 4,
      marginBottom: 8,
    },
    thead: {
      backgroundColor: colors.background,
    },
    th: {
      padding: 6,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      fontWeight: '600',
    },
    td: {
      padding: 6,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
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

import { memo, useMemo, useCallback, useRef, useState, useEffect } from 'react'
import { View, Text, Image, Linking, TouchableOpacity, Modal, ScrollView, useWindowDimensions, Platform, BackHandler } from 'react-native'
import Markdown from 'react-native-markdown-display'
import MarkdownIt from 'markdown-it'
import taskListPlugin from 'markdown-it-task-lists'
import supPlugin from 'markdown-it-sup'
import subPlugin from 'markdown-it-sub'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography } from '../../constants/Theme'
import { API_BASE_URL } from '../../lib/api'

/**
 * Custom markdown-it inline rule to parse <fnref data-n="N"/> tags as
 * dedicated tokens instead of relying on html: true.
 */
function fnrefPlugin(md) {
  md.inline.ruler.push('fnref', (state, silent) => {
    const src = state.src.slice(state.pos)
    const match = src.match(/^<fnref data-n="(\d+)"\s*\/>/)
    if (!match) return false
    if (!silent) {
      const token = state.push('fnref', '', 0)
      token.content = match[1]
    }
    state.pos += match[0].length
    return true
  })
}

// No markdown-it-footnote — its tokens have block=false which breaks
// react-native-markdown-display's groupTextTokens (corrupts the AST).
// Footnotes are preprocessed into standard markdown instead.
// html: false prevents XSS from user-authored HTML in markdown content.
const mdParser = MarkdownIt({ typographer: true, html: false })
  .use(taskListPlugin, { enabled: true })
  .use(supPlugin)
  .use(subPlugin)
  .use(fnrefPlugin)

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
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const { width: screenWidth } = useWindowDimensions()
  const linkPressRef = useRef(onLinkPressProp)
  linkPressRef.current = onLinkPressProp
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const lightboxHistoryRef = useRef(false)
  const markdownStyles = useMemo(() => createMarkdownStyles(colors, variant), [colors, variant])

  const openLightbox = useCallback((url) => {
    setLightboxUrl(url)
    if (Platform.OS === 'web') {
      window.history.pushState({ lightbox: true }, '')
      lightboxHistoryRef.current = true
    }
  }, [])

  const closeLightbox = useCallback(() => {
    if (Platform.OS === 'web' && lightboxHistoryRef.current) {
      lightboxHistoryRef.current = false
      window.history.back()
    }
    setLightboxUrl(null)
  }, [])

  // Web: browser back button pops our history entry — close lightbox
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handlePopState = () => {
      if (lightboxHistoryRef.current) {
        lightboxHistoryRef.current = false
        setLightboxUrl(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Native: explicit BackHandler so react-native-screens can't preempt the Modal
  useEffect(() => {
    if (Platform.OS === 'web' || !lightboxUrl) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setLightboxUrl(null)
      return true
    })
    return () => sub.remove()
  }, [lightboxUrl])

  const rules = useMemo(() => {
    const r = { ...glossaryRules }
    if (variant !== 'wiki') {
      r.image = () => null
    } else {
      // Wiki images: resolve relative API URLs (e.g. /api/v1/wiki/images/{id})
      const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
      // Content area width minus typical padding
      const imgWidth = screenWidth - 48
      r.image = (node, children, parent, styles) => {
        let src = node.attributes?.src || ''
        if (src.startsWith('/')) {
          src = apiOrigin + src
        }
        return (
          <TouchableOpacity
            key={node.key}
            onPress={() => openLightbox(src)}
            activeOpacity={0.8}
            accessibilityRole="image"
            accessibilityLabel={node.attributes?.alt || ''}
            accessibilityHint="Tap to view full size"
          >
            <Image
              source={{ uri: src }}
              style={{
                width: imgWidth,
                height: imgWidth * 0.6,
                borderRadius: 6,
                marginVertical: 8,
              }}
              resizeMode="contain"
            />
          </TouchableOpacity>
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

    // Footnote ref render rule (custom fnref token from fnrefPlugin)
    r.fnref = (node) => {
      const fnNum = node.content || ''
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

    return r
  }, [glossaryRules, variant, colors, onHeadingLayout, screenWidth, openLightbox])

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
    <>
      <Markdown style={markdownStyles} rules={rules} onLinkPress={handleLinkPress} markdownit={mdParser}>
        {processed}
      </Markdown>

      {/* Image lightbox modal — pinch-to-zoom + pan via ScrollView */}
      {variant === 'wiki' && (
        <Modal
          visible={!!lightboxUrl}
          transparent
          animationType="fade"
          onRequestClose={closeLightbox}
        >
          <View style={lightboxStyles.overlay}>
            <TouchableOpacity
              style={lightboxStyles.closeButton}
              onPress={closeLightbox}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              hitSlop={12}
            >
              <Text style={lightboxStyles.closeText}>{'\u2715'}</Text>
            </TouchableOpacity>
            <ScrollView
              style={lightboxStyles.scrollView}
              contentContainerStyle={lightboxStyles.scrollContent}
              maximumZoomScale={5}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeLightbox}
                style={lightboxStyles.imageTouchArea}
              >
                <Image
                  source={{ uri: lightboxUrl }}
                  style={{
                    width: screenWidth,
                    height: screenWidth * 1.2,
                  }}
                  resizeMode="contain"
                  accessibilityRole="image"
                />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>
      )}
    </>
  )
})

const lightboxStyles = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageTouchArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
}

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

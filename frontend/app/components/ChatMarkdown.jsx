import { memo, useMemo, useCallback } from 'react'
import { Linking } from 'react-native'
import Markdown from 'react-native-markdown-display'
import { Typography } from '../constants/Theme'

/**
 * Lightweight markdown renderer for chat bubbles.
 * Renders white text on colored backgrounds (bold, italic, links, code).
 * No headers, images, or tables.
 *
 * @param {Object} props
 * @param {string} props.content - Message text (may contain markdown)
 */
export default memo(function ChatMarkdown({ content }) {
  const styles = useMemo(() => chatMarkdownStyles, [])
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
    <Markdown style={styles} rules={rules} onLinkPress={handleLinkPress}>
      {content}
    </Markdown>
  )
})

const chatMarkdownStyles = {
  body: {
    ...Typography.body,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 0,
  },
  link: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  strong: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  em: {
    fontStyle: 'italic',
    color: '#FFFFFF',
  },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#FFFFFF',
    borderColor: 'transparent',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    borderColor: 'transparent',
    borderRadius: 6,
    padding: 8,
  },
  code_block: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    borderColor: 'transparent',
    borderRadius: 6,
    padding: 8,
  },
  blockquote: {
    borderLeftColor: 'rgba(255,255,255,0.4)',
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginLeft: 0,
    backgroundColor: 'transparent',
  },
  bullet_list: {
    marginBottom: 0,
  },
  ordered_list: {
    marginBottom: 0,
  },
  list_item: {
    marginBottom: 2,
  },
  hr: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    height: 1,
  },
  // Flatten headings to body text
  heading1: { ...Typography.body, color: '#FFFFFF', fontWeight: '700' },
  heading2: { ...Typography.body, color: '#FFFFFF', fontWeight: '700' },
  heading3: { ...Typography.body, color: '#FFFFFF', fontWeight: '700' },
}

import { memo, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import ChatMarkdown from '../ChatMarkdown'
import ThemedText from '../ThemedText'
import QuotedBlock from './QuotedBlock'
import { splitIntoSegments, stripQuoteMarkup } from '../../lib/quoteUtils'

/**
 * Pre-processes message content into QuotedBlock + ChatMarkdown segments.
 * Replaces direct ChatMarkdown usage in renderMessage.
 *
 * @param {Object} props
 * @param {string} props.content - Message text (may contain quote links)
 * @param {Object} props.messageMap - M-number → message object mapping (1-based)
 * @param {Object} props.positionMap - S-number → position object mapping (1-based)
 * @param {Object} [props.definitionMap] - D-number → definition object mapping (1-based)
 * @param {Object} [props.explanationMap] - E-number → explanation object mapping (1-based)
 * @param {string} props.currentUserId - Current user's ID
 * @param {Object} [props.otherUser] - Other user object (for sender name)
 * @param {Object} props.colors - Theme colors
 * @param {Function} [props.onQuotePress] - Callback when a quote is tapped: (prefix, num)
 * @param {number} [props.depth=0] - Recursion depth (prevents infinite nesting)
 */
function ChatMessageContent({
  content,
  messageMap,
  positionMap,
  definitionMap,
  explanationMap,
  currentUserId,
  otherUser,
  colors,
  onQuotePress,
  glossaryRules,
  depth = 0,
}) {
  const MAX_DEPTH = 5

  const segments = useMemo(() => splitIntoSegments(content), [content])

  if (!segments.length) return null

  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return <ChatMarkdown key={i} content={seg.content} glossaryRules={glossaryRules} />
    }

    // Prevent infinite recursion
    if (depth >= MAX_DEPTH) {
      return <ChatMarkdown key={i} content={seg.rawLine} glossaryRules={glossaryRules} />
    }

    // Resolve the source message, position, definition, or explanation
    const source = seg.prefix === 'M'
      ? messageMap?.[seg.num]
      : seg.prefix === 'S'
        ? positionMap?.[seg.num]
        : seg.prefix === 'D'
          ? definitionMap?.[seg.num]
          : explanationMap?.[seg.num]

    if (!source) {
      // Fallback: render as plain text if source not found
      return <ChatMarkdown key={i} content={seg.rawLine} glossaryRules={glossaryRules} />
    }

    // Quote color matches the quoted source's type/sender:
    // - Definitions → blue (definitionAccent)
    // - Quoting yourself → purple (messageYou)
    // - Quoting the other user → green (agreeBubble)
    const senderId = String(
      source.sender_id || source.senderId || source.sender || source.proposerId || source.proposer_id || source.definerId || source.definer_id || ''
    )
    const isOwnQuote = senderId === String(currentUserId)
    const bubbleColor = seg.prefix === 'D'
      ? colors.definitionAccent
      : seg.prefix === 'E'
        ? colors.explanationAccent
        : isOwnQuote ? colors.messageYou : colors.agreeBubble

    // Show sender name for the other user's quoted messages
    const senderName = !isOwnQuote && otherUser?.username
      ? `@${otherUser.username}`
      : null

    // Resolve actual quoted text (definitions use 'definition' field, explanations use 'explanation')
    const sourceContent = seg.prefix === 'D'
      ? (source.definition || '')
      : seg.prefix === 'E'
        ? (source.explanation || '')
        : (source.content || '')
    const plainText = stripQuoteMarkup(sourceContent)
    const quotedText = seg.start != null && seg.end != null
      ? plainText.slice(seg.start, seg.end)
      : sourceContent

    // Definitions get special rendering: bold term + italic definition
    if (seg.prefix === 'D' && source.term) {
      return (
        <QuotedBlock
          key={i}
          senderName={senderName}
          bubbleColor={bubbleColor}
          onPress={onQuotePress ? () => onQuotePress(seg.prefix, seg.num) : undefined}
        >
          <View>
            <ThemedText variant="body" color="inverse" style={styles.defTerm}>{source.term}</ThemedText>
            <ChatMarkdown content={`*${quotedText}*`} glossaryRules={glossaryRules} />
          </View>
        </QuotedBlock>
      )
    }

    return (
      <QuotedBlock
        key={i}
        senderName={senderName}
        bubbleColor={bubbleColor}
        onPress={onQuotePress ? () => onQuotePress(seg.prefix, seg.num) : undefined}
      >
        <ChatMessageContent
          content={quotedText}
          messageMap={messageMap}
          positionMap={positionMap}
          definitionMap={definitionMap}
          explanationMap={explanationMap}
          currentUserId={currentUserId}
          otherUser={otherUser}
          colors={colors}
          onQuotePress={onQuotePress}
          glossaryRules={glossaryRules}
          depth={depth + 1}
        />
      </QuotedBlock>
    )
  })
}

const styles = StyleSheet.create({
  defTerm: {
    fontWeight: '700',
    marginBottom: 2,
  },
})

export default memo(ChatMessageContent)

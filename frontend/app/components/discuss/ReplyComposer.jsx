import { useState, useMemo, useCallback, useRef } from 'react'
import {
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
const KBAvoidingView = Platform.OS !== 'web'
  ? require('react-native-keyboard-controller').KeyboardAvoidingView
  : null
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import useModalBackHandler from '../../hooks/useModalBackHandler'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import MarkdownRenderer from './MarkdownRenderer'
import WysiwygEditor from '../WysiwygEditor'
import { formatRelativeTime } from '../../lib/timeUtils'

/**
 * Reply composer supporting two modes:
 * - 'modal' (default): Full-screen modal overlay with parent comment preview
 * - 'inline': Compact inline view rendered below the comment being replied to
 *
 * Uses WysiwygEditor for WYSIWYG rich text editing (bold, italic, links, etc.)
 */
export default function ReplyComposer({ visible, comment, onSubmit, onClose, posting, mode = 'modal', mentionParticipants }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const isInline = mode === 'inline'
  const styles = useMemo(() => createStyles(colors, isInline), [colors, isInline])
  const insets = useSafeAreaInsets()
  const { keyboardHeight } = useKeyboardHeight()
  useModalBackHandler(visible && !isInline, onClose)

  const editorRef = useRef(null)
  const [hasContent, setHasContent] = useState(false)
  const [useVisual, setUseVisual] = useState(false)

  const handleClose = useCallback(() => {
    editorRef.current?.setContent('')
    setHasContent(false)
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!hasContent || posting) return
    const markdown = await editorRef.current?.getMarkdown()
    const trimmed = markdown?.trim()
    if (!trimmed) return
    await onSubmit(trimmed)
    editorRef.current?.setContent('')
    setHasContent(false)
  }, [hasContent, posting, onSubmit])

  const handleContentChange = useCallback((html) => {
    // Check if there's meaningful content (strip tags and whitespace)
    const text = html?.replace(/<[^>]*>/g, '').trim()
    setHasContent(!!text)
  }, [])

  // Don't mount children when hidden — Modal mounts children even with
  // visible={false}, which would trigger autoFocus and open the keyboard.
  if (!visible) return null

  const authorName = comment?.creator?.username || '?'
  const canSubmit = hasContent && !posting

  // Shared action bar + editor content (used in both modes)
  const actionBarAndEditor = (
    <>
      {/* Action bar (cancel + submit) */}
      <View style={styles.actionBar}>
        <View style={styles.toolbarSpacer} />
        <TouchableOpacity
          onPress={() => setUseVisual(!useVisual)}
          style={styles.toolbarButton}
          accessibilityRole="switch"
          accessibilityState={{ checked: useVisual }}
          accessibilityLabel={t('replyComposerEditorToggleA11y')}
        >
          <ThemedText variant="caption" color="secondary">
            {useVisual ? t('replyComposerTextEditor') : t('replyComposerVisualEditor')}
          </ThemedText>
        </TouchableOpacity>
        {isInline && (
          <TouchableOpacity
            onPress={handleClose}
            style={styles.toolbarButton}
            accessibilityRole="button"
            accessibilityLabel={t('replyComposerCancelA11y')}
          >
            <ThemedText variant="caption" color="secondary">
              {t('common:cancel')}
            </ThemedText>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.submitPill, !canSubmit && styles.submitPillDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('replyComposerSubmitA11y', { author: authorName })}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText variant="buttonSmall" color="inverse">
              {t('replyComposerSubmit')}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      {/* WYSIWYG Editor */}
      <View style={styles.editorArea}>
        <WysiwygEditor
          ref={editorRef}
          allowImages={false}
          placeholder={t('replyComposerPlaceholder')}
          onContentChange={handleContentChange}
          fullScreen={!isInline}
          minHeight={isInline ? 80 : undefined}
          maxHeight={isInline ? 200 : undefined}
          externalMode={useVisual ? 'visual' : 'markdown'}
          mentionParticipants={mentionParticipants}
        />
      </View>
    </>
  )

  // --- Inline mode: render as a bordered View inline in the thread ---
  if (isInline) {
    return (
      <View style={styles.inlineContainer}>
        {actionBarAndEditor}
      </View>
    )
  }

  // --- Modal mode (default) ---
  const content = (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom }]}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('replyComposerCancelA11y')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Parent comment */}
      {comment && (
        <ScrollView style={styles.parentScroll} contentContainerStyle={styles.parentContent}>
          <View style={styles.parentMeta}>
            <ThemedText variant="caption" color="secondary">
              @{authorName}
            </ThemedText>
            {comment.createdTime && (
              <>
                <ThemedText variant="caption" color="secondary"> · </ThemedText>
                <ThemedText variant="caption" color="secondary">
                  {formatRelativeTime(comment.createdTime, t)}
                </ThemedText>
              </>
            )}
          </View>
          <MarkdownRenderer content={comment.body} variant="comment" />
        </ScrollView>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {actionBarAndEditor}

      {/* Web keyboard spacer */}
      {Platform.OS === 'web' && keyboardHeight > 0 && (
        <View style={{ height: keyboardHeight }} />
      )}
    </View>
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      {Platform.OS === 'web' ? content : (
        <KBAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
          {content}
        </KBAvoidingView>
      )}
    </Modal>
  )
}

const createStyles = (colors, isInline) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Inline mode container
  inlineContainer: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  // Header (modal only)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  submitPill: {
    backgroundColor: colors.primary,
    paddingVertical: isInline ? Spacing.xs : Spacing.sm,
    paddingHorizontal: isInline ? Spacing.lg : Spacing.xl,
    borderRadius: BorderRadius.pill,
  },
  submitPillDisabled: {
    opacity: 0.5,
  },
  // Parent comment (modal only)
  parentScroll: {
    maxHeight: '40%',
  },
  parentContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  parentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  // Action bar (cancel + submit)
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isInline ? Spacing.md : Spacing.lg,
    paddingHorizontal: isInline ? Spacing.md : Spacing.lg,
    paddingVertical: isInline ? Spacing.xs : Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  toolbarSpacer: {
    flex: 1,
  },
  // Editor
  editorArea: {
    ...(isInline ? {
      minHeight: 80,
      maxHeight: 200,
      ...(Platform.OS === 'web' ? { overflow: 'hidden' } : {}),
    } : { flex: 1 }),
    paddingHorizontal: isInline ? Spacing.sm : Spacing.md,
    paddingVertical: isInline ? Spacing.xs : Spacing.sm,
  },
})

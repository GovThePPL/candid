import { useState, useMemo, useCallback, useRef } from 'react'
import {
  View,
  TextInput,
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
import { Spacing, BorderRadius, Typography } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import MarkdownRenderer from './MarkdownRenderer'
import { formatRelativeTime } from '../../lib/timeUtils'

const MAX_LENGTH = 2000

/**
 * Reply composer supporting two modes:
 * - 'modal' (default): Full-screen modal overlay with parent comment preview
 * - 'inline': Compact inline view rendered below the comment being replied to
 */
export default function ReplyComposer({ visible, comment, onSubmit, onClose, posting, mode = 'modal' }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const isInline = mode === 'inline'
  const styles = useMemo(() => createStyles(colors, isInline), [colors, isInline])
  const insets = useSafeAreaInsets()
  const { keyboardHeight } = useKeyboardHeight()
  useModalBackHandler(visible && !isInline, onClose)

  const [text, setText] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Link prompt state
  const [showLinkPrompt, setShowLinkPrompt] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

  const inputRef = useRef(null)

  const handleClose = useCallback(() => {
    setText('')
    setShowPreview(false)
    setShowLinkPrompt(false)
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || posting) return
    await onSubmit(trimmed)
    setText('')
    setShowPreview(false)
  }, [text, posting, onSubmit])

  const handleOpenLinkPrompt = useCallback(() => {
    setLinkUrl('')
    setLinkText('')
    setShowLinkPrompt(true)
  }, [])

  const handleInsertLink = useCallback(() => {
    const url = linkUrl.trim()
    if (!url) return
    const label = linkText.trim()
    const markdown = label ? `[${label}](${url})` : url
    setText(prev => prev ? `${prev} ${markdown}` : markdown)
    setShowLinkPrompt(false)
  }, [linkUrl, linkText])

  // Don't mount children when hidden — Modal mounts children even with
  // visible={false}, which would trigger autoFocus and open the keyboard.
  if (!visible) return null

  const authorName = comment?.creator?.username || '?'
  const canSubmit = text.trim().length > 0 && !posting

  // Shared toolbar + editor content (used in both modes)
  const toolbarAndEditor = (
    <>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={handleOpenLinkPrompt}
          style={styles.toolbarButton}
          accessibilityRole="button"
          accessibilityLabel={t('replyComposerInsertLinkA11y')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="link" size={isInline ? 18 : 20} color={colors.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowPreview(!showPreview)}
          style={styles.toolbarButton}
          accessibilityRole="button"
          accessibilityState={{ selected: showPreview }}
          accessibilityLabel={t('replyComposerPreviewA11y')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons
            name={showPreview ? 'eye-off-outline' : 'eye-outline'}
            size={isInline ? 18 : 20}
            color={colors.primary}
          />
          <ThemedText variant="caption" color="primary">
            {t('replyComposerPreview')}
          </ThemedText>
        </TouchableOpacity>
        <View style={styles.toolbarSpacer} />
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

      {/* Editor / Preview */}
      <View style={styles.editorArea}>
        {showPreview ? (
          <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
            {text.trim() ? (
              <MarkdownRenderer content={text} variant="comment" />
            ) : (
              <ThemedText variant="bodySmall" color="secondary">
                {t('replyComposerPreviewEmpty')}
              </ThemedText>
            )}
          </ScrollView>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.textInput, { color: colors.text }]}
            value={text}
            onChangeText={setText}
            placeholder={t('replyComposerPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxLength={MAX_LENGTH}
            maxFontSizeMultiplier={1.5}
            autoFocus
            textAlignVertical="top"
            accessibilityLabel={t('replyComposerPlaceholder')}
          />
        )}
      </View>
    </>
  )

  // Link prompt modal (shared between both modes)
  const linkPromptModal = (
    <Modal
      visible={showLinkPrompt}
      transparent
      animationType="fade"
      onRequestClose={() => setShowLinkPrompt(false)}
    >
      <View style={styles.linkOverlay}>
        <View style={styles.linkModal}>
          <ThemedText variant="h3" style={styles.linkModalTitle}>
            {t('linkPromptTitle')}
          </ThemedText>
          <TextInput
            style={[styles.linkInput, { color: colors.text }]}
            placeholder={t('linkPromptURL')}
            placeholderTextColor={colors.placeholderText}
            value={linkUrl}
            onChangeText={setLinkUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('linkPromptURL')}
          />
          <TextInput
            style={[styles.linkInput, { color: colors.text }]}
            placeholder={t('linkPromptText')}
            placeholderTextColor={colors.placeholderText}
            value={linkText}
            onChangeText={setLinkText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('linkPromptText')}
          />
          <View style={styles.linkModalActions}>
            <TouchableOpacity
              onPress={() => setShowLinkPrompt(false)}
              style={styles.linkCancelButton}
              accessibilityRole="button"
              accessibilityLabel={t('linkPromptCancel')}
            >
              <ThemedText variant="button" color="secondary">{t('linkPromptCancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleInsertLink}
              disabled={!linkUrl.trim()}
              style={[styles.linkInsertButton, !linkUrl.trim() && styles.linkInsertButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('linkPromptInsert')}
            >
              <ThemedText variant="button" color="inverse">{t('linkPromptInsert')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  // --- Inline mode: render as a bordered View inline in the thread ---
  if (isInline) {
    return (
      <View style={styles.inlineContainer}>
        {toolbarAndEditor}
        {linkPromptModal}
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

      {toolbarAndEditor}

      {/* Web keyboard spacer */}
      {Platform.OS === 'web' && keyboardHeight > 0 && (
        <View style={{ height: keyboardHeight }} />
      )}

      {linkPromptModal}
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
  // Toolbar
  toolbar: {
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
    ...(isInline ? { minHeight: 80, maxHeight: 200 } : { flex: 1 }),
  },
  textInput: {
    ...(isInline ? { minHeight: 80, maxHeight: 200 } : { flex: 1 }),
    ...Typography.body,
    paddingHorizontal: isInline ? Spacing.md : Spacing.lg,
    paddingVertical: isInline ? Spacing.sm : Spacing.md,
    textAlignVertical: 'top',
  },
  previewScroll: {
    ...(isInline ? { maxHeight: 200 } : { flex: 1 }),
  },
  previewContent: {
    paddingHorizontal: isInline ? Spacing.md : Spacing.lg,
    paddingVertical: isInline ? Spacing.sm : Spacing.md,
  },
  // Link prompt
  linkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  linkModal: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  linkModalTitle: {
    marginBottom: Spacing.lg,
  },
  linkInput: {
    backgroundColor: colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: Spacing.md,
  },
  linkModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  linkCancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  linkInsertButton: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
  },
  linkInsertButtonDisabled: {
    opacity: 0.5,
  },
})

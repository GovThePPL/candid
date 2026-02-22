import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  View,
  TouchableOpacity,
  Modal,
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
import WysiwygEditor from '../WysiwygEditor'

/**
 * Modal for editing an existing comment's body.
 *
 * @param {boolean} visible - Whether the modal is shown
 * @param {Object} comment - Comment object to edit (needs id, body)
 * @param {Function} onSubmit - Called with body string on save
 * @param {Function} onClose - Called to dismiss the modal
 * @param {boolean} saving - Whether save is in progress
 */
export default function EditCommentModal({ visible, comment, onSubmit, onClose, saving }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const { keyboardHeight } = useKeyboardHeight()
  useModalBackHandler(visible, onClose)

  const editorRef = useRef(null)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    if (visible && comment) {
      setHasContent(!!comment.body)
    }
  }, [visible, comment?.id])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!hasContent || saving) return
    const markdown = await editorRef.current?.getMarkdown()
    const trimmed = markdown?.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }, [hasContent, saving, onSubmit])

  const handleContentChange = useCallback((html) => {
    const text = html?.replace(/<[^>]*>/g, '').trim()
    setHasContent(!!text)
  }, [])

  if (!visible) return null

  const canSubmit = hasContent && !saving

  const content = (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom }]}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:cancel')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={colors.secondaryText} />
        </TouchableOpacity>
        <ThemedText variant="h3" style={styles.headerTitle}>{t('editCommentTitle')}</ThemedText>
        <TouchableOpacity
          style={[styles.saveButton, !canSubmit && styles.saveButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('common:save')}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText variant="buttonSmall" color="inverse">{t('common:save')}</ThemedText>
          )}
        </TouchableOpacity>
      </View>

      {/* Body editor */}
      <View style={styles.editorArea}>
        <WysiwygEditor
          key={comment?.id}
          ref={editorRef}
          initialMarkdown={comment?.body || ''}
          allowImages={false}
          placeholder={t('replyComposerPlaceholder')}
          onContentChange={handleContentChange}
          fullScreen
        />
      </View>

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

const createStyles = (colors) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  editorArea: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
})

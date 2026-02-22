import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import WysiwygEditor from '../WysiwygEditor'

/**
 * Modal for editing an existing post's title and body.
 *
 * @param {boolean} visible - Whether the modal is shown
 * @param {Object} post - Post object to edit (needs id, title, body)
 * @param {Function} onSubmit - Called with { title, body } on save
 * @param {Function} onClose - Called to dismiss the modal
 * @param {boolean} saving - Whether save is in progress
 */
export default function EditPostModal({ visible, post, onSubmit, onClose, saving }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const { keyboardHeight } = useKeyboardHeight()
  useModalBackHandler(visible, onClose)

  const editorRef = useRef(null)
  const [title, setTitle] = useState('')
  const [hasContent, setHasContent] = useState(false)

  // Sync title from post prop when modal opens
  useEffect(() => {
    if (visible && post) {
      setTitle(post.title || '')
      setHasContent(!!post.body)
    }
  }, [visible, post?.id])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || saving) return
    const markdown = await editorRef.current?.getMarkdown()
    onSubmit({ title: title.trim(), body: markdown?.trim() || '' })
  }, [title, saving, onSubmit])

  const handleContentChange = useCallback((html) => {
    const text = html?.replace(/<[^>]*>/g, '').trim()
    setHasContent(!!text)
  }, [])

  if (!visible) return null

  const canSubmit = title.trim() && !saving

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
        <ThemedText variant="h3" style={styles.headerTitle}>{t('editPostTitle')}</ThemedText>
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

      <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
        {/* Title input */}
        <TextInput
          style={[styles.titleInput, { color: colors.text }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('titlePlaceholder')}
          placeholderTextColor={colors.placeholderText}
          maxLength={200}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('titleInputA11y')}
        />

        {/* Body editor */}
        <View style={styles.editorArea}>
          <WysiwygEditor
            key={post?.id}
            ref={editorRef}
            initialMarkdown={post?.body || ''}
            allowImages={false}
            placeholder={t('bodyPlaceholder')}
            onContentChange={handleContentChange}
            variant="discuss"
          />
        </View>
      </ScrollView>

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
  scrollArea: {
    flex: 1,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  editorArea: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 200,
  },
})

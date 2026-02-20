import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import useModalBackHandler from '../../hooks/useModalBackHandler'
import { SemanticColors } from '../../constants/Colors'
import { Shadows } from '../../constants/Theme'
import ThemedText from '../ThemedText'

/**
 * Modal for selecting a portion of message text to quote.
 *
 * On native: Uses TextInput with onSelectionChange (works reliably on iOS/Android).
 * On web: Uses a selectable <div> and reads window.getSelection() on confirm,
 *          because RN Web's TextInput onSelectionChange doesn't fire when
 *          selection handles are dragged on mobile browsers.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {string} props.messageText - The full message text
 * @param {Function} props.onConfirm - Called with (selectedText, start, end)
 */
export default function TextSelectionModal({ visible, onClose, messageText = '', onConfirm }) {
  const { t } = useTranslation('chat')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  useModalBackHandler(visible, onClose)

  // Native: track selection via onSelectionChange
  const [nativeSelection, setNativeSelection] = useState({ start: 0, end: 0 })
  // Web: track whether user has made a selection (updated on selectionchange)
  const [webHasSelection, setWebHasSelection] = useState(false)
  const selectableRef = useRef(null)

  const isWeb = Platform.OS === 'web'

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setNativeSelection({ start: 0, end: 0 })
      setWebHasSelection(false)
    }
  }, [visible])

  // Web: listen for selectionchange to update button state
  useEffect(() => {
    if (!isWeb || !visible) return

    const handleSelectionChange = () => {
      const sel = window.getSelection()
      setWebHasSelection(sel && sel.toString().length > 0)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [isWeb, visible])

  const hasSelection = isWeb ? webHasSelection : nativeSelection.start !== nativeSelection.end

  const handleNativeSelectionChange = useCallback((event) => {
    setNativeSelection(event.nativeEvent.selection)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!hasSelection) return

    if (isWeb) {
      // Read selection from the DOM
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return

      const selectedText = sel.toString()
      if (!selectedText) return

      // Find the offset within the full messageText
      const start = messageText.indexOf(selectedText)
      if (start === -1) {
        // Fallback: use the selection directly without range info
        onConfirm?.(selectedText, 0, selectedText.length)
      } else {
        onConfirm?.(selectedText, start, start + selectedText.length)
      }
    } else {
      // Native: use tracked selection
      const start = Math.min(nativeSelection.start, nativeSelection.end)
      const end = Math.max(nativeSelection.start, nativeSelection.end)
      const selectedText = messageText.slice(start, end)
      onConfirm?.(selectedText, start, end)
    }
  }, [hasSelection, isWeb, nativeSelection, messageText, onConfirm])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityLabel={t('cancelSelection')}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} accessible={false}>
          <ThemedText variant="h3" color="primary" style={styles.title}>
            {t('textSelectionTitle')}
          </ThemedText>
          <ThemedText variant="caption" style={styles.hint}>
            {t('textSelectionHint')}
          </ThemedText>

          {isWeb ? (
            /* Web: selectable div — window.getSelection() reads selection on confirm */
            <ScrollView style={styles.selectableScroll}>
              <View
                ref={selectableRef}
                style={styles.selectableContainer}
              >
                <div style={{
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  fontSize: 15,
                  lineHeight: '22px',
                  color: colors.text,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {messageText}
                </div>
              </View>
            </ScrollView>
          ) : (
            /* Native: TextInput with onSelectionChange */
            <TextInput
              style={styles.textInput}
              value={messageText}
              editable={true}
              showSoftInputOnFocus={false}
              multiline
              scrollEnabled
              onSelectionChange={handleNativeSelectionChange}
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('textSelectionInputA11y')}
            />
          )}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('cancelSelection')}
            >
              <ThemedText variant="button" color="primary" style={styles.cancelText}>
                {t('cancel')}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !hasSelection && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!hasSelection}
              accessibilityRole="button"
              accessibilityLabel={t('quoteSelected')}
            >
              <ThemedText variant="button" color="inverse">
                {t('quoteSelected')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: SemanticColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    ...Shadows.elevated,
  },
  title: {
    marginBottom: 4,
  },
  hint: {
    color: colors.secondaryText,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    minHeight: 120,
    maxHeight: 250,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  selectableScroll: {
    maxHeight: 250,
    marginBottom: 12,
  },
  selectableContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  buttons: {
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  cancelText: {},
  confirmButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
})

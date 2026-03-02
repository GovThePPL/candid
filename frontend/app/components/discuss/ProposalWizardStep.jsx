import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import { OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import ThemedButton from '../ThemedButton'
import MarkdownRenderer from './MarkdownRenderer'
import WysiwygEditor from '../WysiwygEditor'

/**
 * Single wizard step: user writes draft, gets AI coaching feedback, edits based on suggestions.
 * Contains Back, Get Feedback and Next buttons between the text input and feedback display.
 * Supports plain text (default) and visual WYSIWYG editing modes via always-mounted WysiwygEditor.
 *
 * @param {Object} props
 * @param {Object} props.step - Step definition { id, keyPrefix }
 * @param {string} props.value - Current section text (markdown)
 * @param {Function} props.onChange - Callback with new text (markdown)
 * @param {Function} props.onGetFeedback - Callback to trigger AI feedback
 * @param {boolean} props.enhancing - Whether AI is currently generating feedback
 * @param {boolean} props.canRequestFeedback - Whether feedback can be requested
 * @param {Function} [props.onBack] - Callback to go to previous step
 * @param {Function} props.onNext - Callback to advance to next step
 * @param {boolean} props.canAdvance - Whether Next is enabled
 * @param {string|null} props.initialFeedback - Persisted feedback from hook
 * @param {number} props.stepNumber - 1-based step number
 * @param {number} props.totalSteps - Total content steps (excluding review)
 */
export default function ProposalWizardStep({
  step,
  value,
  onChange,
  onGetFeedback,
  enhancing,
  canRequestFeedback,
  onBack,
  onNext,
  canAdvance,
  initialFeedback,
  stepNumber,
  totalSteps,
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [feedback, setFeedback] = useState(initialFeedback || null)
  const [useVisual, setUseVisual] = useState(false)
  const editorRef = useRef(null)

  // Sync feedback from hook when navigating between steps or new feedback arrives
  useEffect(() => {
    setFeedback(initialFeedback || null)
  }, [initialFeedback])

  // Sync editor content when wizard step changes
  const prevStepIdRef = useRef(step.id)
  useEffect(() => {
    if (step.id !== prevStepIdRef.current) {
      prevStepIdRef.current = step.id
      editorRef.current?.setContent(value)
    }
  }, [step.id, value])

  // Keep stable ref to onChange so handleContentChange doesn't re-create
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Sync editor content to wizard on every edit via getMarkdown (avoids HTML roundtrip)
  const contentChangeSeq = useRef(0)
  const handleContentChange = useCallback(async () => {
    const seq = ++contentChangeSeq.current
    const md = await editorRef.current?.getMarkdown()
    if (md != null && seq === contentChangeSeq.current) {
      onChangeRef.current(md)
    }
  }, [])

  const handleToggleMode = useCallback(() => {
    setUseVisual(v => !v)
  }, [])

  // Flush latest editor content to wizard state before triggering an action.
  // handleContentChange is async (crosses WebView bridge), so getSectionText()
  // may still hold stale text when the user taps a button immediately after typing.
  const flushEditor = useCallback(async () => {
    const md = await editorRef.current?.getMarkdown()
    if (md != null) onChangeRef.current(md)
  }, [])

  const handleGetFeedbackFlushed = useCallback(async () => {
    await flushEditor()
    onGetFeedback()
  }, [flushEditor, onGetFeedback])

  const handleNextFlushed = useCallback(async () => {
    await flushEditor()
    onNext()
  }, [flushEditor, onNext])

  const handleDismissFeedback = useCallback(() => {
    setFeedback(null)
  }, [])

  const stepTitle = t(`${step.keyPrefix}Title`)
  const stepDesc = t(`${step.keyPrefix}Desc`)
  const stepPlaceholder = t(`${step.keyPrefix}Placeholder`)

  const feedbackDisabled = !canRequestFeedback || enhancing

  return (
    <View style={styles.container}>
      {/* Step indicator */}
      <ThemedText variant="caption" color="secondary" style={styles.stepIndicator}>
        {t('wizardStepOf', { current: stepNumber, total: totalSteps })}
      </ThemedText>

      {/* Step title and description */}
      <ThemedText variant="h2" style={styles.title}>{stepTitle}</ThemedText>
      <ThemedText variant="bodySmall" color="secondary" style={styles.description}>
        {stepDesc}
      </ThemedText>

      {/* Editor mode toggle */}
      <TouchableOpacity
        onPress={handleToggleMode}
        style={styles.editorToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: useVisual }}
        accessibilityLabel={t('replyComposerEditorToggleA11y')}
      >
        <ThemedText variant="caption" color="secondary">
          {useVisual ? t('replyComposerTextEditor') : t('replyComposerVisualEditor')}
        </ThemedText>
      </TouchableOpacity>

      {/* User input — always-mounted WysiwygEditor toggling between text and visual */}
      <View style={styles.editorArea}>
        <WysiwygEditor
          ref={editorRef}
          initialMarkdown={value}
          allowImages={false}
          placeholder={stepPlaceholder}
          onContentChange={handleContentChange}
          externalMode={useVisual ? 'visual' : 'markdown'}
          fullScreen
        />
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        {onBack && (
          <ThemedButton
            style={styles.compactButton}
            onPress={onBack}
            accessibilityLabel={t('wizardBackA11y')}
          >
            {t('wizardBack')}
          </ThemedButton>
        )}
        <View style={styles.buttonSpacer} />
        <ThemedButton
          style={styles.compactButton}
          onPress={handleGetFeedbackFlushed}
          disabled={feedbackDisabled}
          accessibilityLabel={t('wizardGetFeedbackA11y')}
        >
          {enhancing ? (
            <ActivityIndicator size="small" color={OnBrandColors.text} />
          ) : (
            t('wizardGetFeedback')
          )}
        </ThemedButton>
        <ThemedButton
          style={styles.compactButton}
          onPress={handleNextFlushed}
          disabled={!canAdvance}
          accessibilityLabel={t('wizardNextA11y')}
        >
          {t('wizardNext')}
        </ThemedButton>
      </View>

      {/* AI Feedback display */}
      {feedback && (
        <View style={styles.feedbackContainer}>
          <View style={styles.feedbackHeader}>
            <ThemedText variant="label" color="secondary">
              {t('wizardAIFeedback')}
            </ThemedText>
            <TouchableOpacity
              onPress={handleDismissFeedback}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('wizardDismissFeedbackA11y')}
            >
              <Ionicons name="close" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
          <View style={styles.feedbackBox}>
            <MarkdownRenderer content={feedback} />
          </View>
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  stepIndicator: {
    marginBottom: Spacing.xs,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  description: {
    marginBottom: Spacing.lg,
  },
  editorToggle: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.xs,
    padding: 4,
  },
  editorArea: {
    minHeight: 160,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  buttonSpacer: {
    flex: 1,
  },
  compactButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  feedbackContainer: {
    marginTop: Spacing.lg,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  feedbackBox: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
})

import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import ThemedButton from '../ThemedButton'
import MarkdownRenderer from './MarkdownRenderer'

/**
 * Single wizard step: user writes draft, gets AI coaching feedback, edits based on suggestions.
 * Contains Get Feedback and Next buttons between the text input and feedback display.
 *
 * @param {Object} props
 * @param {Object} props.step - Step definition { id, keyPrefix }
 * @param {string} props.value - Current section text
 * @param {Function} props.onChange - Callback with new text
 * @param {Function} props.onGetFeedback - Callback to trigger AI feedback
 * @param {boolean} props.enhancing - Whether AI is currently generating feedback
 * @param {boolean} props.canRequestFeedback - Whether feedback can be requested
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

  // Sync feedback from hook when navigating between steps or new feedback arrives
  useEffect(() => {
    setFeedback(initialFeedback || null)
  }, [initialFeedback])

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

      {/* User input */}
      <TextInput
        style={styles.input}
        multiline
        placeholder={stepPlaceholder}
        placeholderTextColor={colors.placeholderText}
        value={value}
        onChangeText={onChange}
        textAlignVertical="top"
        accessibilityLabel={t('wizardStepInputA11y', { step: stepTitle })}
        accessibilityRole="text"
      />

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <ThemedButton
          style={styles.compactButton}
          onPress={onGetFeedback}
          disabled={feedbackDisabled}
          accessibilityLabel={t('wizardGetFeedbackA11y')}
        >
          {enhancing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            t('wizardGetFeedback')
          )}
        </ThemedButton>
        <ThemedButton
          style={styles.compactButton}
          onPress={onNext}
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
  input: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 160,
    maxHeight: 300,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
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

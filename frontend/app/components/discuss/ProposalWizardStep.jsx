import { useState, useMemo, useCallback } from 'react'
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'

/**
 * Single wizard step: user writes draft, optionally enhances with AI, edits result.
 *
 * @param {Object} props
 * @param {Object} props.step - Step definition { id, keyPrefix }
 * @param {string} props.value - Current section text
 * @param {Function} props.onChange - Callback with new text
 * @param {Function} props.onEnhance - Callback to trigger AI enhancement
 * @param {boolean} props.enhancing - Whether AI is currently enhancing
 * @param {number} props.stepNumber - 1-based step number
 * @param {number} props.totalSteps - Total content steps (excluding review)
 */
export default function ProposalWizardStep({
  step,
  value,
  onChange,
  onEnhance,
  enhancing,
  stepNumber,
  totalSteps,
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [showAiOutput, setShowAiOutput] = useState(false)
  const [aiContent, setAiContent] = useState(null)

  const handleEnhance = useCallback(async () => {
    if (!value?.trim() || enhancing) return
    const result = await onEnhance(step.id, value)
    if (result) {
      setAiContent(result)
      setShowAiOutput(true)
    }
  }, [value, enhancing, onEnhance, step.id])

  const handleAcceptAi = useCallback(() => {
    if (aiContent) {
      onChange(aiContent)
      setShowAiOutput(false)
      setAiContent(null)
    }
  }, [aiContent, onChange])

  const handleRejectAi = useCallback(() => {
    setShowAiOutput(false)
    setAiContent(null)
  }, [])

  const stepTitle = t(`${step.keyPrefix}Title`)
  const stepDesc = t(`${step.keyPrefix}Desc`)
  const stepPlaceholder = t(`${step.keyPrefix}Placeholder`)

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

      {/* Enhance with AI button */}
      <TouchableOpacity
        style={[styles.enhanceButton, (!value?.trim() || enhancing) && styles.enhanceButtonDisabled]}
        onPress={handleEnhance}
        disabled={!value?.trim() || enhancing}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('wizardEnhanceA11y')}
        accessibilityState={{ disabled: !value?.trim() || enhancing }}
      >
        {enhancing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="sparkles" size={18} color={!value?.trim() ? colors.placeholderText : colors.primary} />
        )}
        <ThemedText
          variant="buttonSmall"
          style={[styles.enhanceLabel, (!value?.trim()) && { color: colors.placeholderText }]}
        >
          {enhancing ? t('wizardEnhancing') : t('wizardEnhanceButton')}
        </ThemedText>
      </TouchableOpacity>

      {/* AI output preview */}
      {showAiOutput && aiContent && (
        <View style={styles.aiOutputContainer}>
          <ThemedText variant="label" color="secondary" style={styles.aiOutputLabel}>
            {t('wizardAISuggestion')}
          </ThemedText>
          <View style={styles.aiOutputBox}>
            <ThemedText variant="body" style={styles.aiOutputText}>
              {aiContent}
            </ThemedText>
          </View>
          <View style={styles.aiActions}>
            <TouchableOpacity
              style={styles.aiAcceptButton}
              onPress={handleAcceptAi}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('wizardAcceptAIA11y')}
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" style={styles.aiAcceptLabel}>
                {t('wizardAcceptAI')}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.aiRejectButton}
              onPress={handleRejectAi}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('wizardRejectAIA11y')}
            >
              <Ionicons name="close" size={18} color={colors.text} />
              <ThemedText variant="buttonSmall">
                {t('wizardRejectAI')}
              </ThemedText>
            </TouchableOpacity>
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
  enhanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
  },
  enhanceButtonDisabled: {
    borderColor: colors.cardBorder,
  },
  enhanceLabel: {
    color: colors.primary,
  },
  aiOutputContainer: {
    marginTop: Spacing.lg,
  },
  aiOutputLabel: {
    marginBottom: Spacing.xs,
  },
  aiOutputBox: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  aiOutputText: {
    lineHeight: 22,
  },
  aiActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  aiAcceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primarySurface,
  },
  aiAcceptLabel: {
    color: '#FFFFFF',
  },
  aiRejectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
})

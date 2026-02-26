import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import ThemedTextInput from '../ThemedTextInput'

const MAX_TITLE_LENGTH = 200

/**
 * Review step: title input + all sections displayed for review.
 *
 * @param {Object} props
 * @param {string} props.title - Proposal title
 * @param {Function} props.onTitleChange - Title change callback
 * @param {Array} props.steps - Step definitions
 * @param {Object} props.sections - Section contents keyed by step id
 * @param {Function} props.onEditStep - Navigate to specific step
 * @param {number} props.totalSteps - Total steps including review
 */
export default function ProposalReview({
  title,
  onTitleChange,
  steps,
  sections,
  onEditStep,
  totalSteps,
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const titleLength = title.length
  const isTitleOver = titleLength > MAX_TITLE_LENGTH

  return (
    <View style={styles.container}>
      {/* Step indicator */}
      <ThemedText variant="caption" color="secondary" style={styles.stepIndicator}>
        {t('wizardStepOf', { current: totalSteps, total: totalSteps })}
      </ThemedText>

      <ThemedText variant="h2" style={styles.heading}>
        {t('wizardReviewTitle')}
      </ThemedText>
      <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>
        {t('wizardReviewDesc')}
      </ThemedText>

      {/* Title input */}
      <View style={styles.titleGroup}>
        <ThemedText variant="label" color="secondary" style={styles.label}>
          {t('titleLabel')}
        </ThemedText>
        <ThemedTextInput
          style={styles.titleInput}
          placeholder={t('wizardTitlePlaceholder')}
          value={title}
          onChangeText={onTitleChange}
          maxLength={MAX_TITLE_LENGTH + 20}
          accessibilityLabel={t('wizardTitleInputA11y')}
        />
        <ThemedText
          variant="caption"
          color="secondary"
          style={[styles.charCount, isTitleOver && styles.charCountOver]}
        >
          {t('charsRemaining', { count: titleLength, max: MAX_TITLE_LENGTH })}
        </ThemedText>
      </View>

      {/* Section summaries */}
      {steps.map((step, index) => {
        const text = sections[step.id] || ''
        const stepTitle = t(`${step.keyPrefix}Title`)
        return (
          <View key={step.id} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="label">{stepTitle}</ThemedText>
              <TouchableOpacity
                onPress={() => onEditStep(index)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('wizardEditStepA11y', { step: stepTitle })}
              >
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ThemedText
              variant="body"
              color={text ? 'primary' : 'secondary'}
              style={styles.sectionText}
              numberOfLines={6}
            >
              {text || t('wizardSectionEmpty')}
            </ThemedText>
          </View>
        )
      })}
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
  heading: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  titleGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.xs,
  },
  titleInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  charCount: {
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  charCountOver: {
    color: colors.error,
  },
  sectionCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionText: {
    lineHeight: 22,
  },
})

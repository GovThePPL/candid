import { useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import useKeyboardHeight from '../../../../hooks/useKeyboardHeight'
import { Spacing } from '../../../../constants/Theme'
import { useUser } from '../../../../hooks/useUser'
import { useLocationSession } from '../../../../contexts/LocationSessionContext'
import { CacheManager, CacheKeys } from '../../../../lib/cache'
import useProposalWizard from '../../../../hooks/useProposalWizard'
import Header from '../../../../components/Header'
import ThemedText from '../../../../components/ThemedText'
import ThemedButton from '../../../../components/ThemedButton'
import ProposalWizardStep from '../../../../components/discuss/ProposalWizardStep'
import ProposalReview from '../../../../components/discuss/ProposalReview'

export default function ProposalWizardScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation('discuss')
  const { user } = useUser()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const { selectedLocation, selectedSession, currentStage } = useLocationSession()

  // Determine template from current stage
  const template = currentStage === 'opinion_proposals' ? 'policy' : 'issue'

  const {
    currentStep,
    totalSteps,
    step,
    steps,
    isReviewStep,
    canAdvance,
    sections,
    title,
    enhancing,
    submitting,
    setTitle,
    getSectionText,
    setSectionText,
    goNext,
    goBack,
    goToStep,
    enhanceStep,
    submitProposal,
  } = useProposalWizard(template, selectedSession)

  const handleSubmit = useCallback(async () => {
    const result = await submitProposal(selectedLocation)
    if (result) {
      if (user?.id) CacheManager.invalidate(CacheKeys.activityPosts(user.id))
      navigation.replace('[id]', { id: result.id })
    }
  }, [submitProposal, selectedLocation, user?.id, navigation])

  const screenTitle = template === 'policy'
    ? t('wizardPolicyScreenTitle')
    : t('wizardIssueScreenTitle')

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title={screenTitle}
        onBack={() => {
          if (currentStep > 0) {
            goBack()
          } else {
            router.back()
          }
        }}
      />

      {/* Step progress bar */}
      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i <= currentStep && styles.progressDotActive,
              i < currentStep && styles.progressDotCompleted,
            ]}
            accessibilityLabel={t('wizardProgressDotA11y', { step: i + 1, total: totalSteps })}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {isReviewStep ? (
          <ProposalReview
            title={title}
            onTitleChange={setTitle}
            steps={steps}
            sections={sections}
            onEditStep={goToStep}
            totalSteps={totalSteps}
          />
        ) : (
          <ProposalWizardStep
            step={step}
            value={getSectionText(step.id)}
            onChange={(text) => setSectionText(step.id, text)}
            onEnhance={enhanceStep}
            enhancing={enhancing}
            stepNumber={currentStep + 1}
            totalSteps={steps.length}
          />
        )}

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          {currentStep > 0 && (
            <ThemedButton
              style={styles.backButton}
              onPress={goBack}
              accessibilityLabel={t('wizardBackA11y')}
            >
              {t('wizardBack')}
            </ThemedButton>
          )}

          <View style={styles.navSpacer} />

          {isReviewStep ? (
            <ThemedButton
              onPress={handleSubmit}
              disabled={!canAdvance || submitting}
              accessibilityLabel={t('wizardSubmitA11y')}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                t('wizardSubmitProposal')
              )}
            </ThemedButton>
          ) : (
            <ThemedButton
              onPress={goNext}
              disabled={!canAdvance}
              accessibilityLabel={t('wizardNextA11y')}
            >
              {t('wizardNext')}
            </ThemedButton>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorder,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressDotCompleted: {
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  backButton: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  navSpacer: {
    flex: 1,
  },
})

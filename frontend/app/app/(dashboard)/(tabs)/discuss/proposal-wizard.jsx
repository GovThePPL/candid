import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import useKeyboardHeight from '../../../../hooks/useKeyboardHeight'
import { Spacing } from '../../../../constants/Theme'
import { OnBrandColors } from '../../../../constants/Colors'
import { useUser } from '../../../../hooks/useUser'
import { useLocationSession } from '../../../../contexts/LocationSessionContext'
import { CacheManager, CacheKeys } from '../../../../lib/cache'
import useProposalWizard from '../../../../hooks/useProposalWizard'
import api from '../../../../lib/api'
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
  const template = currentStage === 'reflection_proposals' ? 'policy' : 'issue'

  const {
    currentStep,
    totalSteps,
    step,
    steps,
    isReviewStep,
    canAdvance,
    canRequestFeedback,
    feedbackState,
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

  // Pre-check: does the user already have a proposal in this stage?
  const [existingProposalId, setExistingProposalId] = useState(null)
  useEffect(() => {
    if (!selectedSession || !selectedLocation || !user?.id) return
    api.posts.getPosts(selectedLocation, {
      sessionId: selectedSession,
      postType: 'proposal',
      sort: 'newest',
    }).then(data => {
      const mine = (data?.posts || []).find(
        p => p.creator?.id === user.id && p.createdDuringStage === currentStage && p.status !== 'deleted'
      )
      if (mine) setExistingProposalId(mine.id)
    }).catch(() => {})
  }, [selectedSession, selectedLocation, user?.id, currentStage])

  const handleGetFeedback = useCallback(async () => {
    if (!step || !canRequestFeedback || enhancing) return
    await enhanceStep(step.id, getSectionText(step.id))
  }, [step, canRequestFeedback, enhancing, enhanceStep, getSectionText])

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

      {existingProposalId && (
        <View style={styles.existingProposalBanner}>
          <ThemedText variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {t('wizardOneProposalLimit')}
          </ThemedText>
          <ThemedButton
            onPress={() => navigation.replace('[id]', { id: existingProposalId })}
            accessibilityLabel={t('wizardOneProposalLimit')}
          >
            {t('viewProposal', { defaultValue: 'View Proposal' })}
          </ThemedButton>
        </View>
      )}

      {!existingProposalId && <>
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
            onGetFeedback={handleGetFeedback}
            enhancing={enhancing}
            canRequestFeedback={canRequestFeedback}
            onBack={currentStep > 0 ? goBack : undefined}
            onNext={goNext}
            canAdvance={canAdvance}
            initialFeedback={feedbackState[step?.id]?.feedback || null}
            stepNumber={currentStep + 1}
            totalSteps={steps.length}
          />
        )}

        {/* Review step navigation */}
        {isReviewStep && (
          <View style={styles.navRow}>
            <ThemedButton
              onPress={goBack}
              accessibilityLabel={t('wizardBackA11y')}
            >
              {t('wizardBack')}
            </ThemedButton>

            <View style={styles.navSpacer} />

            <ThemedButton
              onPress={handleSubmit}
              disabled={!canAdvance || submitting}
              accessibilityLabel={t('wizardSubmitA11y')}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={OnBrandColors.text} />
              ) : (
                t('wizardSubmitProposal')
              )}
            </ThemedButton>
          </View>
        )}
      </ScrollView>
      </>}
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  existingProposalBanner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.xl,
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
  navSpacer: {
    flex: 1,
  },
})

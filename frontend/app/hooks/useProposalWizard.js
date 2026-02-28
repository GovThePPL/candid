import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useToast } from '../components/Toast'

/**
 * Wizard step definitions for each proposal template.
 * Each step has an id, i18n key prefix, and whether AI assist is available.
 */
const ISSUE_STEPS = [
  { id: 'description', keyPrefix: 'wizardIssueDescription' },
  { id: 'stakeholders', keyPrefix: 'wizardIssueStakeholders' },
  { id: 'impact', keyPrefix: 'wizardIssueImpact' },
]

const POLICY_STEPS = [
  { id: 'description', keyPrefix: 'wizardPolicyDescription' },
  { id: 'rights', keyPrefix: 'wizardPolicyRights' },
  { id: 'implementation', keyPrefix: 'wizardPolicyImplementation' },
]

/**
 * Hook for managing proposal wizard state and AI enhancement.
 *
 * @param {'issue'|'policy'} template - Proposal type
 * @param {string} sessionId - Session ID for context gathering
 * @returns {object} Wizard state and controls
 */
export default function useProposalWizard(template, sessionId) {
  const { t } = useTranslation('discuss')
  const showToast = useToast()

  const steps = useMemo(
    () => (template === 'policy' ? POLICY_STEPS : ISSUE_STEPS),
    [template]
  )

  const [currentStep, setCurrentStep] = useState(0)
  const [sections, setSections] = useState({})
  const [enhancing, setEnhancing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  // { [stepId]: { requested: true, contentAtRequest: string, feedback: string } }
  const [feedbackState, setFeedbackState] = useState({})

  const step = steps[currentStep]
  const isLastContentStep = currentStep === steps.length - 1
  const isReviewStep = currentStep === steps.length
  const totalSteps = steps.length + 1 // content steps + review

  const getSectionText = useCallback((stepId) => sections[stepId] || '', [sections])

  const setSectionText = useCallback((stepId, text) => {
    setSections(prev => ({ ...prev, [stepId]: text }))
  }, [])

  const canAdvance = useMemo(() => {
    if (isReviewStep) return title.trim().length > 0
    const hasText = (sections[step?.id] || '').trim().length > 0
    const hasFeedback = feedbackState[step?.id]?.requested === true
    return hasText && hasFeedback
  }, [isReviewStep, title, sections, step, feedbackState])

  const canRequestFeedback = useMemo(() => {
    if (!step) return false
    const text = (sections[step.id] || '').trim()
    if (!text) return false
    const fs = feedbackState[step.id]
    if (!fs?.requested) return true
    return text !== fs.contentAtRequest
  }, [step, sections, feedbackState])

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }, [currentStep, totalSteps])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const goToStep = useCallback((index) => {
    if (index >= 0 && index < totalSteps) {
      setCurrentStep(index)
    }
  }, [totalSteps])

  const enhanceStep = useCallback(async (stepId, userInput) => {
    setEnhancing(true)
    try {
      // Build previous sections context
      const previousSections = {}
      for (const s of steps) {
        if (s.id === stepId) break
        if (sections[s.id]) {
          previousSections[s.id] = sections[s.id]
        }
      }

      const result = await api.posts.proposalAssist({
        sessionId,
        step: stepId,
        userInput,
        previousSections: Object.keys(previousSections).length > 0 ? previousSections : undefined,
      })

      setFeedbackState(prev => ({
        ...prev,
        [stepId]: { requested: true, contentAtRequest: userInput.trim(), feedback: result.generatedContent },
      }))

      return result.generatedContent
    } catch (err) {
      if (err?.status === 429) {
        showToast(t('wizardRateLimited'))
      } else if (err?.status === 503) {
        showToast(t('wizardAIUnavailable'))
      } else {
        showToast(t('wizardEnhanceFailed'))
      }
      return null
    } finally {
      setEnhancing(false)
    }
  }, [sessionId, steps, sections, showToast, t])

  const assembleBody = useCallback(() => {
    const parts = []
    for (const s of steps) {
      const text = sections[s.id]
      if (text?.trim()) {
        const heading = t(`${s.keyPrefix}Title`)
        parts.push(`## ${heading}\n\n${text.trim()}`)
      }
    }
    return parts.join('\n\n')
  }, [steps, sections, t])

  const submitProposal = useCallback(async (locationId) => {
    const body = assembleBody()
    if (!body || !title.trim()) return null

    setSubmitting(true)
    try {
      const metadata = {
        template,
        sections: Object.fromEntries(
          steps.map(s => [s.id, (sections[s.id] || '').trim()])
        ),
      }

      const result = await api.posts.createPost({
        title: title.trim(),
        body,
        locationId,
        sessionId,
        postType: 'proposal',
        proposalMetadata: metadata,
      })
      return result
    } catch (err) {
      if (err?.status === 429) {
        showToast(t('errorRateLimited'))
      } else if (err?.status === 409) {
        showToast(t('wizardOneProposalLimit'))
      } else {
        showToast(t('wizardSubmitFailed'))
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }, [assembleBody, title, template, steps, sections, sessionId, showToast, t])

  const resetWizard = useCallback(() => {
    setCurrentStep(0)
    setSections({})
    setTitle('')
  }, [])

  return {
    // State
    currentStep,
    totalSteps,
    step,
    steps,
    isReviewStep,
    isLastContentStep,
    canAdvance,
    canRequestFeedback,
    feedbackState,
    sections,
    title,
    enhancing,
    submitting,

    // Actions
    setTitle,
    getSectionText,
    setSectionText,
    goNext,
    goBack,
    goToStep,
    enhanceStep,
    submitProposal,
    resetWizard,
  }
}

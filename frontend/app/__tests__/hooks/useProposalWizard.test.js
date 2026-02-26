import { renderHook, act, waitFor } from '@testing-library/react-native'

jest.mock('../../components/Toast', () => ({
  useToast: () => jest.fn(),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}))

const mockProposalAssist = jest.fn()
const mockCreatePost = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    posts: {
      proposalAssist: (...args) => mockProposalAssist(...args),
      createPost: (...args) => mockCreatePost(...args),
    },
  },
}))

import useProposalWizard from '../../hooks/useProposalWizard'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useProposalWizard', () => {
  describe('initialization', () => {
    it('starts at step 0 with empty sections', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      expect(result.current.currentStep).toBe(0)
      expect(result.current.sections).toEqual({})
      expect(result.current.title).toBe('')
      expect(result.current.enhancing).toBe(false)
      expect(result.current.submitting).toBe(false)
    })

    it('uses issue steps for issue template', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      expect(result.current.steps).toHaveLength(3)
      expect(result.current.steps[0].id).toBe('description')
      expect(result.current.steps[1].id).toBe('stakeholders')
      expect(result.current.steps[2].id).toBe('impact')
      expect(result.current.totalSteps).toBe(4) // 3 steps + review
    })

    it('uses policy steps for policy template', () => {
      const { result } = renderHook(() => useProposalWizard('policy', 'sess1'))
      expect(result.current.steps).toHaveLength(3)
      expect(result.current.steps[0].id).toBe('description')
      expect(result.current.steps[1].id).toBe('rights')
      expect(result.current.steps[2].id).toBe('implementation')
    })
  })

  describe('navigation', () => {
    it('advances to next step', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.goNext())
      expect(result.current.currentStep).toBe(1)
    })

    it('goes back to previous step', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.goNext())
      act(() => result.current.goBack())
      expect(result.current.currentStep).toBe(0)
    })

    it('does not go below step 0', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.goBack())
      expect(result.current.currentStep).toBe(0)
    })

    it('does not go past total steps', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      // Go to review step (step 3)
      act(() => result.current.goNext())
      act(() => result.current.goNext())
      act(() => result.current.goNext())
      expect(result.current.isReviewStep).toBe(true)
      // Try to go past
      act(() => result.current.goNext())
      expect(result.current.currentStep).toBe(3)
    })

    it('goToStep navigates to specific step', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.goToStep(2))
      expect(result.current.currentStep).toBe(2)
    })

    it('isReviewStep is true on last step', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      expect(result.current.isReviewStep).toBe(false)
      act(() => result.current.goToStep(3))
      expect(result.current.isReviewStep).toBe(true)
    })
  })

  describe('sections', () => {
    it('sets and gets section text', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.setSectionText('description', 'My issue'))
      expect(result.current.getSectionText('description')).toBe('My issue')
    })

    it('canAdvance is false when current step section is empty', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      expect(result.current.canAdvance).toBe(false)
    })

    it('canAdvance is true when current step has content', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.setSectionText('description', 'Some content'))
      expect(result.current.canAdvance).toBe(true)
    })

    it('canAdvance on review step requires title', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.goToStep(3))
      expect(result.current.canAdvance).toBe(false)
      act(() => result.current.setTitle('My Proposal'))
      expect(result.current.canAdvance).toBe(true)
    })
  })

  describe('AI enhancement', () => {
    it('calls proposalAssist with correct params', async () => {
      mockProposalAssist.mockResolvedValue({ generatedContent: 'Enhanced text' })
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      let aiResult
      await act(async () => {
        aiResult = await result.current.enhanceStep('description', 'My draft text')
      })

      expect(mockProposalAssist).toHaveBeenCalledWith({
        sessionId: 'sess1',
        step: 'description',
        userInput: 'My draft text',
        previousSections: undefined,
      })
      expect(aiResult).toBe('Enhanced text')
    })

    it('includes previous sections in enhancement request', async () => {
      mockProposalAssist.mockResolvedValue({ generatedContent: 'Enhanced' })
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      act(() => result.current.setSectionText('description', 'Issue text'))
      act(() => result.current.goNext())

      await act(async () => {
        await result.current.enhanceStep('stakeholders', 'Some stakeholders')
      })

      expect(mockProposalAssist).toHaveBeenCalledWith({
        sessionId: 'sess1',
        step: 'stakeholders',
        userInput: 'Some stakeholders',
        previousSections: { description: 'Issue text' },
      })
    })

    it('returns null on error', async () => {
      mockProposalAssist.mockRejectedValue(new Error('fail'))
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      let aiResult
      await act(async () => {
        aiResult = await result.current.enhanceStep('description', 'text')
      })

      expect(aiResult).toBeNull()
    })

    it('sets enhancing flag during request', async () => {
      let resolve
      mockProposalAssist.mockReturnValue(new Promise(r => { resolve = r }))

      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      expect(result.current.enhancing).toBe(false)

      let enhancePromise
      act(() => {
        enhancePromise = result.current.enhanceStep('description', 'text')
      })
      expect(result.current.enhancing).toBe(true)

      await act(async () => {
        resolve({ generatedContent: 'done' })
        await enhancePromise
      })
      expect(result.current.enhancing).toBe(false)
    })
  })

  describe('submission', () => {
    it('assembles body from sections and submits', async () => {
      mockCreatePost.mockResolvedValue({ id: 'post1' })
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      act(() => {
        result.current.setSectionText('description', 'Issue desc')
        result.current.setSectionText('stakeholders', 'Stakeholder info')
        result.current.setSectionText('impact', 'Impact info')
        result.current.setTitle('My Proposal')
      })

      let submitResult
      await act(async () => {
        submitResult = await result.current.submitProposal('loc1')
      })

      expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({
        title: 'My Proposal',
        locationId: 'loc1',
        sessionId: 'sess1',
        postType: 'proposal',
        proposalMetadata: expect.objectContaining({
          template: 'issue',
          sections: {
            description: 'Issue desc',
            stakeholders: 'Stakeholder info',
            impact: 'Impact info',
          },
        }),
      }))
      expect(submitResult).toEqual({ id: 'post1' })
    })

    it('returns null without title', async () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))
      act(() => result.current.setSectionText('description', 'Some text'))

      let submitResult
      await act(async () => {
        submitResult = await result.current.submitProposal('loc1')
      })

      expect(mockCreatePost).not.toHaveBeenCalled()
      expect(submitResult).toBeNull()
    })

    it('returns null on error', async () => {
      mockCreatePost.mockRejectedValue(new Error('fail'))
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      act(() => {
        result.current.setSectionText('description', 'Text')
        result.current.setTitle('Title')
      })

      let submitResult
      await act(async () => {
        submitResult = await result.current.submitProposal('loc1')
      })

      expect(submitResult).toBeNull()
    })
  })

  describe('resetWizard', () => {
    it('clears all state', () => {
      const { result } = renderHook(() => useProposalWizard('issue', 'sess1'))

      act(() => {
        result.current.setSectionText('description', 'Some text')
        result.current.setTitle('Title')
        result.current.goNext()
      })

      act(() => result.current.resetWizard())

      expect(result.current.currentStep).toBe(0)
      expect(result.current.sections).toEqual({})
      expect(result.current.title).toBe('')
    })
  })
})

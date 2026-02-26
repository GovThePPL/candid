import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        wizardIssueDescriptionTitle: 'Issue Description',
        wizardIssueDescriptionDesc: 'Describe the issue...',
        wizardIssueDescriptionPlaceholder: 'Describe in your own words...',
        wizardStepOf: `Step ${opts?.current || '?'} of ${opts?.total || '?'}`,
        wizardEnhanceButton: 'Enhance with AI',
        wizardEnhancing: 'Enhancing...',
        wizardAISuggestion: 'AI Suggestion',
        wizardAcceptAI: 'Use This',
        wizardRejectAI: 'Keep Mine',
        wizardStepInputA11y: `Text input for ${opts?.step || '?'}`,
        wizardEnhanceA11y: 'Enhance this section with AI',
        wizardAcceptAIA11y: 'Accept AI suggestion',
        wizardRejectAIA11y: 'Reject AI suggestion and keep original',
      }
      return map[key] || key
    },
  }),
}))

import ProposalWizardStep from '../../components/discuss/ProposalWizardStep'

const defaultStep = { id: 'description', keyPrefix: 'wizardIssueDescription' }

describe('ProposalWizardStep', () => {
  it('renders step title and description', () => {
    render(
      <ProposalWizardStep
        step={defaultStep}
        value=""
        onChange={jest.fn()}
        onEnhance={jest.fn()}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )
    expect(screen.getByText('Issue Description')).toBeTruthy()
    expect(screen.getByText('Describe the issue...')).toBeTruthy()
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
  })

  it('shows enhance button', () => {
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Some text"
        onChange={jest.fn()}
        onEnhance={jest.fn()}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )
    expect(screen.getByText('Enhance with AI')).toBeTruthy()
  })

  it('calls onChange when text input changes', () => {
    const onChange = jest.fn()
    render(
      <ProposalWizardStep
        step={defaultStep}
        value=""
        onChange={onChange}
        onEnhance={jest.fn()}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )
    const input = screen.getByLabelText('Text input for Issue Description')
    fireEvent.changeText(input, 'New text')
    expect(onChange).toHaveBeenCalledWith('New text')
  })

  it('calls onEnhance when enhance button pressed with content', async () => {
    const onEnhance = jest.fn().mockResolvedValue('Enhanced content')
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Some draft"
        onChange={jest.fn()}
        onEnhance={onEnhance}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )

    fireEvent.press(screen.getByText('Enhance with AI'))

    await waitFor(() => {
      expect(onEnhance).toHaveBeenCalledWith('description', 'Some draft')
    })
  })

  it('shows AI suggestion after enhancement', async () => {
    const onEnhance = jest.fn().mockResolvedValue('Enhanced content here')
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Draft text"
        onChange={jest.fn()}
        onEnhance={onEnhance}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )

    fireEvent.press(screen.getByText('Enhance with AI'))

    await waitFor(() => {
      expect(screen.getByText('AI Suggestion')).toBeTruthy()
      expect(screen.getByText('Enhanced content here')).toBeTruthy()
      expect(screen.getByText('Use This')).toBeTruthy()
      expect(screen.getByText('Keep Mine')).toBeTruthy()
    })
  })

  it('accepts AI suggestion and updates value', async () => {
    const onChange = jest.fn()
    const onEnhance = jest.fn().mockResolvedValue('AI text')
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Draft"
        onChange={onChange}
        onEnhance={onEnhance}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )

    fireEvent.press(screen.getByText('Enhance with AI'))
    await waitFor(() => screen.getByText('Use This'))

    fireEvent.press(screen.getByText('Use This'))
    expect(onChange).toHaveBeenCalledWith('AI text')
  })

  it('rejects AI suggestion and keeps original', async () => {
    const onChange = jest.fn()
    const onEnhance = jest.fn().mockResolvedValue('AI text')
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Draft"
        onChange={onChange}
        onEnhance={onEnhance}
        enhancing={false}
        stepNumber={1}
        totalSteps={3}
      />
    )

    fireEvent.press(screen.getByText('Enhance with AI'))
    await waitFor(() => screen.getByText('Keep Mine'))

    fireEvent.press(screen.getByText('Keep Mine'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows enhancing state', () => {
    render(
      <ProposalWizardStep
        step={defaultStep}
        value="Some text"
        onChange={jest.fn()}
        onEnhance={jest.fn()}
        enhancing={true}
        stepNumber={1}
        totalSteps={3}
      />
    )
    expect(screen.getByText('Enhancing...')).toBeTruthy()
  })
})

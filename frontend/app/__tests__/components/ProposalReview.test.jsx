import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        wizardStepOf: `Step ${opts?.current || '?'} of ${opts?.total || '?'}`,
        wizardReviewTitle: 'Review & Submit',
        wizardReviewDesc: 'Review your proposal sections.',
        titleLabel: 'Title',
        wizardTitlePlaceholder: 'Give your proposal a title',
        charsRemaining: `${opts?.count || 0}/${opts?.max || 200}`,
        wizardSectionEmpty: 'No content yet',
        wizardIssueDescriptionTitle: 'Issue Description',
        wizardIssueStakeholdersTitle: 'Stakeholders',
        wizardIssueImpactTitle: 'Impact & Scope',
        wizardTitleInputA11y: 'Proposal title',
        wizardEditStepA11y: `Edit ${opts?.step || '?'} section`,
      }
      return map[key] || key
    },
  }),
}))

import ProposalReview from '../../components/discuss/ProposalReview'

const steps = [
  { id: 'description', keyPrefix: 'wizardIssueDescription' },
  { id: 'stakeholders', keyPrefix: 'wizardIssueStakeholders' },
  { id: 'impact', keyPrefix: 'wizardIssueImpact' },
]

describe('ProposalReview', () => {
  it('renders review heading and step indicator', () => {
    render(
      <ProposalReview
        title=""
        onTitleChange={jest.fn()}
        steps={steps}
        sections={{}}
        onEditStep={jest.fn()}
        totalSteps={4}
      />
    )
    expect(screen.getByText('Review & Submit')).toBeTruthy()
    expect(screen.getByText('Step 4 of 4')).toBeTruthy()
  })

  it('renders title input', () => {
    render(
      <ProposalReview
        title="My Title"
        onTitleChange={jest.fn()}
        steps={steps}
        sections={{}}
        onEditStep={jest.fn()}
        totalSteps={4}
      />
    )
    expect(screen.getByLabelText('Proposal title')).toBeTruthy()
  })

  it('calls onTitleChange when title input changes', () => {
    const onTitleChange = jest.fn()
    render(
      <ProposalReview
        title=""
        onTitleChange={onTitleChange}
        steps={steps}
        sections={{}}
        onEditStep={jest.fn()}
        totalSteps={4}
      />
    )
    fireEvent.changeText(screen.getByLabelText('Proposal title'), 'New title')
    expect(onTitleChange).toHaveBeenCalledWith('New title')
  })

  it('renders section cards with content', () => {
    render(
      <ProposalReview
        title=""
        onTitleChange={jest.fn()}
        steps={steps}
        sections={{
          description: 'Issue description text',
          stakeholders: 'Stakeholder info',
          impact: '',
        }}
        onEditStep={jest.fn()}
        totalSteps={4}
      />
    )
    expect(screen.getByText('Issue Description')).toBeTruthy()
    expect(screen.getByText('Issue description text')).toBeTruthy()
    expect(screen.getByText('Stakeholders')).toBeTruthy()
    expect(screen.getByText('Stakeholder info')).toBeTruthy()
    expect(screen.getByText('Impact & Scope')).toBeTruthy()
    expect(screen.getByText('No content yet')).toBeTruthy()
  })

  it('calls onEditStep when edit button pressed', () => {
    const onEditStep = jest.fn()
    render(
      <ProposalReview
        title=""
        onTitleChange={jest.fn()}
        steps={steps}
        sections={{ description: 'text' }}
        onEditStep={onEditStep}
        totalSteps={4}
      />
    )
    const editButton = screen.getByLabelText('Edit Issue Description section')
    fireEvent.press(editButton)
    expect(onEditStep).toHaveBeenCalledWith(0)
  })
})

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
        wizardGetFeedback: 'Get Feedback',
        wizardGettingFeedback: 'Getting feedback...',
        wizardAIFeedback: 'AI Feedback',
        wizardNext: 'Next',
        wizardStepInputA11y: `Text input for ${opts?.step || '?'}`,
        wizardGetFeedbackA11y: 'Get AI feedback on this section',
        wizardNextA11y: 'Go to next step',
        wizardDismissFeedbackA11y: 'Dismiss AI feedback',
        replyComposerVisualEditor: 'Visual Editor',
        replyComposerTextEditor: 'Text',
        replyComposerEditorToggleA11y: 'Toggle visual editor',
      }
      return map[key] || key
    },
  }),
}))

jest.mock('../../components/WysiwygEditor', () => {
  const React = require('react')
  const { TextInput } = require('react-native')
  return React.forwardRef(function MockWysiwygEditor({ placeholder, onContentChange }, ref) {
    const textRef = React.useRef('')
    React.useImperativeHandle(ref, () => ({
      getMarkdown: () => Promise.resolve(textRef.current),
      setContent: (md) => { textRef.current = md || '' },
      focus: jest.fn(),
      blur: jest.fn(),
    }))
    return (
      <TextInput
        placeholder={placeholder}
        onChangeText={(text) => {
          textRef.current = text
          onContentChange?.()
        }}
      />
    )
  })
})

jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

jest.mock('../../components/ThemedButton', () => {
  const { TouchableOpacity, Text } = require('react-native')
  return function MockThemedButton({ children, onPress, disabled, accessibilityLabel }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text>{typeof children === 'string' ? children : null}</Text>
        {typeof children !== 'string' ? children : null}
      </TouchableOpacity>
    )
  }
})

import ProposalWizardStep from '../../components/discuss/ProposalWizardStep'

const defaultStep = { id: 'description', keyPrefix: 'wizardIssueDescription' }

const defaultProps = {
  step: defaultStep,
  value: '',
  onChange: jest.fn(),
  onGetFeedback: jest.fn(),
  enhancing: false,
  canRequestFeedback: false,
  onNext: jest.fn(),
  canAdvance: false,
  initialFeedback: null,
  stepNumber: 1,
  totalSteps: 3,
}

describe('ProposalWizardStep', () => {
  it('renders step title and description', () => {
    render(<ProposalWizardStep {...defaultProps} />)
    expect(screen.getByText('Issue Description')).toBeTruthy()
    expect(screen.getByText('Describe the issue...')).toBeTruthy()
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
  })

  it('shows Get Feedback and Next buttons', () => {
    render(<ProposalWizardStep {...defaultProps} value="Some text" canRequestFeedback={true} />)
    expect(screen.getByText('Get Feedback')).toBeTruthy()
    expect(screen.getByText('Next')).toBeTruthy()
  })

  it('calls onChange when text input changes', async () => {
    const onChange = jest.fn()
    render(<ProposalWizardStep {...defaultProps} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Describe in your own words...')
    fireEvent.changeText(input, 'New text')
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('New text')
    })
  })

  it('calls onGetFeedback when Get Feedback pressed', async () => {
    const onGetFeedback = jest.fn()
    render(
      <ProposalWizardStep
        {...defaultProps}
        value="Some draft"
        onGetFeedback={onGetFeedback}
        canRequestFeedback={true}
      />
    )
    fireEvent.press(screen.getByText('Get Feedback'))
    await waitFor(() => {
      expect(onGetFeedback).toHaveBeenCalled()
    })
  })

  it('calls onNext when Next pressed and canAdvance is true', async () => {
    const onNext = jest.fn()
    render(
      <ProposalWizardStep
        {...defaultProps}
        value="Draft"
        onNext={onNext}
        canAdvance={true}
      />
    )
    fireEvent.press(screen.getByText('Next'))
    await waitFor(() => {
      expect(onNext).toHaveBeenCalled()
    })
  })

  it('disables Next when canAdvance is false', () => {
    render(<ProposalWizardStep {...defaultProps} value="Draft" canAdvance={false} />)
    const btn = screen.getByLabelText('Go to next step')
    expect(btn.props.accessibilityState.disabled).toBe(true)
  })

  it('disables Get Feedback when canRequestFeedback is false', () => {
    render(<ProposalWizardStep {...defaultProps} value="Draft" canRequestFeedback={false} />)
    const btn = screen.getByLabelText('Get AI feedback on this section')
    expect(btn.props.accessibilityState.disabled).toBe(true)
  })

  it('shows initialFeedback on mount', () => {
    render(
      <ProposalWizardStep
        {...defaultProps}
        value="Draft"
        initialFeedback="Previous feedback"
      />
    )
    expect(screen.getByText('Previous feedback')).toBeTruthy()
    expect(screen.getByText('AI Feedback')).toBeTruthy()
  })

  it('dismisses feedback when dismiss button pressed', () => {
    render(
      <ProposalWizardStep
        {...defaultProps}
        value="Draft"
        initialFeedback="Some feedback"
      />
    )
    expect(screen.getByText('Some feedback')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Dismiss AI feedback'))
    expect(screen.queryByText('Some feedback')).toBeNull()
  })

  it('shows editor mode toggle', () => {
    render(<ProposalWizardStep {...defaultProps} />)
    expect(screen.getByText('Visual Editor')).toBeTruthy()
  })
})

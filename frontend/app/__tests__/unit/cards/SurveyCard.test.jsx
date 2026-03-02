import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../../constants/Colors').LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import SurveyCard from '../../../components/cards/SurveyCard'

const makeOptions = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `opt-${i}`, option: `Option ${i + 1}` }))

const baseSurvey = {
  surveyId: 's1',
  id: 'q1',
  question: 'Pick one',
  surveyTitle: 'Test Survey',
  session: 'Session A',
}

describe('SurveyCard responsive option sizing', () => {
  it('uses default button variant for <= 4 options', () => {
    const survey = { ...baseSurvey, options: makeOptions(4) }
    render(<SurveyCard survey={survey} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Option \d+$/)
    // default tier uses "button" variant — no prop override to "buttonSmall"
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('uses compact sizing for 5-6 options', () => {
    const survey = { ...baseSurvey, options: makeOptions(6) }
    render(<SurveyCard survey={survey} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Option \d+$/)
    expect(optionTexts).toHaveLength(6)
    // All options should render with numberOfLines={2}
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('uses dense sizing for 7+ options', () => {
    const survey = { ...baseSurvey, options: makeOptions(8) }
    render(<SurveyCard survey={survey} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Option \d+$/)
    expect(optionTexts).toHaveLength(8)
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('renders question with adjustsFontSizeToFit', () => {
    const survey = { ...baseSurvey, options: makeOptions(3) }
    render(<SurveyCard survey={survey} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const question = screen.getByText('Pick one')
    expect(question.props.adjustsFontSizeToFit).toBe(true)
  })
})

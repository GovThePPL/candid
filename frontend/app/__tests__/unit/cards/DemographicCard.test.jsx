import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../../constants/Colors').LightTheme
jest.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import DemographicCard from '../../../components/cards/DemographicCard'

const makeOptions = (n) =>
  Array.from({ length: n }, (_, i) => ({ value: `val-${i}`, label: `Choice ${i + 1}` }))

const baseDemographic = {
  field: 'age_range',
  question: 'What is your age range?',
}

describe('DemographicCard responsive option sizing', () => {
  it('uses default button variant for <= 4 options', () => {
    const demographic = { ...baseDemographic, options: makeOptions(3) }
    render(<DemographicCard demographic={demographic} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Choice \d+$/)
    expect(optionTexts).toHaveLength(3)
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('uses compact sizing for 5-6 options', () => {
    const demographic = { ...baseDemographic, options: makeOptions(5) }
    render(<DemographicCard demographic={demographic} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Choice \d+$/)
    expect(optionTexts).toHaveLength(5)
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('uses dense sizing for 7+ options', () => {
    const demographic = { ...baseDemographic, options: makeOptions(8) }
    render(<DemographicCard demographic={demographic} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const optionTexts = screen.getAllByText(/^Choice \d+$/)
    expect(optionTexts).toHaveLength(8)
    optionTexts.forEach((el) => {
      expect(el.props.numberOfLines).toBe(2)
    })
  })

  it('renders question with adjustsFontSizeToFit', () => {
    const demographic = { ...baseDemographic, options: makeOptions(3) }
    render(<DemographicCard demographic={demographic} onRespond={jest.fn()} onSkip={jest.fn()} />)
    const question = screen.getByText('What is your age range?')
    expect(question.props.adjustsFontSizeToFit).toBe(true)
  })
})

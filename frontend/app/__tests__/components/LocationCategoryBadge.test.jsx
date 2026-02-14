import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import LocationCategoryBadge from '../../components/LocationCategoryBadge'

const location = { code: 'OR', name: 'Oregon' }
const category = { label: 'Environment' }

describe('LocationCategoryBadge', () => {
  it('returns null when both location and category are null', () => {
    const { toJSON } = render(
      <LocationCategoryBadge location={null} category={null} />
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when both are undefined', () => {
    const { toJSON } = render(<LocationCategoryBadge />)
    expect(toJSON()).toBeNull()
  })

  it('renders location code only when no category', () => {
    render(<LocationCategoryBadge location={location} category={null} size="lg" />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.queryByText('Environment')).toBeNull()
  })

  it('renders category label only when no location', () => {
    render(<LocationCategoryBadge location={null} category={category} size="lg" />)
    expect(screen.getByText('Environment')).toBeTruthy()
    expect(screen.queryByText('OR')).toBeNull()
  })

  it('renders both when both are present', () => {
    render(<LocationCategoryBadge location={location} category={category} />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.getByText('Environment')).toBeTruthy()
  })

  it('uses location.code not location.name', () => {
    render(<LocationCategoryBadge location={location} category={null} />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.queryByText('Oregon')).toBeNull()
  })

  it('ignores location with no code', () => {
    const { toJSON } = render(
      <LocationCategoryBadge location={{ name: 'Oregon' }} category={null} />
    )
    expect(toJSON()).toBeNull()
  })

  it('ignores category with no label', () => {
    const { toJSON } = render(
      <LocationCategoryBadge location={null} category={{ id: 1 }} />
    )
    expect(toJSON()).toBeNull()
  })

  it('defaults to sm size', () => {
    render(<LocationCategoryBadge location={location} category={category} />)
    // Just verify it renders without error at default size
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.getByText('Environment')).toBeTruthy()
  })
})

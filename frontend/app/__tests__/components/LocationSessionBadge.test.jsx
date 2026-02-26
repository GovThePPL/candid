import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

import LocationSessionBadge from '../../components/LocationSessionBadge'

const location = { code: 'OR', name: 'Oregon' }
const session = { label: 'Environment' }

describe('LocationSessionBadge', () => {
  it('returns null when both location and session are null', () => {
    const { toJSON } = render(
      <LocationSessionBadge location={null} session={null} />
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when both are undefined', () => {
    const { toJSON } = render(<LocationSessionBadge />)
    expect(toJSON()).toBeNull()
  })

  it('renders location code only when no session', () => {
    render(<LocationSessionBadge location={location} session={null} size="lg" />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.queryByText('Environment')).toBeNull()
  })

  it('renders session label only when no location', () => {
    render(<LocationSessionBadge location={null} session={session} size="lg" />)
    expect(screen.getByText('Environment')).toBeTruthy()
    expect(screen.queryByText('OR')).toBeNull()
  })

  it('renders both when both are present', () => {
    render(<LocationSessionBadge location={location} session={session} />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.getByText('Environment')).toBeTruthy()
  })

  it('uses location.code not location.name', () => {
    render(<LocationSessionBadge location={location} session={null} />)
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.queryByText('Oregon')).toBeNull()
  })

  it('ignores location with no code', () => {
    const { toJSON } = render(
      <LocationSessionBadge location={{ name: 'Oregon' }} session={null} />
    )
    expect(toJSON()).toBeNull()
  })

  it('ignores session with no label', () => {
    const { toJSON } = render(
      <LocationSessionBadge location={null} session={{ id: 1 }} />
    )
    expect(toJSON()).toBeNull()
  })

  it('defaults to sm size', () => {
    render(<LocationSessionBadge location={location} session={session} />)
    // Just verify it renders without error at default size
    expect(screen.getByText('OR')).toBeTruthy()
    expect(screen.getByText('Environment')).toBeTruthy()
  })
})

import { getInitials, getInitialsColor, getTrustBadgeColor, getAvatarImageUrl } from '../../lib/avatarUtils'
import { BadgeColors, LightTheme } from '../../constants/Colors'

describe('getInitials', () => {
  it('returns "?" for null/undefined/empty', () => {
    expect(getInitials(null)).toBe('?')
    expect(getInitials(undefined)).toBe('?')
    expect(getInitials('')).toBe('?')
  })

  it('returns first letter uppercased for single word', () => {
    expect(getInitials('alice')).toBe('A')
    expect(getInitials('Bob')).toBe('B')
  })

  it('returns first + last initials for multi-word', () => {
    expect(getInitials('Alice Smith')).toBe('AS')
    expect(getInitials('John Doe Jr')).toBe('JJ')
  })

  it('handles extra whitespace', () => {
    expect(getInitials('  alice  smith  ')).toBe('AS')
    // Whitespace-only string: trim() → '', which is falsy — but split produces ['']
    // so parts[0].charAt(0) returns '' → ''.toUpperCase() → ''
    expect(getInitials('   ')).toBe('')
  })
})

describe('getInitialsColor', () => {
  it('returns primaryMuted for null/undefined/empty', () => {
    expect(getInitialsColor(null)).toBe(LightTheme.primaryMuted)
    expect(getInitialsColor(undefined)).toBe(LightTheme.primaryMuted)
    expect(getInitialsColor('')).toBe(LightTheme.primaryMuted)
  })

  it('returns deterministic color for same input', () => {
    const c1 = getInitialsColor('alice')
    const c2 = getInitialsColor('alice')
    expect(c1).toBe(c2)
  })

  it('returns a value from the palette', () => {
    const palette = ['#5C005C', '#9B59B6', '#3498DB', '#1ABC9C', '#27AE60', '#F39C12', '#E74C3C', '#E91E63']
    expect(palette).toContain(getInitialsColor('alice'))
    expect(palette).toContain(getInitialsColor('bob'))
    expect(palette).toContain(getInitialsColor('zzzz'))
  })
})

describe('getTrustBadgeColor', () => {
  it('returns gray for null/undefined', () => {
    expect(getTrustBadgeColor(null)).toBe(BadgeColors.trustBadgeGray)
    expect(getTrustBadgeColor(undefined)).toBe(BadgeColors.trustBadgeGray)
  })

  it('returns gray for scores below 0.35', () => {
    expect(getTrustBadgeColor(0)).toBe(BadgeColors.trustBadgeGray)
    expect(getTrustBadgeColor(0.34)).toBe(BadgeColors.trustBadgeGray)
  })

  it('returns bronze for scores 0.35–0.6', () => {
    expect(getTrustBadgeColor(0.35)).toBe(BadgeColors.trustBadgeBronze)
    expect(getTrustBadgeColor(0.59)).toBe(BadgeColors.trustBadgeBronze)
  })

  it('returns silver for scores 0.6–0.9', () => {
    expect(getTrustBadgeColor(0.6)).toBe(BadgeColors.trustBadgeSilver)
    expect(getTrustBadgeColor(0.89)).toBe(BadgeColors.trustBadgeSilver)
  })

  it('returns gold for scores >= 0.9', () => {
    expect(getTrustBadgeColor(0.9)).toBe(BadgeColors.trustBadgeGold)
    expect(getTrustBadgeColor(1.0)).toBe(BadgeColors.trustBadgeGold)
  })
})

describe('getAvatarImageUrl', () => {
  it('returns null for falsy values', () => {
    expect(getAvatarImageUrl(null)).toBeNull()
    expect(getAvatarImageUrl(undefined)).toBeNull()
    expect(getAvatarImageUrl('')).toBeNull()
  })

  it('passes through data URIs unchanged', () => {
    const uri = 'data:image/png;base64,abc123'
    expect(getAvatarImageUrl(uri)).toBe(uri)
  })

  it('passes through regular URLs unchanged', () => {
    const url = 'https://example.com/avatar.png'
    expect(getAvatarImageUrl(url)).toBe(url)
  })
})

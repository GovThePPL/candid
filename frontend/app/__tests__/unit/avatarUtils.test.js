import { getInitials, getInitialsColor, getTrustBadgeInfo, getAvatarImageUrl } from '../../lib/avatarUtils'
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

describe('getTrustBadgeInfo', () => {
  it('returns purple for null/undefined', () => {
    expect(getTrustBadgeInfo(null)).toEqual({ color: BadgeColors.trustBadgePurple, tier: 'purple' })
    expect(getTrustBadgeInfo(undefined)).toEqual({ color: BadgeColors.trustBadgePurple, tier: 'purple' })
  })

  it('returns purple for scores below 0.35', () => {
    expect(getTrustBadgeInfo(0)).toEqual({ color: BadgeColors.trustBadgePurple, tier: 'purple' })
    expect(getTrustBadgeInfo(0.34)).toEqual({ color: BadgeColors.trustBadgePurple, tier: 'purple' })
  })

  it('returns bronze for scores 0.35–0.6', () => {
    expect(getTrustBadgeInfo(0.35).color).toBe(BadgeColors.trustBadgeBronze)
    expect(getTrustBadgeInfo(0.59).tier).toBe('bronze')
  })

  it('returns silver for scores 0.6–0.9', () => {
    expect(getTrustBadgeInfo(0.6).color).toBe(BadgeColors.trustBadgeSilver)
    expect(getTrustBadgeInfo(0.89).tier).toBe('silver')
  })

  it('returns gold for scores >= 0.9', () => {
    expect(getTrustBadgeInfo(0.9).color).toBe(BadgeColors.trustBadgeGold)
    expect(getTrustBadgeInfo(1.0).tier).toBe('gold')
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

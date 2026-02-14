import {
  LightTheme,
  DarkTheme,
  BrandColor,
  SemanticColors,
  GROUP_COLORS,
  BadgeColors,
  OnBrandColors,
} from '../../constants/Colors'

describe('LightTheme and DarkTheme', () => {
  it('have all required background keys', () => {
    const requiredBgKeys = ['background', 'navBackground', 'uiBackground', 'cardBackground']
    for (const key of requiredBgKeys) {
      expect(LightTheme).toHaveProperty(key)
      expect(DarkTheme).toHaveProperty(key)
    }
  })

  it('have all required text keys', () => {
    const requiredTextKeys = ['text', 'title', 'darkText', 'secondaryText', 'placeholderText']
    for (const key of requiredTextKeys) {
      expect(LightTheme).toHaveProperty(key)
      expect(DarkTheme).toHaveProperty(key)
    }
  })

  it('have matching key sets', () => {
    const lightKeys = Object.keys(LightTheme).sort()
    const darkKeys = Object.keys(DarkTheme).sort()
    expect(lightKeys).toEqual(darkKeys)
  })

  it('have all required interactive button keys', () => {
    const buttonKeys = ['buttonDefault', 'buttonSelected', 'buttonDefaultText', 'buttonSelectedText']
    for (const key of buttonKeys) {
      expect(LightTheme).toHaveProperty(key)
      expect(DarkTheme).toHaveProperty(key)
    }
  })
})

describe('BrandColor', () => {
  it('is the expected purple hex', () => {
    expect(BrandColor).toBe('#5C005C')
  })
})

describe('SemanticColors', () => {
  it('has agree and disagree colors', () => {
    expect(SemanticColors).toHaveProperty('agree')
    expect(SemanticColors).toHaveProperty('disagree')
  })

  it('has warning, success, and escalate', () => {
    expect(SemanticColors).toHaveProperty('warning')
    expect(SemanticColors).toHaveProperty('success')
    expect(SemanticColors).toHaveProperty('escalate')
  })
})

describe('GROUP_COLORS', () => {
  it('has 8 colors', () => {
    expect(GROUP_COLORS).toHaveLength(8)
  })

  it('contains only hex color strings', () => {
    for (const color of GROUP_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('BadgeColors', () => {
  it('has all trust badge tiers', () => {
    expect(BadgeColors).toHaveProperty('trustBadgePurple')
    expect(BadgeColors).toHaveProperty('trustBadgeBronze')
    expect(BadgeColors).toHaveProperty('trustBadgeSilver')
    expect(BadgeColors).toHaveProperty('trustBadgeGold')
  })

  it('has kudos badge color', () => {
    expect(BadgeColors).toHaveProperty('kudosBadge')
  })
})

describe('OnBrandColors', () => {
  it('has text and overlay keys', () => {
    expect(OnBrandColors).toHaveProperty('text')
    expect(OnBrandColors).toHaveProperty('textSecondary')
    expect(OnBrandColors).toHaveProperty('textTertiary')
    expect(OnBrandColors).toHaveProperty('overlay')
  })
})

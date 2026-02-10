export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
}

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 25,
}

export const Typography = {
  brand:        { fontSize: 56, fontWeight: '600' },
  brandCompact: { fontSize: 32, fontWeight: '600' },
  overlay:      { fontSize: 48, fontWeight: '700' },
  h1:           { fontSize: 24, fontWeight: '700' },
  h2:           { fontSize: 18, fontWeight: '600' },
  h3:           { fontSize: 16, fontWeight: '600' },
  h4:           { fontSize: 20, fontWeight: '700' },
  statement:    { fontSize: 22, fontWeight: '500', lineHeight: 32 },
  body:         { fontSize: 15, lineHeight: 22 },
  bodySmall:    { fontSize: 14, lineHeight: 20 },
  label:        { fontSize: 13, fontWeight: '600' },
  caption:      { fontSize: 12 },
  button:       { fontSize: 16, fontWeight: '600' },
  buttonSmall:  { fontSize: 14, fontWeight: '600' },
  badgeLg:      { fontSize: 12, fontWeight: '600' },
  badge:        { fontSize: 10, fontWeight: '700' },
  badgeSm:      { fontSize: 9, fontWeight: '700' },
  micro:        { fontSize: 8, fontWeight: '700' },
}

// maxFontSizeMultiplier per variant — caps Dynamic Type scaling to prevent layout breakage
export const TypographyScaleCaps = {
  brand: 1.0,
  brandCompact: 1.0,
  overlay: 1.0,
  h1: 1.5,
  h2: 1.5,
  h3: 1.5,
  h4: 1.5,
  statement: 1.5,
  body: 2.0,
  bodySmall: 2.0,
  label: 1.8,
  caption: 2.0,
  button: 1.3,
  buttonSmall: 1.3,
  badgeLg: 1.2,
  badge: 1.1,
  badgeSm: 1.1,
  micro: 1.1,
}

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
}

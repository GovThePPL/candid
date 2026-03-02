import { createGlossaryTextRule } from '../../lib/glossaryMarkdownRule'

// Mock react-native Text
jest.mock('react-native', () => ({
  Text: 'Text',
}))

describe('createGlossaryTextRule', () => {
  const matchPattern = /\b(Filibuster|Caucus)\b/gi
  const termMap = new Map([
    ['filibuster', { slug: 'filibuster', term: 'Filibuster' }],
    ['caucus', { slug: 'caucus', term: 'Caucus' }],
  ])
  const onTermPress = jest.fn()
  const highlightStyle = { color: '#5C005C', textDecorationLine: 'underline' }

  it('returns empty object when no pattern provided', () => {
    expect(createGlossaryTextRule(null, termMap, onTermPress, highlightStyle)).toEqual({})
  })

  it('returns empty object when no termMap provided', () => {
    expect(createGlossaryTextRule(matchPattern, null, onTermPress, highlightStyle)).toEqual({})
  })

  it('returns empty object when no onTermPress provided', () => {
    expect(createGlossaryTextRule(matchPattern, termMap, null, highlightStyle)).toEqual({})
  })

  it('returns rules object with text key', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    expect(rules).toHaveProperty('text')
    expect(typeof rules.text).toBe('function')
  })

  it('text rule returns null for empty content', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    const result = rules.text({ key: '1', content: '' }, null, null, { text: {} })
    expect(result).toBeNull()
  })

  it('text rule returns plain text when no matches', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    const result = rules.text({ key: '1', content: 'No terms here' }, null, null, { text: {} })
    // Returns a Text element with the content
    expect(result).toBeTruthy()
    expect(result.props.children).toBe('No terms here')
  })

  it('text rule splits text with matches into segments', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    const result = rules.text(
      { key: '1', content: 'The Filibuster is a tactic' },
      null, null, { text: {} }
    )
    // Returns a Text with children array
    expect(result).toBeTruthy()
    const children = result.props.children
    expect(Array.isArray(children)).toBe(true)
    // Should have segments including the highlighted term
    const nonNull = children.filter(Boolean)
    expect(nonNull.length).toBeGreaterThan(1)
  })

  it('text rule preserves inheritedStyles from parent nodes (e.g. headings)', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    const inherited = { fontSize: 24, fontWeight: '700' }
    const textStyle = { color: '#333' }
    const result = rules.text(
      { key: '1', content: 'No terms here' },
      null, null, { text: textStyle }, inherited
    )
    expect(result).toBeTruthy()
    // style should be [inheritedStyles, styles.text]
    const style = result.props.style
    expect(Array.isArray(style)).toBe(true)
    expect(style[0]).toEqual(inherited)
    expect(style[1]).toEqual(textStyle)
  })

  it('text rule preserves inheritedStyles when glossary matches exist', () => {
    const rules = createGlossaryTextRule(matchPattern, termMap, onTermPress, highlightStyle)
    const inherited = { fontSize: 24, fontWeight: '700' }
    const result = rules.text(
      { key: '1', content: 'The Filibuster is a tactic' },
      null, null, { text: {} }, inherited
    )
    const style = result.props.style
    expect(Array.isArray(style)).toBe(true)
    expect(style[0]).toEqual(inherited)
  })
})

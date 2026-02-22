import { computeLineDiff, computeCharDiff } from '../../lib/lineDiff'

describe('computeLineDiff', () => {
  it('returns all same for identical strings', () => {
    const result = computeLineDiff('hello\nworld', 'hello\nworld')
    expect(result).toEqual([
      { type: 'same', text: 'hello' },
      { type: 'same', text: 'world' },
    ])
  })

  it('detects added lines', () => {
    const result = computeLineDiff('line1\nline3', 'line1\nline2\nline3')
    expect(result).toEqual([
      { type: 'same', text: 'line1' },
      { type: 'add', text: 'line2' },
      { type: 'same', text: 'line3' },
    ])
  })

  it('detects removed lines', () => {
    const result = computeLineDiff('line1\nline2\nline3', 'line1\nline3')
    expect(result).toEqual([
      { type: 'same', text: 'line1' },
      { type: 'remove', text: 'line2' },
      { type: 'same', text: 'line3' },
    ])
  })

  it('detects modified lines as remove + add', () => {
    const result = computeLineDiff('hello world', 'hello earth')
    expect(result).toEqual([
      { type: 'remove', text: 'hello world' },
      { type: 'add', text: 'hello earth' },
    ])
  })

  it('handles empty original', () => {
    const result = computeLineDiff('', 'new line')
    expect(result).toEqual([
      { type: 'remove', text: '' },
      { type: 'add', text: 'new line' },
    ])
  })

  it('handles empty edited', () => {
    const result = computeLineDiff('old line', '')
    expect(result).toEqual([
      { type: 'remove', text: 'old line' },
      { type: 'add', text: '' },
    ])
  })

  it('handles both empty', () => {
    const result = computeLineDiff('', '')
    expect(result).toEqual([
      { type: 'same', text: '' },
    ])
  })

  it('handles null/undefined inputs', () => {
    const result = computeLineDiff(null, undefined)
    expect(result).toEqual([
      { type: 'same', text: '' },
    ])
  })

  it('handles multiple changes interspersed with same lines', () => {
    const original = 'a\nb\nc\nd\ne'
    const edited = 'a\nB\nc\nD\ne'
    const result = computeLineDiff(original, edited)
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' },
      { type: 'remove', text: 'd' },
      { type: 'add', text: 'D' },
      { type: 'same', text: 'e' },
    ])
  })

  it('handles completely different content', () => {
    const result = computeLineDiff('foo\nbar', 'baz\nqux')
    // All lines are different
    const types = result.map(h => h.type)
    expect(types).toContain('remove')
    expect(types).toContain('add')
    expect(types).not.toContain('same')
  })

  it('handles adding lines at the end', () => {
    const result = computeLineDiff('a\nb', 'a\nb\nc')
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
      { type: 'add', text: 'c' },
    ])
  })

  it('handles removing lines from the end', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb')
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
      { type: 'remove', text: 'c' },
    ])
  })
})

describe('computeCharDiff', () => {
  it('returns unhighlighted segments for identical strings', () => {
    const { oldSegments, newSegments } = computeCharDiff('hello', 'hello')
    expect(oldSegments).toEqual([{ text: 'hello', highlighted: false }])
    expect(newSegments).toEqual([{ text: 'hello', highlighted: false }])
  })

  it('highlights appended text correctly', () => {
    const { oldSegments, newSegments } = computeCharDiff('related terms', 'related terms and stuff')
    // Old string should be entirely unhighlighted
    expect(oldSegments).toEqual([{ text: 'related terms', highlighted: false }])
    // New string should have common prefix unhighlighted and addition highlighted
    expect(newSegments).toEqual([
      { text: 'related terms', highlighted: false },
      { text: ' and stuff', highlighted: true },
    ])
  })

  it('highlights prepended text correctly', () => {
    const { oldSegments, newSegments } = computeCharDiff('world', 'hello world')
    expect(oldSegments).toEqual([{ text: 'world', highlighted: false }])
    expect(newSegments).toEqual([
      { text: 'hello ', highlighted: true },
      { text: 'world', highlighted: false },
    ])
  })

  it('highlights middle insertion correctly', () => {
    const { oldSegments, newSegments } = computeCharDiff('abc xyz', 'abc 123 xyz')
    expect(oldSegments).toEqual([{ text: 'abc ', highlighted: false }, { text: 'xyz', highlighted: false }])
    expect(newSegments).toEqual([
      { text: 'abc ', highlighted: false },
      { text: '123 ', highlighted: true },
      { text: 'xyz', highlighted: false },
    ])
  })

  it('highlights replacement in the middle correctly', () => {
    const { oldSegments, newSegments } = computeCharDiff('hello world', 'hello earth')
    // Common prefix: "hello "
    expect(oldSegments[0]).toEqual({ text: 'hello ', highlighted: false })
    expect(newSegments[0]).toEqual({ text: 'hello ', highlighted: false })
    // Both sides should have some highlighted (changed) content
    expect(oldSegments.some(s => s.highlighted)).toBe(true)
    expect(newSegments.some(s => s.highlighted)).toBe(true)
  })

  it('handles completely different strings', () => {
    const { oldSegments, newSegments } = computeCharDiff('abc', 'xyz')
    expect(oldSegments.every(s => s.highlighted)).toBe(true)
    expect(newSegments.every(s => s.highlighted)).toBe(true)
  })

  it('handles empty old string', () => {
    const { oldSegments, newSegments } = computeCharDiff('', 'new text')
    expect(newSegments).toEqual([{ text: 'new text', highlighted: true }])
  })

  it('handles empty new string', () => {
    const { oldSegments, newSegments } = computeCharDiff('old text', '')
    expect(oldSegments).toEqual([{ text: 'old text', highlighted: true }])
  })
})

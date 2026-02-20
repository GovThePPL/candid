import {
  QUOTE_LINK_RE,
  isQuoteLine,
  splitIntoSegments,
  buildQuoteMarkup,
  stripQuoteMarkup,
  hasQuotes,
} from '../../lib/quoteUtils'

describe('QUOTE_LINK_RE', () => {
  it('matches full message quote', () => {
    expect(QUOTE_LINK_RE.test('[some text](M5)')).toBe(true)
  })

  it('matches ranged message quote', () => {
    expect(QUOTE_LINK_RE.test('[excerpt...](M5:25-128)')).toBe(true)
  })

  it('matches statement quote', () => {
    expect(QUOTE_LINK_RE.test('[text](S2)')).toBe(true)
  })

  it('matches definition quote', () => {
    expect(QUOTE_LINK_RE.test('[freedom](D1)')).toBe(true)
  })

  it('does not match invalid prefixes', () => {
    expect(QUOTE_LINK_RE.test('[text](X5)')).toBe(false)
  })

  it('does not match missing number', () => {
    expect(QUOTE_LINK_RE.test('[text](M)')).toBe(false)
  })

  it('does not match partial format', () => {
    expect(QUOTE_LINK_RE.test('(M5)')).toBe(false)
  })
})

describe('isQuoteLine', () => {
  it('returns true for a valid quote line', () => {
    expect(isQuoteLine('[hello](M3)')).toBe(true)
  })

  it('returns true with leading/trailing whitespace', () => {
    expect(isQuoteLine('  [hello](M3)  ')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(isQuoteLine('hello world')).toBe(false)
  })

  it('returns false for text with embedded quote', () => {
    expect(isQuoteLine('I agree with [this](M3) and more')).toBe(false)
  })

  it('returns true for a definition quote line', () => {
    expect(isQuoteLine('[freedom](D1)')).toBe(true)
  })
})

describe('splitIntoSegments', () => {
  it('returns empty array for empty content', () => {
    expect(splitIntoSegments('')).toEqual([])
    expect(splitIntoSegments(null)).toEqual([])
  })

  it('returns single text segment for plain text', () => {
    const result = splitIntoSegments('Hello world')
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('parses a single quote line', () => {
    const result = splitIntoSegments('[excerpt](M3)')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('quote')
    expect(result[0].prefix).toBe('M')
    expect(result[0].num).toBe(3)
    expect(result[0].start).toBeNull()
    expect(result[0].end).toBeNull()
  })

  it('parses a ranged quote', () => {
    const result = splitIntoSegments('[text](M5:25-128)')
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(25)
    expect(result[0].end).toBe(128)
  })

  it('handles mixed content and quotes', () => {
    const content = '[quote](M1)\nMy response\n[another](S2)'
    const result = splitIntoSegments(content)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('quote')
    expect(result[0].prefix).toBe('M')
    expect(result[1].type).toBe('text')
    expect(result[1].content).toBe('My response')
    expect(result[2].type).toBe('quote')
    expect(result[2].prefix).toBe('S')
  })

  it('parses a definition quote', () => {
    const result = splitIntoSegments('[freedom](D1)')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('quote')
    expect(result[0].prefix).toBe('D')
    expect(result[0].num).toBe(1)
  })

  it('handles M, S, and D quotes together', () => {
    const content = '[msg](M1)\n[stmt](S2)\n[defn](D3)'
    const result = splitIntoSegments(content)
    expect(result).toHaveLength(3)
    expect(result[0].prefix).toBe('M')
    expect(result[1].prefix).toBe('S')
    expect(result[2].prefix).toBe('D')
  })

  it('groups consecutive text lines', () => {
    const content = 'Line 1\nLine 2\nLine 3'
    const result = splitIntoSegments(content)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Line 1\nLine 2\nLine 3')
  })

  it('handles quote followed by text then quote', () => {
    const content = '[a](M1)\nText here\n[b](M2)'
    const result = splitIntoSegments(content)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('quote')
    expect(result[1].type).toBe('text')
    expect(result[2].type).toBe('quote')
  })
})

describe('buildQuoteMarkup', () => {
  it('builds full quote markup', () => {
    const result = buildQuoteMarkup('M', 5, 'Short text')
    expect(result).toBe('[Short text](M5)')
  })

  it('truncates long text', () => {
    const longText = 'A'.repeat(60)
    const result = buildQuoteMarkup('M', 3, longText)
    expect(result).toContain('...')
    expect(result).toMatch(/^\[A{40}\.\.\.\]\(M3\)$/)
  })

  it('builds ranged quote markup', () => {
    const result = buildQuoteMarkup('M', 5, 'Hello world, this is a test message', { start: 0, end: 11 })
    expect(result).toBe('[Hello world](M5:0-11)')
  })

  it('builds statement quote markup', () => {
    const result = buildQuoteMarkup('S', 2, 'We agree on this')
    expect(result).toBe('[We agree on this](S2)')
  })

  it('builds definition quote markup', () => {
    const result = buildQuoteMarkup('D', 1, 'The ability to choose freely')
    expect(result).toBe('[The ability to choose freely](D1)')
  })

  it('strips existing quote markup from excerpt', () => {
    const text = '[inner quote](M1)\nSome other text'
    const result = buildQuoteMarkup('M', 3, text)
    // Should strip the inner [inner quote](M1) to just "inner quote"
    expect(result).toContain('inner quote')
    expect(result).not.toContain('](M1)')
  })

  it('replaces newlines with spaces in excerpt', () => {
    const text = 'Line one\nLine two\nLine three'
    const result = buildQuoteMarkup('M', 5, text)
    expect(result).toBe('[Line one Line two Line three](M5)')
    // Must not contain newlines — they break the quote link format
    expect(result).not.toContain('\n')
  })

  it('replaces newlines in multi-line text before truncating', () => {
    const text = 'A'.repeat(20) + '\n' + 'B'.repeat(30)
    const result = buildQuoteMarkup('M', 1, text)
    expect(result).not.toContain('\n')
    expect(result).toMatch(/^\[.+\]\(M1\)$/)
  })
})

describe('stripQuoteMarkup', () => {
  it('returns empty string for empty input', () => {
    expect(stripQuoteMarkup('')).toBe('')
    expect(stripQuoteMarkup(null)).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(stripQuoteMarkup('Hello world')).toBe('Hello world')
  })

  it('strips full quote links', () => {
    expect(stripQuoteMarkup('[excerpt](M5)')).toBe('excerpt')
  })

  it('strips ranged quote links', () => {
    expect(stripQuoteMarkup('[text](M5:25-128)')).toBe('text')
  })

  it('strips multiple quote links', () => {
    const result = stripQuoteMarkup('[a](M1) and [b](S2)')
    expect(result).toBe('a and b')
  })

  it('preserves surrounding text', () => {
    const result = stripQuoteMarkup('Before [quote](M3) after')
    expect(result).toBe('Before quote after')
  })
})

describe('hasQuotes', () => {
  it('returns false for empty input', () => {
    expect(hasQuotes('')).toBe(false)
    expect(hasQuotes(null)).toBe(false)
  })

  it('returns false for plain text', () => {
    expect(hasQuotes('Hello world')).toBe(false)
  })

  it('returns true for content with quotes', () => {
    expect(hasQuotes('[text](M5)')).toBe(true)
  })

  it('returns true for inline quotes', () => {
    expect(hasQuotes('I agree with [this](M3)')).toBe(true)
  })
})

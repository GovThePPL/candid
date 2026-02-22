import { markdownToHtml, htmlToMarkdown } from '../../lib/markdownConvert'

describe('markdownConvert', () => {
  describe('markdownToHtml', () => {
    it('returns empty string for null/undefined input', () => {
      expect(markdownToHtml(null)).toBe('')
      expect(markdownToHtml(undefined)).toBe('')
      expect(markdownToHtml('')).toBe('')
    })

    it('converts bold markdown to HTML', () => {
      const html = markdownToHtml('**bold text**')
      expect(html).toContain('<strong>bold text</strong>')
    })

    it('converts italic markdown to HTML', () => {
      const html = markdownToHtml('*italic text*')
      expect(html).toContain('<em>italic text</em>')
    })

    it('converts headings', () => {
      const html = markdownToHtml('## Heading 2')
      expect(html).toContain('<h2')
      expect(html).toContain('Heading 2')
    })

    it('converts links', () => {
      const html = markdownToHtml('[click here](https://example.com)')
      expect(html).toContain('<a')
      expect(html).toContain('href="https://example.com"')
      expect(html).toContain('click here')
    })

    it('converts bullet lists', () => {
      const html = markdownToHtml('- item 1\n- item 2')
      expect(html).toContain('<ul>')
      expect(html).toContain('<li>')
      expect(html).toContain('item 1')
    })

    it('converts blockquotes', () => {
      const html = markdownToHtml('> quoted text')
      expect(html).toContain('<blockquote>')
      expect(html).toContain('quoted text')
    })

    it('converts images', () => {
      const html = markdownToHtml('![alt](https://example.com/img.png)')
      expect(html).toContain('<img')
      expect(html).toContain('src="https://example.com/img.png"')
    })
  })

  describe('htmlToMarkdown', () => {
    it('returns empty string for null/undefined input', () => {
      expect(htmlToMarkdown(null)).toBe('')
      expect(htmlToMarkdown(undefined)).toBe('')
      expect(htmlToMarkdown('')).toBe('')
    })

    it('converts bold HTML to markdown', () => {
      const md = htmlToMarkdown('<strong>bold</strong>')
      expect(md).toBe('**bold**')
    })

    it('converts italic HTML to markdown', () => {
      const md = htmlToMarkdown('<em>italic</em>')
      expect(md).toBe('_italic_')
    })

    it('converts headings to atx style', () => {
      const md = htmlToMarkdown('<h2>Title</h2>')
      expect(md).toBe('## Title')
    })

    it('converts links', () => {
      const md = htmlToMarkdown('<a href="https://example.com">click</a>')
      expect(md).toBe('[click](https://example.com)')
    })

    it('converts bullet lists with dash marker', () => {
      const md = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')
      expect(md).toMatch(/-\s+one/)
      expect(md).toMatch(/-\s+two/)
    })

    it('converts blockquotes', () => {
      const md = htmlToMarkdown('<blockquote><p>quoted</p></blockquote>')
      expect(md).toContain('> quoted')
    })
  })

  describe('round-trip', () => {
    it('preserves bold through md→html→md', () => {
      const original = '**bold text**'
      const html = markdownToHtml(original)
      const result = htmlToMarkdown(html)
      expect(result).toContain('**bold text**')
    })

    it('preserves links through md→html→md', () => {
      const original = '[link](https://example.com)'
      const html = markdownToHtml(original)
      const result = htmlToMarkdown(html)
      expect(result).toContain('[link](https://example.com)')
    })
  })
})

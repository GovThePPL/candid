import { formatRelativeTime } from '../../lib/timeUtils'

const t = (key, opts) => {
  // Simple mock that returns the key pattern with interpolation
  const parts = key.split(':')
  const k = parts[parts.length - 1]
  if (opts?.count !== undefined) return `${opts.count}${k.replace('time', '').replace('Minutes', 'm').replace('Hours', 'h').replace('Days', 'd').replace('Weeks', 'w').replace('Months', 'mo').replace('Years', 'y')}`
  if (k === 'timeJustNow') return 'now'
  return k
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-12T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns empty string for null date', () => {
    expect(formatRelativeTime(null, t)).toBe('')
  })

  it('returns empty string for undefined date', () => {
    expect(formatRelativeTime(undefined, t)).toBe('')
  })

  it('returns "now" for dates less than 60 seconds ago', () => {
    const date = new Date('2026-02-12T11:59:30Z')
    expect(formatRelativeTime(date, t)).toBe('now')
  })

  it('returns minutes for dates 1-59 minutes ago', () => {
    const date = new Date('2026-02-12T11:55:00Z')
    expect(formatRelativeTime(date, t)).toBe('5m')
  })

  it('returns hours for dates 1-23 hours ago', () => {
    const date = new Date('2026-02-12T09:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('3h')
  })

  it('returns days for dates 1-6 days ago', () => {
    const date = new Date('2026-02-10T12:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('2d')
  })

  it('returns weeks for dates 1-4 weeks ago', () => {
    const date = new Date('2026-01-29T12:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('2w')
  })

  it('returns months for dates 1-11 months ago', () => {
    const date = new Date('2025-11-12T12:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('3mo')
  })

  it('returns years for dates 1+ years ago', () => {
    const date = new Date('2024-02-12T12:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('2y')
  })

  it('handles ISO string input', () => {
    expect(formatRelativeTime('2026-02-12T11:55:00Z', t)).toBe('5m')
  })

  it('returns "now" for future dates', () => {
    const date = new Date('2026-02-12T13:00:00Z')
    expect(formatRelativeTime(date, t)).toBe('now')
  })
})

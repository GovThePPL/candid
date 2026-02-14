import { isBridging } from '../../lib/bridging'

describe('isBridging', () => {
  it('returns false when bridgingScore is null', () => {
    expect(isBridging({ bridgingScore: null, upvoteCount: 10, downvoteCount: 0 })).toBe(false)
  })

  it('returns false when bridgingScore is undefined', () => {
    expect(isBridging({ upvoteCount: 10, downvoteCount: 0 })).toBe(false)
  })

  it('returns false when total votes are below minimum (5)', () => {
    expect(isBridging({ bridgingScore: 0.5, upvoteCount: 3, downvoteCount: 1 })).toBe(false)
  })

  it('returns false when bridgingScore is below threshold (0.3)', () => {
    expect(isBridging({ bridgingScore: 0.2, upvoteCount: 10, downvoteCount: 2 })).toBe(false)
  })

  it('returns true when bridgingScore meets threshold with enough votes', () => {
    expect(isBridging({ bridgingScore: 0.3, upvoteCount: 4, downvoteCount: 1 })).toBe(true)
  })

  it('returns true for high bridging score', () => {
    expect(isBridging({ bridgingScore: 0.8, upvoteCount: 20, downvoteCount: 5 })).toBe(true)
  })

  it('counts both upvotes and downvotes toward minimum', () => {
    expect(isBridging({ bridgingScore: 0.5, upvoteCount: 2, downvoteCount: 3 })).toBe(true)
  })

  it('handles zero counts gracefully', () => {
    expect(isBridging({ bridgingScore: 0.5 })).toBe(false)
  })

  it('returns true at exactly the threshold', () => {
    expect(isBridging({ bridgingScore: 0.3, upvoteCount: 5, downvoteCount: 0 })).toBe(true)
  })

  it('returns false at exactly one vote below minimum', () => {
    expect(isBridging({ bridgingScore: 0.5, upvoteCount: 4, downvoteCount: 0 })).toBe(false)
  })

  it('works for post objects (same shape)', () => {
    expect(isBridging({ bridgingScore: 0.5, upvoteCount: 10, downvoteCount: 2 })).toBe(true)
  })
})


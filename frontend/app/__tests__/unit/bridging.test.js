import { isBridging, bridgingThreshold } from '../../lib/bridging'

describe('bridgingThreshold', () => {
  it('returns Infinity for zero votes', () => {
    expect(bridgingThreshold(0)).toBe(Infinity)
  })

  it('returns high threshold for few votes (5)', () => {
    // 0.40 + 0.45/sqrt(5) ≈ 0.601
    const t = bridgingThreshold(5)
    expect(t).toBeCloseTo(0.601, 2)
  })

  it('returns moderate threshold at 20 votes', () => {
    // 0.40 + 0.45/sqrt(20) ≈ 0.501
    const t = bridgingThreshold(20)
    expect(t).toBeCloseTo(0.501, 2)
  })

  it('converges toward base (0.40) at high vote counts', () => {
    // 0.40 + 0.45/sqrt(100) = 0.445
    const t = bridgingThreshold(100)
    expect(t).toBeCloseTo(0.445, 2)
  })

  it('approaches 0.40 at very high vote counts', () => {
    const t = bridgingThreshold(10000)
    expect(t).toBeCloseTo(0.40, 1)
  })
})

describe('isBridging', () => {
  it('returns false when bridgingScore is null', () => {
    expect(isBridging({ bridgingScore: null, upvoteCount: 10, downvoteCount: 0 })).toBe(false)
  })

  it('returns false when bridgingScore is undefined', () => {
    expect(isBridging({ upvoteCount: 10, downvoteCount: 0 })).toBe(false)
  })

  it('returns false when total votes are below minimum (5)', () => {
    expect(isBridging({ bridgingScore: 0.9, upvoteCount: 3, downvoteCount: 1 })).toBe(false)
  })

  it('returns false for moderate score with only 5 votes (threshold ≈ 0.60)', () => {
    expect(isBridging({ bridgingScore: 0.55, upvoteCount: 4, downvoteCount: 1 })).toBe(false)
  })

  it('returns true for high score with 5 votes', () => {
    // threshold at 5 votes ≈ 0.601
    expect(isBridging({ bridgingScore: 0.65, upvoteCount: 4, downvoteCount: 1 })).toBe(true)
  })

  it('returns true for moderate score with many votes', () => {
    // threshold at 50 votes ≈ 0.464
    expect(isBridging({ bridgingScore: 0.50, upvoteCount: 40, downvoteCount: 10 })).toBe(true)
  })

  it('returns false for score just below threshold at given vote count', () => {
    // threshold at 20 votes ≈ 0.501
    expect(isBridging({ bridgingScore: 0.49, upvoteCount: 15, downvoteCount: 5 })).toBe(false)
  })

  it('handles zero counts gracefully', () => {
    expect(isBridging({ bridgingScore: 0.5 })).toBe(false)
  })

  it('returns false at exactly one vote below minimum', () => {
    expect(isBridging({ bridgingScore: 0.9, upvoteCount: 4, downvoteCount: 0 })).toBe(false)
  })

  it('counts both upvotes and downvotes toward total', () => {
    // 2 + 3 = 5 votes, threshold ≈ 0.601
    expect(isBridging({ bridgingScore: 0.65, upvoteCount: 2, downvoteCount: 3 })).toBe(true)
  })

  it('becomes easier to qualify with more votes', () => {
    const item10 = { bridgingScore: 0.54, upvoteCount: 8, downvoteCount: 2 }
    const item50 = { bridgingScore: 0.54, upvoteCount: 40, downvoteCount: 10 }
    // At 10 votes threshold ≈ 0.542, at 50 votes threshold ≈ 0.464
    expect(isBridging(item10)).toBe(false)
    expect(isBridging(item50)).toBe(true)
  })
})

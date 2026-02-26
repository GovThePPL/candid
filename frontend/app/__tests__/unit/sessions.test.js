import { STAGE_TO_PHASE, STAGE_TO_ROUND_TYPE } from '../../constants/Sessions'

describe('STAGE_TO_PHASE mapping', () => {
  it('maps proposal stages to proposal phase', () => {
    expect(STAGE_TO_PHASE.proposal_issue).toBe('proposal')
    expect(STAGE_TO_PHASE.proposal_qualify).toBe('proposal')
    expect(STAGE_TO_PHASE.proposal_stakeholders).toBe('proposal')
  })

  it('maps opinion stages to opinion phase', () => {
    expect(STAGE_TO_PHASE.opinion_discussion).toBe('opinion')
    expect(STAGE_TO_PHASE.opinion_curation).toBe('opinion')
    expect(STAGE_TO_PHASE.opinion_proposals).toBe('opinion')
  })

  it('maps reflection and consensus to their own phases', () => {
    expect(STAGE_TO_PHASE.reflection).toBe('reflection')
    expect(STAGE_TO_PHASE.consensus).toBe('consensus')
  })

  it('returns undefined for unknown stages', () => {
    expect(STAGE_TO_PHASE.nonexistent).toBeUndefined()
  })

  it('has entries for all 8 stages', () => {
    expect(Object.keys(STAGE_TO_PHASE)).toHaveLength(8)
  })
})

describe('STAGE_TO_ROUND_TYPE mapping', () => {
  it('maps proposal stages to issue_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.proposal_issue).toBe('issue_selection')
    expect(STAGE_TO_ROUND_TYPE.proposal_qualify).toBe('issue_selection')
    expect(STAGE_TO_ROUND_TYPE.proposal_stakeholders).toBe('issue_selection')
  })

  it('maps opinion stages to policy_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.opinion_discussion).toBe('policy_selection')
    expect(STAGE_TO_ROUND_TYPE.opinion_curation).toBe('policy_selection')
    expect(STAGE_TO_ROUND_TYPE.opinion_proposals).toBe('policy_selection')
  })

  it('maps reflection and consensus to policy_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.reflection).toBe('policy_selection')
    expect(STAGE_TO_ROUND_TYPE.consensus).toBe('policy_selection')
  })

  it('returns undefined for unknown stages', () => {
    expect(STAGE_TO_ROUND_TYPE.nonexistent).toBeUndefined()
  })

  it('has entries for all 8 stages', () => {
    expect(Object.keys(STAGE_TO_ROUND_TYPE)).toHaveLength(8)
  })

  it('covers same stages as STAGE_TO_PHASE', () => {
    const phaseKeys = Object.keys(STAGE_TO_PHASE).sort()
    const roundTypeKeys = Object.keys(STAGE_TO_ROUND_TYPE).sort()
    expect(roundTypeKeys).toEqual(phaseKeys)
  })
})

describe('CacheKeys.stats with phase', () => {
  // Import after mock setup isn't needed — cache.js is pure
  const { CacheKeys } = require('../../lib/cache')

  it('includes phase in cache key when provided', () => {
    const key = CacheKeys.stats('loc-1', 'sess-1', 'proposal')
    expect(key).toBe('stats:loc-1:sess-1:proposal')
  })

  it('omits phase suffix when phase is null', () => {
    const key = CacheKeys.stats('loc-1', 'sess-1', null)
    expect(key).toBe('stats:loc-1:sess-1')
  })

  it('omits phase suffix when phase is undefined', () => {
    const key = CacheKeys.stats('loc-1', 'sess-1')
    expect(key).toBe('stats:loc-1:sess-1')
  })

  it('produces different keys for different phases', () => {
    const proposal = CacheKeys.stats('loc-1', 'sess-1', 'proposal')
    const opinion = CacheKeys.stats('loc-1', 'sess-1', 'opinion')
    const none = CacheKeys.stats('loc-1', 'sess-1')
    expect(proposal).not.toBe(opinion)
    expect(proposal).not.toBe(none)
  })
})

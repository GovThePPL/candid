import { STAGE_TO_PHASE, STAGE_TO_ROUND_TYPE, PROPOSAL_METHOD_PHASES } from '../../constants/Sessions'

describe('STAGE_TO_PHASE mapping', () => {
  it('maps proposal stages to proposal phase', () => {
    expect(STAGE_TO_PHASE.proposal_issue).toBe('proposal')
    expect(STAGE_TO_PHASE.proposal_qualify).toBe('proposal')
    expect(STAGE_TO_PHASE.proposal_stakeholders).toBe('proposal')
  })

  it('maps opinion_discussion to opinion phase', () => {
    expect(STAGE_TO_PHASE.opinion_discussion).toBe('opinion')
  })

  it('maps curation and proposals stages to reflection phase', () => {
    expect(STAGE_TO_PHASE.reflection_curation).toBe('reflection')
    expect(STAGE_TO_PHASE.reflection_proposals).toBe('reflection')
  })

  it('maps consensus to its own phase', () => {
    expect(STAGE_TO_PHASE.consensus).toBe('consensus')
  })

  it('returns undefined for unknown stages', () => {
    expect(STAGE_TO_PHASE.nonexistent).toBeUndefined()
  })

  it('has entries for all 7 stages', () => {
    expect(Object.keys(STAGE_TO_PHASE)).toHaveLength(7)
  })
})

describe('STAGE_TO_ROUND_TYPE mapping', () => {
  it('maps proposal stages to issue_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.proposal_issue).toBe('issue_selection')
    expect(STAGE_TO_ROUND_TYPE.proposal_qualify).toBe('issue_selection')
    expect(STAGE_TO_ROUND_TYPE.proposal_stakeholders).toBe('issue_selection')
  })

  it('maps opinion and reflection stages to policy_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.opinion_discussion).toBe('policy_selection')
    expect(STAGE_TO_ROUND_TYPE.reflection_curation).toBe('policy_selection')
    expect(STAGE_TO_ROUND_TYPE.reflection_proposals).toBe('policy_selection')
  })

  it('maps consensus to policy_selection', () => {
    expect(STAGE_TO_ROUND_TYPE.consensus).toBe('policy_selection')
  })

  it('returns undefined for unknown stages', () => {
    expect(STAGE_TO_ROUND_TYPE.nonexistent).toBeUndefined()
  })

  it('has entries for all 7 stages', () => {
    expect(Object.keys(STAGE_TO_ROUND_TYPE)).toHaveLength(7)
  })

  it('covers same stages as STAGE_TO_PHASE', () => {
    const phaseKeys = Object.keys(STAGE_TO_PHASE).sort()
    const roundTypeKeys = Object.keys(STAGE_TO_ROUND_TYPE).sort()
    expect(roundTypeKeys).toEqual(phaseKeys)
  })
})

describe('PROPOSAL_METHOD_PHASES mapping', () => {
  it('user_driven includes all 4 phases', () => {
    expect(PROPOSAL_METHOD_PHASES.user_driven).toEqual(['proposal', 'opinion', 'reflection', 'consensus'])
  })

  it('admin_provided includes all 4 phases', () => {
    expect(PROPOSAL_METHOD_PHASES.admin_provided).toEqual(['proposal', 'opinion', 'reflection', 'consensus'])
  })

  it('direct_proposal skips proposal phase', () => {
    expect(PROPOSAL_METHOD_PHASES.direct_proposal).toEqual(['opinion', 'reflection', 'consensus'])
    expect(PROPOSAL_METHOD_PHASES.direct_proposal).not.toContain('proposal')
  })

  it('has entries for all 3 proposal methods', () => {
    expect(Object.keys(PROPOSAL_METHOD_PHASES)).toHaveLength(3)
  })

  it('all phases are valid STAGE_TO_PHASE values', () => {
    const validPhases = new Set(Object.values(STAGE_TO_PHASE))
    for (const phases of Object.values(PROPOSAL_METHOD_PHASES)) {
      for (const phase of phases) {
        expect(validPhases).toContain(phase)
      }
    }
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

/**
 * Session stage → deliberation phase mapping.
 * Mirrors the backend STAGE_TO_PHASE in constants.py.
 */
export const STAGE_TO_PHASE = {
  proposal_issue: 'proposal',
  proposal_qualify: 'proposal',
  proposal_stakeholders: 'proposal',
  opinion_discussion: 'opinion',
  reflection_curation: 'reflection',
  reflection_proposals: 'reflection',
  consensus: 'consensus',
}

/**
 * Which main phases are visible per proposal method.
 * direct_proposal skips the proposal phase entirely.
 */
export const PROPOSAL_METHOD_PHASES = {
  user_driven: ['proposal', 'opinion', 'reflection', 'consensus'],
  admin_provided: ['proposal', 'opinion', 'reflection', 'consensus'],
  direct_proposal: ['opinion', 'reflection', 'consensus'],
}

/**
 * Session stage → voting round type mapping.
 * Used to fetch the correct archived voting round when viewing past stages.
 */
export const STAGE_TO_ROUND_TYPE = {
  proposal_issue: 'issue_selection',
  proposal_qualify: 'issue_selection',
  proposal_stakeholders: 'issue_selection',
  opinion_discussion: 'policy_selection',
  reflection_curation: 'policy_selection',
  reflection_proposals: 'policy_selection',
  consensus: 'policy_selection',
}

/**
 * Ordered list of all session stages.
 */
export const STAGE_ORDER = [
  'proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
  'opinion_discussion', 'reflection_curation', 'reflection_proposals',
  'consensus',
]
export const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]))

/**
 * Which phases are visible per proposal method (with stage detail).
 */
export const PHASES_BY_METHOD = {
  user_driven: [
    { key: 'proposal', stages: ['proposal_issue', 'proposal_qualify', 'proposal_stakeholders'] },
    { key: 'opinion', stages: ['opinion_discussion'] },
    { key: 'reflection', stages: ['reflection_curation', 'reflection_proposals'] },
    { key: 'consensus', stages: ['consensus'] },
  ],
  admin_provided: [
    { key: 'proposal', stages: ['proposal_qualify', 'proposal_stakeholders'] },
    { key: 'opinion', stages: ['opinion_discussion'] },
    { key: 'reflection', stages: ['reflection_curation', 'reflection_proposals'] },
    { key: 'consensus', stages: ['consensus'] },
  ],
  direct_proposal: [
    { key: 'opinion', stages: ['opinion_discussion'] },
    { key: 'reflection', stages: ['reflection_curation', 'reflection_proposals'] },
    { key: 'consensus', stages: ['consensus'] },
  ],
}

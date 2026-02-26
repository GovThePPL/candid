/**
 * Session stage → deliberation phase mapping.
 * Mirrors the backend STAGE_TO_PHASE in constants.py.
 */
export const STAGE_TO_PHASE = {
  proposal_issue: 'proposal',
  proposal_qualify: 'proposal',
  proposal_stakeholders: 'proposal',
  opinion_discussion: 'opinion',
  opinion_curation: 'opinion',
  opinion_proposals: 'opinion',
  reflection: 'reflection',
  consensus: 'consensus',
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
  opinion_curation: 'policy_selection',
  opinion_proposals: 'policy_selection',
  reflection: 'policy_selection',
  consensus: 'policy_selection',
}

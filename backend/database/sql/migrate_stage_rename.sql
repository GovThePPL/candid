-- Migration: Rename opinion_curation → reflection_curation,
--            opinion_proposals → reflection_proposals,
--            remove standalone 'reflection' stage (merged into consensus)
BEGIN;

-- 1. Update session.stage CHECK constraint + data
ALTER TABLE session DROP CONSTRAINT IF EXISTS session_stage_check;
ALTER TABLE session ADD CONSTRAINT session_stage_check
  CHECK (stage IN ('proposal_issue','proposal_qualify','proposal_stakeholders',
                   'opinion_discussion','reflection_curation','reflection_proposals','consensus'));
UPDATE session SET stage = 'reflection_curation' WHERE stage = 'opinion_curation';
UPDATE session SET stage = 'reflection_proposals' WHERE stage = 'opinion_proposals';
UPDATE session SET stage = 'consensus' WHERE stage = 'reflection';

-- 2. Update session_stage_history
UPDATE session_stage_history SET from_stage = 'reflection_curation' WHERE from_stage = 'opinion_curation';
UPDATE session_stage_history SET from_stage = 'reflection_proposals' WHERE from_stage = 'opinion_proposals';
UPDATE session_stage_history SET from_stage = 'consensus' WHERE from_stage = 'reflection';
UPDATE session_stage_history SET to_stage = 'reflection_curation' WHERE to_stage = 'opinion_curation';
UPDATE session_stage_history SET to_stage = 'reflection_proposals' WHERE to_stage = 'opinion_proposals';
UPDATE session_stage_history SET to_stage = 'consensus' WHERE to_stage = 'reflection';

-- 3. Update created_during_stage on position, polis_vote, post, comment (no CHECK constraints)
UPDATE position SET created_during_stage = 'reflection_curation' WHERE created_during_stage = 'opinion_curation';
UPDATE position SET created_during_stage = 'reflection_proposals' WHERE created_during_stage = 'opinion_proposals';
UPDATE position SET created_during_stage = 'consensus' WHERE created_during_stage = 'reflection';

UPDATE post SET created_during_stage = 'reflection_curation' WHERE created_during_stage = 'opinion_curation';
UPDATE post SET created_during_stage = 'reflection_proposals' WHERE created_during_stage = 'opinion_proposals';
UPDATE post SET created_during_stage = 'consensus' WHERE created_during_stage = 'reflection';

UPDATE comment SET created_during_stage = 'reflection_curation' WHERE created_during_stage = 'opinion_curation';
UPDATE comment SET created_during_stage = 'reflection_proposals' WHERE created_during_stage = 'opinion_proposals';
UPDATE comment SET created_during_stage = 'consensus' WHERE created_during_stage = 'reflection';

-- 4. Update pinned_post stage CHECK constraint + data
ALTER TABLE pinned_post DROP CONSTRAINT IF EXISTS pinned_post_stage_check;
UPDATE pinned_post SET stage = 'reflection_curation' WHERE stage = 'opinion_curation';
UPDATE pinned_post SET stage = 'reflection_proposals' WHERE stage = 'opinion_proposals';
UPDATE pinned_post SET stage = 'consensus' WHERE stage = 'reflection';
ALTER TABLE pinned_post ADD CONSTRAINT pinned_post_stage_check
  CHECK (stage IN ('proposal_issue','proposal_qualify','proposal_stakeholders',
                   'opinion_discussion','reflection_curation','reflection_proposals','consensus'));

COMMIT;

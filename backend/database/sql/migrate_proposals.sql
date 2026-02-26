-- Migration: Add proposal support columns
-- Phase F: AI-Guided Proposals

-- Add proposal_status and proposal_metadata to post table
ALTER TABLE post ADD COLUMN IF NOT EXISTS proposal_status VARCHAR(20)
    CHECK (proposal_status IN ('draft', 'finalized'));
ALTER TABLE post ADD COLUMN IF NOT EXISTS proposal_metadata JSONB;

-- Add proposal_method to session table
ALTER TABLE session ADD COLUMN IF NOT EXISTS proposal_method VARCHAR(20) NOT NULL DEFAULT 'user_driven'
    CHECK (proposal_method IN ('user_driven', 'admin_provided'));

-- Update voting_round status constraint to include finalization_open
ALTER TABLE voting_round DROP CONSTRAINT IF EXISTS voting_round_status_check;
ALTER TABLE voting_round ADD CONSTRAINT voting_round_status_check
    CHECK (status IN ('proposals_open', 'finalization_open', 'proposals_closed',
                      'voting_open', 'voting_closed'));

-- Index for filtering proposals by status
CREATE INDEX IF NOT EXISTS idx_post_proposal_status ON post(session_id, proposal_status)
    WHERE proposal_status IS NOT NULL;

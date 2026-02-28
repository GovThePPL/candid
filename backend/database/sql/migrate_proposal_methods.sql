-- Migration: Add 'direct_proposal' to session.proposal_method CHECK constraint
-- Run against an existing database to add the new proposal method without dropping data.

BEGIN;

ALTER TABLE session DROP CONSTRAINT IF EXISTS session_proposal_method_check;
ALTER TABLE session ADD CONSTRAINT session_proposal_method_check
    CHECK (proposal_method IN ('user_driven', 'admin_provided', 'direct_proposal'));

COMMIT;

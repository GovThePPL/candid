-- Migration: Add voting_round_candidate table for ballot qualification
-- Run against an existing database to add support for qualified ballot candidates.

CREATE TABLE IF NOT EXISTS voting_round_candidate (
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    endorsement_count INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (voting_round_id, proposal_post_id)
);

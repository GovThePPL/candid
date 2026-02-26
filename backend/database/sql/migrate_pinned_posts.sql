-- Migration: Add pinned_post table for facilitator/moderator post pinning
-- Run against an existing database to add the pinned_post feature

BEGIN;

CREATE TABLE IF NOT EXISTS pinned_post (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    stage           VARCHAR(30) NOT NULL CHECK (stage IN (
        'proposal_issue','proposal_qualify','proposal_stakeholders',
        'opinion_discussion','opinion_curation','opinion_proposals',
        'reflection','consensus')),
    pinned_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, stage, post_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_post_session_stage ON pinned_post(session_id, stage);

COMMIT;

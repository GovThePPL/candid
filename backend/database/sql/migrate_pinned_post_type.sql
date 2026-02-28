-- Migration: add post_type column to pinned_post for per-section pins
-- Each feed tab (discussion, question, proposal) gets its own set of up to 3 pins per stage.

ALTER TABLE pinned_post ADD COLUMN IF NOT EXISTS post_type VARCHAR(20) NOT NULL DEFAULT 'discussion';

-- Backfill from actual post types
UPDATE pinned_post pp SET post_type = p.post_type FROM post p WHERE pp.post_id = p.id;

-- Drop old constraint/index, add new ones
ALTER TABLE pinned_post DROP CONSTRAINT IF EXISTS pinned_post_session_id_stage_post_id_key;
ALTER TABLE pinned_post ADD CONSTRAINT pinned_post_session_stage_type_post UNIQUE(session_id, stage, post_type, post_id);

DROP INDEX IF EXISTS idx_pinned_post_session_stage;
CREATE INDEX IF NOT EXISTS idx_pinned_post_session_stage_type ON pinned_post(session_id, stage, post_type);

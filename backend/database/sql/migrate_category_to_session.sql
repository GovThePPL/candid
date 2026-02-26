-- Migration: Rename position_category → session and all related references
-- This migration is idempotent-safe where possible (IF EXISTS / IF NOT EXISTS).
-- Run with: PGPASSWORD=postgres psql -h localhost -p 5432 -U user -d candid -f migrate_category_to_session.sql

BEGIN;

-- ============================================================
-- PART 1: Rename position_category → session
-- ============================================================

-- 1a. Drop self-referencing FK and parent column (session table has no parent)
ALTER TABLE position_category DROP CONSTRAINT IF EXISTS position_category_parent_position_category_id_fkey;
DROP INDEX IF EXISTS idx_position_category_parent;
ALTER TABLE position_category DROP COLUMN IF EXISTS parent_position_category_id;

-- 1b. Add new columns to position_category BEFORE renaming
--     (so column additions work even if table is already renamed)
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS location_id UUID;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS stage VARCHAR(30) NOT NULL DEFAULT 'proposal_issue';
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS stage_changed_by UUID;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS facilitator_user_id UUID;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE position_category ADD COLUMN IF NOT EXISTS updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 1c. Rename the table
ALTER TABLE IF EXISTS position_category RENAME TO session;

-- 1d. Add FKs and constraints to session table (now that it's renamed)
-- location_id FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_location_id_fkey') THEN
        ALTER TABLE session ADD CONSTRAINT session_location_id_fkey
            FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE;
    END IF;
END $$;

-- stage CHECK constraint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_stage_check') THEN
        ALTER TABLE session ADD CONSTRAINT session_stage_check
            CHECK (stage IN ('proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
                             'opinion_discussion', 'opinion_curation',
                             'opinion_proposals', 'reflection', 'consensus'));
    END IF;
END $$;

-- status CHECK constraint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_status_check') THEN
        ALTER TABLE session ADD CONSTRAINT session_status_check
            CHECK (status IN ('active', 'archived', 'cancelled'));
    END IF;
END $$;

-- stage_changed_by FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_stage_changed_by_fkey') THEN
        ALTER TABLE session ADD CONSTRAINT session_stage_changed_by_fkey
            FOREIGN KEY (stage_changed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- facilitator_user_id FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_facilitator_user_id_fkey') THEN
        ALTER TABLE session ADD CONSTRAINT session_facilitator_user_id_fkey
            FOREIGN KEY (facilitator_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- created_by FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_created_by_fkey') THEN
        ALTER TABLE session ADD CONSTRAINT session_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Rename PK index
ALTER INDEX IF EXISTS position_category_pkey RENAME TO session_pkey;

-- Add index on location_id
CREATE INDEX IF NOT EXISTS idx_session_location ON session(location_id);

-- ============================================================
-- PART 2: Rename location_category → location_session
-- ============================================================

-- 2a. Rename column position_category_id → session_id
ALTER TABLE location_category RENAME COLUMN position_category_id TO session_id;

-- 2b. Rename table
ALTER TABLE IF EXISTS location_category RENAME TO location_session;

-- 2c. Rename indexes
ALTER INDEX IF EXISTS location_category_pkey RENAME TO location_session_pkey;
ALTER INDEX IF EXISTS location_category_location_id_position_category_id_key RENAME TO location_session_location_id_session_id_key;
ALTER INDEX IF EXISTS idx_location_category_location RENAME TO idx_location_session_location;
ALTER INDEX IF EXISTS idx_location_category_category RENAME TO idx_location_session_session;

-- 2d. Rename constraints
ALTER TABLE location_session RENAME CONSTRAINT location_category_location_id_fkey TO location_session_location_id_fkey;
ALTER TABLE location_session RENAME CONSTRAINT location_category_position_category_id_fkey TO location_session_session_id_fkey;

-- ============================================================
-- PART 3: Rename user_position_categories → user_session_preferences
-- ============================================================

-- 3a. Rename column position_category_id → session_id
ALTER TABLE user_position_categories RENAME COLUMN position_category_id TO session_id;

-- 3b. Rename table
ALTER TABLE IF EXISTS user_position_categories RENAME TO user_session_preferences;

-- 3c. Rename indexes
ALTER INDEX IF EXISTS user_position_categories_pkey RENAME TO user_session_preferences_pkey;
ALTER INDEX IF EXISTS user_position_categories_user_id_position_category_id_key RENAME TO user_session_preferences_user_id_session_id_key;
ALTER INDEX IF EXISTS idx_user_position_categories_category RENAME TO idx_user_session_preferences_session;

-- 3d. Rename constraints
ALTER TABLE user_session_preferences RENAME CONSTRAINT user_position_categories_user_id_fkey TO user_session_preferences_user_id_fkey;
ALTER TABLE user_session_preferences RENAME CONSTRAINT user_position_categories_position_category_id_fkey TO user_session_preferences_session_id_fkey;

-- ============================================================
-- PART 4: Rename category_id → session_id in position table
-- ============================================================

ALTER TABLE position RENAME COLUMN category_id TO session_id;

-- Rename FK constraint
ALTER TABLE position RENAME CONSTRAINT position_category_id_fkey TO position_session_id_fkey;

-- Rename index
ALTER INDEX IF EXISTS idx_position_category_id RENAME TO idx_position_session_id;

-- Add created_during_stage column
ALTER TABLE position ADD COLUMN IF NOT EXISTS created_during_stage VARCHAR(30);

-- ============================================================
-- PART 5: Rename category_id → session_id in post table
-- ============================================================

ALTER TABLE post RENAME COLUMN category_id TO session_id;

-- Rename FK constraint
ALTER TABLE post RENAME CONSTRAINT post_category_id_fkey TO post_session_id_fkey;

-- Rename indexes
ALTER INDEX IF EXISTS idx_post_category RENAME TO idx_post_session;
ALTER INDEX IF EXISTS idx_post_category_id_fk RENAME TO idx_post_session_id_fk;

-- Add created_during_stage column
ALTER TABLE post ADD COLUMN IF NOT EXISTS created_during_stage VARCHAR(30);

-- Update post_type CHECK constraint to add 'proposal'
ALTER TABLE post DROP CONSTRAINT IF EXISTS post_post_type_check;
ALTER TABLE post ADD CONSTRAINT post_post_type_check
    CHECK (post_type IN ('discussion', 'question', 'proposal'));

-- ============================================================
-- PART 6: Rename position_category_id → session_id in survey table
-- ============================================================

ALTER TABLE survey RENAME COLUMN position_category_id TO session_id;

-- Rename FK constraint
ALTER TABLE survey RENAME CONSTRAINT survey_position_category_id_fkey TO survey_session_id_fkey;

-- Rename index
ALTER INDEX IF EXISTS idx_survey_position_category_id RENAME TO idx_survey_session_id;

-- ============================================================
-- PART 7: Rename position_category_id → session_id in rule table
-- ============================================================

ALTER TABLE rule RENAME COLUMN position_category_id TO session_id;

-- Rename FK constraint
ALTER TABLE rule RENAME CONSTRAINT rule_position_category_id_fkey TO rule_session_id_fkey;

-- Rename index
ALTER INDEX IF EXISTS idx_rule_category_id RENAME TO idx_rule_session_id;

-- ============================================================
-- PART 8: Rename category_id → session_id in polis_conversation table
-- ============================================================

ALTER TABLE polis_conversation RENAME COLUMN category_id TO session_id;

-- Rename FK constraint
ALTER TABLE polis_conversation RENAME CONSTRAINT polis_conversation_category_id_fkey TO polis_conversation_session_id_fkey;

-- Rename indexes
ALTER INDEX IF EXISTS polis_conversation_location_id_category_id_active_from_key RENAME TO polis_conversation_location_id_session_id_active_from_key;
ALTER INDEX IF EXISTS idx_polis_conversation_category_id RENAME TO idx_polis_conversation_session_id;

-- Update conversation_type CHECK constraint: 'category' → 'session'
ALTER TABLE polis_conversation DROP CONSTRAINT IF EXISTS polis_conversation_conversation_type_check;
ALTER TABLE polis_conversation ADD CONSTRAINT polis_conversation_conversation_type_check
    CHECK (conversation_type IN ('session', 'location_all'));

-- Update existing data
UPDATE polis_conversation SET conversation_type = 'session' WHERE conversation_type = 'category';

-- Drop and recreate the partial unique index (it references old column name in WHERE clause)
DROP INDEX IF EXISTS uq_polis_conversation_location_all;
CREATE UNIQUE INDEX IF NOT EXISTS uq_polis_conversation_location_all
    ON polis_conversation (location_id, active_from)
    WHERE session_id IS NULL;

-- Also recreate the active index since column name changed
DROP INDEX IF EXISTS idx_polis_conversation_active;
CREATE INDEX IF NOT EXISTS idx_polis_conversation_active
    ON polis_conversation(location_id, session_id, active_from, active_until) WHERE status = 'active';

-- ============================================================
-- PART 9: Rename position_category_id → session_id in user_role table
-- ============================================================

ALTER TABLE user_role RENAME COLUMN position_category_id TO session_id;

-- Rename FK constraint
ALTER TABLE user_role RENAME CONSTRAINT user_role_position_category_id_fkey TO user_role_session_id_fkey;

-- Drop old check constraint and add new one
ALTER TABLE user_role DROP CONSTRAINT IF EXISTS chk_role_scope;
ALTER TABLE user_role ADD CONSTRAINT chk_role_scope CHECK (
    CASE
        -- Hierarchical roles: location required, no session
        WHEN role IN ('admin','moderator') THEN
            location_id IS NOT NULL AND session_id IS NULL
        -- Session-scoped roles: location required, session optional
        WHEN role IN ('facilitator','assistant_moderator','expert','liaison') THEN
            location_id IS NOT NULL
    END
);

-- Drop old unique indexes and create new ones
DROP INDEX IF EXISTS idx_ur_with_cat;
DROP INDEX IF EXISTS idx_ur_no_cat;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ur_with_session ON user_role(user_id, role, location_id, session_id)
    WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ur_no_session ON user_role(user_id, role, location_id)
    WHERE session_id IS NULL;

-- Rename regular indexes
ALTER INDEX IF EXISTS idx_user_role_category RENAME TO idx_user_role_session;

-- ============================================================
-- PART 10: Rename position_category_id → session_id in role_change_request table
-- ============================================================

ALTER TABLE role_change_request RENAME COLUMN position_category_id TO session_id;

-- Rename FK constraint
ALTER TABLE role_change_request RENAME CONSTRAINT role_change_request_position_category_id_fkey TO role_change_request_session_id_fkey;

-- Rename index
ALTER INDEX IF EXISTS idx_role_change_request_position_category_id RENAME TO idx_role_change_request_session_id;

-- ============================================================
-- PART 11: Rename category_id → session_id in user_ideological_coords table
-- ============================================================

ALTER TABLE user_ideological_coords RENAME COLUMN category_id TO session_id;

-- Rename FK constraint
ALTER TABLE user_ideological_coords RENAME CONSTRAINT user_ideological_coords_category_id_fkey TO user_ideological_coords_session_id_fkey;

-- Rename index
ALTER INDEX IF EXISTS idx_user_ideological_coords_category_id RENAME TO idx_user_ideological_coords_session_id;

-- ============================================================
-- PART 12: Rename category_id → session_id in mf_training_log table
-- ============================================================

ALTER TABLE mf_training_log RENAME COLUMN category_id TO session_id;

-- Rename FK constraint
ALTER TABLE mf_training_log RENAME CONSTRAINT mf_training_log_category_id_fkey TO mf_training_log_session_id_fkey;

-- ============================================================
-- PART 13: Add created_during_stage column to comment and chat_request tables
-- ============================================================

ALTER TABLE comment ADD COLUMN IF NOT EXISTS created_during_stage VARCHAR(30);
ALTER TABLE chat_request ADD COLUMN IF NOT EXISTS created_during_stage VARCHAR(30);

-- ============================================================
-- PART 14: Update scope_type values in glossary_term_scope and wiki_page_scope
-- ============================================================

-- Update existing data: 'category' → 'session'
UPDATE glossary_term_scope SET scope_type = 'session' WHERE scope_type = 'category';
UPDATE wiki_page_scope SET scope_type = 'session' WHERE scope_type = 'category';

-- Drop old CHECK constraints and add new ones
ALTER TABLE glossary_term_scope DROP CONSTRAINT IF EXISTS glossary_term_scope_scope_type_check;
ALTER TABLE glossary_term_scope ADD CONSTRAINT glossary_term_scope_scope_type_check
    CHECK (scope_type IN ('location', 'session'));

ALTER TABLE wiki_page_scope DROP CONSTRAINT IF EXISTS wiki_page_scope_scope_type_check;
ALTER TABLE wiki_page_scope ADD CONSTRAINT wiki_page_scope_scope_type_check
    CHECK (scope_type IN ('location', 'session'));

-- ============================================================
-- PART 15: Create new tables
-- ============================================================

-- Session stage history (audit trail for stage transitions)
CREATE TABLE IF NOT EXISTS session_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    from_stage VARCHAR(30),
    to_stage VARCHAR(30) NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Curated comment (Opinion-Curation sub-stage onward)
CREATE TABLE IF NOT EXISTS curated_comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
    curated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    curation_reason TEXT,
    group_id INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, comment_id)
);

-- Ranked-Choice Voting: voting rounds for proposal selection
CREATE TABLE IF NOT EXISTS voting_round (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    round_type VARCHAR(30) NOT NULL
        CHECK (round_type IN ('issue_selection', 'policy_selection')),
    status VARCHAR(20) NOT NULL DEFAULT 'proposals_open'
        CHECK (status IN ('proposals_open', 'proposals_closed',
                          'voting_open', 'voting_closed')),
    ballot_size INTEGER NOT NULL DEFAULT 7,
    winner_count INTEGER NOT NULL DEFAULT 1,
    opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, round_type)
);

-- Proposal endorsements (max 3 per user per round, replaces upvote/downvote on proposals)
CREATE TABLE IF NOT EXISTS proposal_endorsement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voting_round_id, proposal_post_id, user_id)
);

-- Individual RCV ballots (one per user per round)
CREATE TABLE IF NOT EXISTS rcv_ballot (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voting_round_id, voter_user_id)
);

-- Rankings within a ballot (rank 1 = most preferred)
CREATE TABLE IF NOT EXISTS rcv_ranking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ballot_id UUID NOT NULL REFERENCES rcv_ballot(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    UNIQUE(ballot_id, proposal_post_id),
    UNIQUE(ballot_id, rank)
);

-- Reference drawer clips (session-scoped, per-user)
CREATE TABLE IF NOT EXISTS reference_clip (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL
        CHECK (source_type IN ('post', 'comment', 'wiki', 'position', 'stat', 'closure')),
    source_id TEXT NOT NULL,
    source_version_id UUID,
    excerpt TEXT NOT NULL,
    full_content TEXT,
    metadata JSONB,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_reference_clip_user_session ON reference_clip(user_id, session_id);

-- Consensus document (Consensus stage)
CREATE TABLE IF NOT EXISTS consensus_document (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'superseded')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, version)
);

COMMIT;

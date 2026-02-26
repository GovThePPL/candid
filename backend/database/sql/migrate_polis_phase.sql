-- Migration: Add phase column to polis_conversation
-- Separates Polis conversations by deliberation phase (proposal vs opinion).
-- Phase is NULL for location_all conversations (they aggregate everything).

BEGIN;

-- Add phase column
ALTER TABLE polis_conversation ADD COLUMN IF NOT EXISTS phase VARCHAR(20)
    CHECK (phase IN ('proposal', 'opinion'));

-- Drop old unique constraint (location_id, session_id, active_from)
ALTER TABLE polis_conversation DROP CONSTRAINT IF EXISTS polis_conversation_location_id_session_id_active_from_key;

-- Add new unique constraint that includes phase
-- This allows two session conversations per (location, session, month): one per phase
ALTER TABLE polis_conversation ADD CONSTRAINT polis_conversation_location_id_session_id_phase_active_from_key
    UNIQUE(location_id, session_id, phase, active_from);

-- Backfill existing session conversations as 'proposal' phase
-- (they were created before phase separation, so they contain proposal-phase data)
UPDATE polis_conversation
SET phase = 'proposal'
WHERE conversation_type = 'session' AND phase IS NULL;

COMMIT;

-- Migration: Add phase column to survey table for phase-scoped label surveys
-- Proposal and opinion phases use separate Polis conversations with different
-- group compositions, so label surveys should be scoped per phase.

ALTER TABLE survey ADD COLUMN IF NOT EXISTS phase VARCHAR(20) CHECK (phase IN ('proposal', 'opinion'));

COMMENT ON COLUMN survey.phase IS 'Session phase this label survey applies to (proposal or opinion). NULL means legacy/unscoped.';

CREATE INDEX IF NOT EXISTS idx_survey_session_phase_labeling
    ON survey (session_id, phase) WHERE is_group_labeling = true AND status != 'deleted';

-- Migration: Add pairwise comparison surveys for group labeling
-- Purpose: Enable pairwise comparison surveys to generate custom labels for opinion groups

-- Add survey_type to distinguish pairwise from standard surveys
ALTER TABLE survey ADD COLUMN IF NOT EXISTS survey_type VARCHAR(50) NOT NULL DEFAULT 'standard'
    CHECK (survey_type IN ('standard', 'pairwise'));

-- Link survey to Polis conversation for group-specific aggregation
ALTER TABLE survey ADD COLUMN IF NOT EXISTS polis_conversation_id VARCHAR(255);

-- Comparison question template for pairwise surveys
ALTER TABLE survey ADD COLUMN IF NOT EXISTS comparison_question TEXT;

-- Index for finding pairwise surveys linked to a conversation
CREATE INDEX IF NOT EXISTS idx_survey_polis_conversation ON survey(polis_conversation_id)
    WHERE polis_conversation_id IS NOT NULL;

-- Items in the comparison pool for a pairwise survey
CREATE TABLE IF NOT EXISTS pairwise_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    item_text VARCHAR(255) NOT NULL,
    item_order INTEGER NOT NULL,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pairwise_item_survey ON pairwise_item(survey_id);

-- Individual pairwise comparison responses (which item won)
CREATE TABLE IF NOT EXISTS pairwise_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    winner_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    loser_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Prevent same user from comparing same pair twice (order-independent)
    CONSTRAINT unique_pairwise_response UNIQUE(survey_id, user_id, winner_item_id, loser_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pairwise_response_survey ON pairwise_response(survey_id);
CREATE INDEX IF NOT EXISTS idx_pairwise_response_user ON pairwise_response(user_id);
CREATE INDEX IF NOT EXISTS idx_pairwise_response_winner ON pairwise_response(winner_item_id);

-- Add comments for documentation
COMMENT ON COLUMN survey.survey_type IS 'Type of survey: standard (multiple choice) or pairwise (comparison)';
COMMENT ON COLUMN survey.polis_conversation_id IS 'Link to Polis conversation for group-specific aggregation';
COMMENT ON COLUMN survey.comparison_question IS 'Question template for pairwise comparisons (e.g., "Which better describes this group?")';
COMMENT ON TABLE pairwise_item IS 'Items in the comparison pool for pairwise surveys';
COMMENT ON TABLE pairwise_response IS 'User responses to pairwise comparisons (which item won)';

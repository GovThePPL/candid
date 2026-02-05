-- Add location_id to survey table for direct location linking
-- Surveys should be linked to location and category directly

ALTER TABLE survey ADD COLUMN location_id UUID REFERENCES location(id) ON DELETE SET NULL;

CREATE INDEX idx_survey_location ON survey(location_id) WHERE location_id IS NOT NULL;

-- Update existing pairwise surveys to have location and category set
-- (These would normally be set when creating the survey)

-- Migration: Convert chat_log.log column from VARCHAR(50) to JSONB
-- This allows storing the full chat export as a JSON blob when chat ends

-- Step 1: Allow NULL values temporarily during migration
ALTER TABLE chat_log ALTER COLUMN log DROP NOT NULL;

-- Step 2: Convert column type to JSONB
-- Existing data will be set to NULL (VARCHAR(50) was just a placeholder)
ALTER TABLE chat_log ALTER COLUMN log TYPE JSONB USING NULL;

-- Add comment explaining the column structure
COMMENT ON COLUMN chat_log.log IS 'JSON blob containing chat export: {"messages": [...], "agreed_positions": [...], "agreed_closure": "..." or null, "export_time": "ISO8601"}';

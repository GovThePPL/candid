-- Migration: Convert chat_log.log column from VARCHAR(50) to JSONB
-- This allows storing the full chat export as a JSON blob when chat ends
-- Note: Schema already defines log as JSONB, so this migration is a no-op
-- but kept for backwards compatibility with existing deployments

-- Add comment explaining the column structure
COMMENT ON COLUMN chat_log.log IS 'JSON blob containing chat export: {"messages": [...], "agreed_positions": [...], "agreed_closure": "..." or null, "export_time": "ISO8601"}';

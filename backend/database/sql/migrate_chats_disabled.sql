-- Migration: Add chats_disabled to user_position
-- When true, the user_position is excluded from chat availability
-- (used when a position creator disagrees/passes on their own position)
ALTER TABLE user_position ADD COLUMN IF NOT EXISTS chats_disabled BOOLEAN DEFAULT FALSE;

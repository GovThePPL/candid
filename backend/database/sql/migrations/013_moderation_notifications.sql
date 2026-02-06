-- Add notified_removed column to user_position for tracking removal notifications
ALTER TABLE user_position ADD COLUMN IF NOT EXISTS notified_removed BOOLEAN DEFAULT FALSE;

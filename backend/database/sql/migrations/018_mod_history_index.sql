-- Add index on mod_action_target.user_id for efficient moderation history lookups
CREATE INDEX IF NOT EXISTS idx_mod_action_target_user_id ON mod_action_target(user_id);

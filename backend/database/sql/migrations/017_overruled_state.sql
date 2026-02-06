-- Add 'overruled' to appeal_state CHECK constraint
ALTER TABLE mod_action_appeal DROP CONSTRAINT IF EXISTS mod_action_appeal_appeal_state_check;
ALTER TABLE mod_action_appeal ADD CONSTRAINT mod_action_appeal_appeal_state_check
    CHECK (appeal_state IN ('pending', 'approved', 'denied', 'escalated', 'modified', 'overruled'));

-- Track which moderators have dismissed admin response notifications
CREATE TABLE mod_appeal_response_notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_appeal_id UUID NOT NULL REFERENCES mod_action_appeal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed BOOLEAN DEFAULT FALSE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mod_action_appeal_id, user_id)
);

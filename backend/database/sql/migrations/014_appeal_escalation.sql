-- Add 'escalated' to mod_action_appeal.appeal_state CHECK constraint
ALTER TABLE mod_action_appeal DROP CONSTRAINT IF EXISTS mod_action_appeal_appeal_state_check;
ALTER TABLE mod_action_appeal ADD CONSTRAINT mod_action_appeal_appeal_state_check
    CHECK (appeal_state IN ('pending', 'approved', 'denied', 'escalated'));

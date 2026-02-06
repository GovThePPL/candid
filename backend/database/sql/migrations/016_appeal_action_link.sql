-- Link appeals to the replacement mod_action created during a 'modify' response
ALTER TABLE mod_action_appeal
    ADD COLUMN modified_mod_action_id UUID REFERENCES mod_action(id) ON DELETE SET NULL;

CREATE INDEX idx_mod_action_appeal_modified_action ON mod_action_appeal(modified_mod_action_id);

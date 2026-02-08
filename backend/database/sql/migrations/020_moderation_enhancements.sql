-- Migration 020: Moderation queue enhancements
-- Adds queue claiming, role-based routing support, default actions/sentencing guidelines on rules,
-- and reporter/reported user classes for chat reports.

-- 1. Queue claiming: add claim columns to report table
ALTER TABLE report ADD COLUMN claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE report ADD COLUMN claimed_at TIMESTAMPTZ;

-- Also for appeals
ALTER TABLE mod_action_appeal ADD COLUMN claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE mod_action_appeal ADD COLUMN claimed_at TIMESTAMPTZ;

-- 2. Default actions and sentencing guidelines on rules
ALTER TABLE rule ADD COLUMN severity INTEGER CHECK (severity BETWEEN 1 AND 5);
ALTER TABLE rule ADD COLUMN default_actions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE rule ADD COLUMN sentencing_guidelines TEXT;

-- 3. Update existing rules with defaults
UPDATE rule SET severity = 5, sentencing_guidelines = 'Immediate ban for threats or incitement. Temporary ban (7-30 days) for hostile language.',
  default_actions = '[{"userClass": "submitter", "action": "temporary_ban", "duration": 7}]'::jsonb
  WHERE title = 'Violence or Hate Speech';

UPDATE rule SET severity = 4, sentencing_guidelines = 'Remove content. Warning for first offense, temporary ban (3-7 days) for repeat.',
  default_actions = '[{"userClass": "submitter", "action": "removed"}]'::jsonb
  WHERE title = 'Sexual or Obscene Content';

UPDATE rule SET severity = 2, sentencing_guidelines = 'Remove content. Warning for first offense, temporary ban (1-3 days) for repeat.',
  default_actions = '[{"userClass": "submitter", "action": "warning"}]'::jsonb
  WHERE title = 'Spam or Self-Promotion';

UPDATE rule SET severity = 1, sentencing_guidelines = 'Remove content. No user action unless repeated violations.',
  default_actions = '[{"userClass": "submitter", "action": "removed"}]'::jsonb
  WHERE title = 'Not a Normative Political Statement';

-- 4. Add reporter/reported to mod_action_class CHECK constraint
ALTER TABLE mod_action_class DROP CONSTRAINT IF EXISTS mod_action_class_class_check;
ALTER TABLE mod_action_class ADD CONSTRAINT mod_action_class_class_check
  CHECK (class IN ('submitter', 'active_adopter', 'passive_adopter', 'reporter', 'reported'));

-- 5. Indexes for claiming
CREATE INDEX idx_report_claimed_by ON report(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;
CREATE INDEX idx_appeal_claimed_by ON mod_action_appeal(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;

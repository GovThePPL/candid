-- Avatar NSFW Queue: deferred NSFW checking for avatar uploads.
-- The avatar is saved immediately (fast resize only) and queued for
-- async NSFW verification by the background worker.

BEGIN;

-- Queue table for pending NSFW checks
CREATE TABLE IF NOT EXISTS avatar_nsfw_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_base64 TEXT NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avatar_nsfw_queue_created
    ON avatar_nsfw_queue (created_time);

-- Add avatar_rejected to notification type CHECK constraints
ALTER TABLE notification_inbox
    DROP CONSTRAINT IF EXISTS notification_inbox_notification_type_check;
ALTER TABLE notification_inbox
    ADD CONSTRAINT notification_inbox_notification_type_check
    CHECK (notification_type IN (
        'comment_reply', 'post_comment', 'chat_request', 'role_change',
        'rule_change', 'admin_action', 'moderation', 'bridging_kudos',
        'wiki_suggestion', 'mention', 'stage_advance', 'avatar_rejected'
    ));

ALTER TABLE notification_type_preferences
    DROP CONSTRAINT IF EXISTS notification_type_preferences_notification_type_check;
ALTER TABLE notification_type_preferences
    ADD CONSTRAINT notification_type_preferences_notification_type_check
    CHECK (notification_type IN (
        'comment_reply', 'post_comment', 'chat_request', 'role_change',
        'rule_change', 'admin_action', 'moderation', 'bridging_kudos',
        'wiki_suggestion', 'mention', 'stage_advance', 'avatar_rejected'
    ));

COMMIT;

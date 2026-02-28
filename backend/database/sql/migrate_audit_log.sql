-- Migration: Add audit_log table for admin/moderator action tracking
-- Run once against an existing database.

CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    target_type     VARCHAR(50) NOT NULL,
    target_id       UUID,
    location_id     UUID REFERENCES location(id),
    session_id      UUID REFERENCES session(id),
    details         JSONB,
    created_time    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_time DESC);

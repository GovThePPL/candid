-- Migration: Add Polis integration tables for syncing positions and votes
-- This enables time-windowed conversations with dual sync (category+location and location-only)

-- Map category+location OR location-only to Polis conversations (time-windowed)
CREATE TABLE polis_conversation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES location(id),
    category_id UUID REFERENCES position_category(id),  -- NULL = location-only "All Topics" conversation
    polis_conversation_id VARCHAR(255) NOT NULL UNIQUE,
    conversation_type VARCHAR(50) NOT NULL CHECK (conversation_type IN ('category', 'location_all')),
    active_from DATE NOT NULL,              -- Start of window (1st of month)
    active_until DATE NOT NULL,             -- End of window (6 months later)
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    UNIQUE(location_id, category_id, active_from)  -- One conversation per location+category+month
);

CREATE INDEX idx_polis_conversation_active
ON polis_conversation(location_id, category_id, active_from, active_until)
WHERE status = 'active';

CREATE INDEX idx_polis_conversation_lookup
ON polis_conversation(polis_conversation_id);

-- Map positions to Polis comments (one position -> multiple comments across conversations)
CREATE TABLE polis_comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    polis_comment_tid INTEGER NOT NULL,
    sync_status VARCHAR(50) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position_id, polis_conversation_id)  -- One comment per position per conversation
);

CREATE INDEX idx_polis_comment_position ON polis_comment(position_id);
CREATE INDEX idx_polis_comment_conversation ON polis_comment(polis_conversation_id);

-- Map users to Polis participants (per conversation)
-- Stores XID JWT tokens for each user's participation in a conversation
CREATE TABLE polis_participant (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    polis_xid VARCHAR(255) NOT NULL,         -- External ID: candid:{user_uuid}
    polis_pid INTEGER,                        -- Polis participant ID, set after initialization
    polis_jwt_token TEXT,                     -- XID JWT token issued by Polis for this user+conversation
    token_issued_at TIMESTAMPTZ,              -- When the token was issued
    token_expires_at TIMESTAMPTZ,             -- When the token expires (Polis tokens last 1 year)
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, polis_conversation_id)
);

CREATE INDEX idx_polis_participant_user ON polis_participant(user_id);
CREATE INDEX idx_polis_participant_conversation ON polis_participant(polis_conversation_id);
CREATE INDEX idx_polis_participant_xid ON polis_participant(polis_xid);
CREATE INDEX idx_polis_participant_token_expiry ON polis_participant(token_expires_at) WHERE polis_jwt_token IS NOT NULL;

-- Queue for async sync operations (positions and votes)
CREATE TABLE polis_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('position', 'vote', 'conversation')),
    payload JSONB NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    error_message TEXT,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_polis_sync_queue_status ON polis_sync_queue(status, next_retry_time)
WHERE status IN ('pending', 'partial');

CREATE INDEX idx_polis_sync_queue_created ON polis_sync_queue(created_time);

-- Add comment explaining the table purposes
COMMENT ON TABLE polis_conversation IS 'Maps Candid location+category combinations to time-windowed Polis conversations';
COMMENT ON TABLE polis_comment IS 'Maps Candid positions to Polis comments (one position can exist in multiple conversations)';
COMMENT ON TABLE polis_participant IS 'Maps Candid users to Polis participants using XID system';
COMMENT ON TABLE polis_sync_queue IS 'Async queue for syncing positions and votes to Polis';

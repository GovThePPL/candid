-- Migration: Add chatting list feature
-- This allows users to save positions they want to continue chatting about

-- Table to track positions users want to continue chatting about
-- These are OTHER users' positions that this user has swiped up on
CREATE TABLE user_chatting_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    added_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_chat_time TIMESTAMPTZ,
    chat_count INTEGER DEFAULT 0,
    UNIQUE(user_id, position_id)
);

-- Index for efficient lookups by user
CREATE INDEX idx_user_chatting_list_user_id ON user_chatting_list(user_id);

-- Index for finding active chatting list items for a user
CREATE INDEX idx_user_chatting_list_active ON user_chatting_list(user_id, is_active)
    WHERE is_active = true;

-- Track if user has seen the chatting list explanation
ALTER TABLE users ADD COLUMN seen_chatting_list_explanation BOOLEAN DEFAULT false;

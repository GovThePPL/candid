-- Migration: Add avatar_url column to users table
-- Stores URL of user-selected avatar from pre-defined SFW image set

ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
COMMENT ON COLUMN users.avatar_url IS 'URL of user-selected avatar from pre-defined SFW image set';

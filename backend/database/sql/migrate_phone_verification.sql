-- Migration: Add phone verification and email normalization columns
-- Run against an existing database to add phone/email anti-abuse columns.

BEGIN;

-- Phone verification columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- Normalized email for duplicate detection (strips dots/plus aliases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_email VARCHAR(255);

-- Unique indexes (partial — only on non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone
    ON users (phone_number) WHERE phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_norm_email
    ON users (normalized_email) WHERE normalized_email IS NOT NULL;

-- Backfill normalized_email for existing rows (simple lowercase for now;
-- full normalization happens at registration time going forward)
UPDATE users SET normalized_email = LOWER(email)
WHERE email IS NOT NULL AND normalized_email IS NULL;

COMMIT;

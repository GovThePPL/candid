-- Update avatar_url to TEXT type for base64 data URIs and add icon column
ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_icon_url TEXT;

-- Clear old CDN-based avatar URLs (DiceBear/Multiavatar)
UPDATE users SET avatar_url = NULL, avatar_icon_url = NULL
WHERE avatar_url IS NOT NULL AND avatar_url LIKE 'https://%';

COMMENT ON COLUMN users.avatar_url IS 'Full size avatar image (256x256) as base64 data URI';
COMMENT ON COLUMN users.avatar_icon_url IS 'Icon size avatar image (64x64) as base64 data URI';

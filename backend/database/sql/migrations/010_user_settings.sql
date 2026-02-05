-- Migration: Add likelihood settings to users table
-- These control how often users receive chat requests and chatting list items

ALTER TABLE users
  ADD COLUMN chat_request_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chat_request_likelihood BETWEEN 1 AND 5),
  ADD COLUMN chatting_list_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chatting_list_likelihood BETWEEN 1 AND 5);

COMMENT ON COLUMN users.chat_request_likelihood IS '1=rarely, 2=less, 3=normal, 4=more, 5=often';
COMMENT ON COLUMN users.chatting_list_likelihood IS '1=rarely, 2=less, 3=normal, 4=more, 5=often';

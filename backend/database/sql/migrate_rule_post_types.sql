-- Migration: Add applicable_post_types column to rule table
-- This allows rules to be scoped to specific post types (discussion, question, proposal)
-- NULL means the rule applies to all post types.

ALTER TABLE rule ADD COLUMN IF NOT EXISTS applicable_post_types TEXT[];

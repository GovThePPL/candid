-- Migration: Add results_json column to voting_round for cached tally results
-- Run against an existing database to add support for storing election results.

ALTER TABLE voting_round ADD COLUMN IF NOT EXISTS results_json JSONB;

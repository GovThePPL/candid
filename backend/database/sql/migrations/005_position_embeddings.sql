-- Migration: Add pgvector extension and embedding column to position table
-- Purpose: Enable semantic similarity search for positions

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to position table
-- Using 384 dimensions for all-MiniLM-L6-v2 model
ALTER TABLE position ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Create IVFFlat index for approximate nearest neighbor search
-- Using cosine similarity (vector_cosine_ops)
-- Lists parameter tuned for expected number of positions (100 is good for up to ~100k rows)
CREATE INDEX IF NOT EXISTS idx_position_embedding
ON position USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add comment for documentation
COMMENT ON COLUMN position.embedding IS 'Semantic embedding vector (384 dimensions from all-MiniLM-L6-v2) for similarity search';

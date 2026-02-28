# Scripts

Development and operations scripts for data seeding, backfilling, and maintenance.

## Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `seed_dev_data.py` | Generate rich development data: 150 users across 10 belief systems, ~240 positions, ~500 posts, ~2500 comments, chats, moderation scenarios, demographics, surveys | Runs automatically via `./dev.sh`; or `docker compose exec api python3 /app/backend/scripts/seed_dev_data.py` |
| `backfill_embeddings.py` | Generate position embeddings for all positions missing them | Runs automatically after seeding via `./dev.sh` |
| `backfill_polis_positions.py` | Sync positions and votes to Pol.is conversations | Runs automatically after seeding via `./dev.sh` (if Polis is available) |
| `generate_polis_test_data.py` | Generate test data specifically for Pol.is integration testing | Manual: `docker compose exec api python3 /app/backend/scripts/generate_polis_test_data.py` |
| `seed_large_thread.py` | Seed ~200 comments with depth 7+ thread for pagination, threading, and bridging demos | Manual: `docker compose exec api python3 /app/backend/scripts/seed_large_thread.py` |

## Execution Context

All scripts run inside the `api` Docker container (they need access to the database and other services). Use `docker compose exec api python3 /app/backend/scripts/<script>.py` to run them manually.

The `./dev.sh` script handles the typical seeding workflow automatically: seed data -> backfill embeddings -> backfill Polis.

## Seed Data Architecture

The `seed_dev_data.py` script loads content from JSON files in `seed_data/sessions/`, one per session. Each JSON file contains:

- **Anchor content**: Hand-written posts, comments, and positions that provide narrative quality
- **Generation directives**: Counts and types for template-generated content
- **Topic vocabulary**: Session-specific words for template filling
- **Surveys**: Session-scoped survey definitions

The `seed_data/` package contains:

| File | Purpose |
|------|---------|
| `__init__.py` | Load and expand session JSON files |
| `content_generator.py` | Template engine: expands generation directives into posts, comments, positions |
| `templates/post_templates.py` | ~60 post title/body templates by stage × post_type |
| `templates/comment_templates.py` | ~150 comment templates by belief_system × stance |
| `templates/position_templates.py` | Vote patterns and statement templates |
| `sessions/*.json` | 17 session files with anchors + generation config |

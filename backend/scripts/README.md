# Scripts

Development and operations scripts for data seeding, backfilling, and maintenance.

## Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `seed_dev_data.py` | Generate rich development data: 50 users, ~36 positions with coherent voting, chats, moderation scenarios, demographics | Runs automatically via `./dev.sh`; or `docker compose exec api python3 /app/backend/scripts/seed_dev_data.py` |
| `backfill_embeddings.py` | Generate position embeddings for all positions missing them | Runs automatically after seeding via `./dev.sh` |
| `backfill_polis_positions.py` | Sync positions and votes to Pol.is conversations | Runs automatically after seeding via `./dev.sh` (if Polis is available) |
| `generate_polis_test_data.py` | Generate test data specifically for Pol.is integration testing | Manual: `docker compose exec api python3 /app/backend/scripts/generate_polis_test_data.py` |
| `seed_large_thread.py` | Seed ~200 comments with depth 7+ thread for pagination, threading, and bridging demos | Manual: `docker compose exec api python3 /app/backend/scripts/seed_large_thread.py` |

## Execution Context

All scripts run inside the `api` Docker container (they need access to the database and other services). Use `docker compose exec api python3 /app/backend/scripts/<script>.py` to run them manually.

The `./dev.sh` script handles the typical seeding workflow automatically: seed data -> backfill embeddings -> backfill Polis.

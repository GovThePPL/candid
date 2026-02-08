# Candid

Candid is a chat platform for peaceful and productive discussion of issues of public concern. Users post position statements, swipe to agree/disagree, request one-on-one chats to discuss disagreements, and view group opinion analytics powered by Pol.is.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Flask API  │────▶│  PostgreSQL  │
│  Expo / RN   │     │   (Gunicorn) │     │   + pgvector │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │            ┌──────┴──────┐
       │            │  NLP Service │
       │            │ (embeddings) │
       │            └─────────────┘
       │
       ├───────────▶┌─────────────┐     ┌─────────────┐
       │            │ Chat Server  │────▶│    Redis     │
       │            │  (WebSocket) │     │  (pub/sub)   │
       │            └─────────────┘     └─────────────┘
       │
       └───────────▶┌─────────────┐
                    │   Pol.is     │
                    │  (Sysbox)    │
                    └─────────────┘
```

Six Docker services orchestrated via `docker-compose.yaml`:

| Service | Port | Description |
|---------|------|-------------|
| api     | 8000 | Flask REST API (OpenAPI-first, Gunicorn) |
| chat    | 8002 | WebSocket chat server (aiohttp, Redis pub/sub) |
| db      | 5432 | PostgreSQL 17 with pgvector |
| redis   | 6379 | Message broker and presence tracking |
| nlp     | 5001 | Sentence embeddings and NSFW detection |
| polis   | 8080 | Pol.is opinion analytics (Docker-in-Docker via Sysbox) |

The project follows **OpenAPI-first development** -- the spec at `docs/api.yaml` is the source of truth for both the backend (Python Flask) and frontend (generated JS client).

## Prerequisites

- **Docker** (latest)
- **Sysbox runtime v0.6.7** for Pol.is Docker-in-Docker
- **Node.js / npm** for frontend development
- **openapi-generator-cli, pipreqs** for local backend builds (optional)

### Installing Sysbox

```bash
wget https://downloads.nestybox.com/sysbox/releases/v0.6.7/sysbox-ce_0.6.7-0.linux_amd64.deb
sudo apt-get install jq
sudo apt-get install ./sysbox-ce_0.6.7-0.linux_amd64.deb
```

Add to `/etc/docker/daemon.json`:
```json
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
```

Then `sudo systemctl restart docker`.

## Getting Started

```bash
./dev.sh              # Build, start, wait for health, seed dev data
```

This single command starts all services, waits for health checks, and seeds the database with 50 users, ~36 positions, chats, moderation scenarios, and demographic data.

Other modes:
```bash
./dev.sh --reset-db           # Reset DB volume, then start + reseed
./dev.sh --reset-all          # Reset DB + Polis + Redis volumes
./dev.sh --skip-seed          # Start without seeding
./dev.sh --seed-only          # Re-run seed (services must be up)
./dev.sh --snapshot           # Save volume state to snapshots/
./dev.sh --reset-all --restore  # Fast reset from snapshot (~30s)
```

## Key URLs

| URL | Description |
|-----|-------------|
| http://localhost:8000/api/v1/ui | Swagger UI |
| http://localhost:8080 | Pol.is UI |
| ws://localhost:8002 | Chat WebSocket |
| http://localhost:5001 | NLP Service |

**Polis login:** `admin@polis.test` / `Te$tP@ssw0rd*`
If Polis sign-in stalls, accept the self-signed cert at https://localhost:3000/.

**Test users** (password: `password`): `admin1`, `moderator1`, `normal1`-`normal5`, `guest1`-`guest2`. After seeding, `normal4` is banned.

## Running Tests

Tests are integration tests that run against the live API:

```bash
docker compose up -d                           # Ensure services are running
python3 -m pytest backend/tests/ -v            # All tests
python3 -m pytest backend/tests/ -v -m smoke   # Quick smoke tests
python3 -m pytest backend/tests/ -v -m "not mutation"  # Read-only tests
```

## Frontend

```bash
frontend/start.sh             # Regenerate API client + start Expo dev server
frontend/regenerate_api.sh    # Regenerate JS API client only
```

Download Expo Go on your phone and scan the QR code to open the app.

## Project Structure

```
candid/
├── backend/
│   ├── server/           # Flask REST API (OpenAPI-generated + custom controllers)
│   ├── chat-server/      # WebSocket chat service (aiohttp + Redis)
│   ├── database/         # PostgreSQL schema and seed data
│   ├── nlp-service/      # Sentence embeddings + NSFW detection
│   ├── polis-sysbox/     # Pol.is Docker-in-Docker integration
│   ├── scripts/          # Dev/ops scripts (seeding, backfills)
│   └── tests/            # Integration test suite
├── docs/
│   ├── api.yaml          # OpenAPI 3.0 spec (source of truth)
│   └── candid_app_screens/  # UI mockups
├── frontend/
│   ├── app/              # React Native / Expo application
│   ├── regenerate_api.sh # API client generator
│   └── start.sh          # Dev server startup
├── dev.sh                # One-command dev environment setup
└── docker-compose.yaml   # Service orchestration
```

## Database

```bash
psql -h localhost -p 5432 -U user -d candid    # Connect (password: postgres)
docker volume rm candid_postgres_data          # Reset database
docker volume rm candid_polis_docker_data      # Reset Polis
```

## Rebuilding Generated Code

```bash
backend/server/build.sh       # Rebuild Flask server from OpenAPI spec
frontend/regenerate_api.sh    # Rebuild JS API client from OpenAPI spec
```

After regenerating the frontend API client, re-run npm linking:
```bash
cd frontend/api && npm link && cd ../app && npm link ../api/
```

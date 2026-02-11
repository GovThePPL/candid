# Candid

Candid is a chat platform for peaceful and productive discussion of issues of public concern. Users post position statements, swipe to agree/disagree, request one-on-one chats to discuss disagreements, and view group opinion analytics powered by Pol.is.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Flask API  │────▶│  PostgreSQL  │
│  Expo / RN   │     │   (Gunicorn) │     │   + pgvector │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │                     │
       │            ┌──────┴──────┐       ┌──────┴──────┐
       │            │  NLP Service │       │  Keycloak   │
       │            │ (embeddings) │       │   (OIDC)    │
       │            └─────────────┘       └─────────────┘
       │
       ├───────────▶┌─────────────┐     ┌─────────────┐
       │            │ Chat Server  │────▶│    Redis     │
       │            │  (WebSocket) │     │  (pub/sub)   │
       │            └─────────────┘     └─────────────┘
       │
       └───────────▶┌─────────────┐
                    │   Pol.is     │
                    │ (server+math)│
                    └─────────────┘
```

Docker services orchestrated via `docker-compose.yaml`:

| Service | Port | Description |
|---------|------|-------------|
| api     | 8000 | Flask REST API (OpenAPI-first, Gunicorn) |
| chat    | 8002 | WebSocket chat server (aiohttp, Redis pub/sub) |
| db      | 5432 | PostgreSQL 17 with pgvector (Candid + Polis + Keycloak) |
| redis   | 6379 | Message broker and presence tracking |
| nlp     | 5001 | Sentence embeddings and NSFW detection |
| polis-server | 5000 | Pol.is API server |
| polis-math   | -    | Pol.is math/clustering worker |
| keycloak | 8180 | Keycloak OIDC provider |

The project follows **OpenAPI-first development** -- the spec at `docs/api.yaml` is the source of truth for both the backend (Python Flask) and frontend (generated JS client).

## Prerequisites

- **Docker** (latest)
- **Node.js / npm** for frontend development
- **openapi-generator-cli, pipreqs** for local backend builds (optional)

## Getting Started

```bash
./dev.sh              # Build, start, wait for health, seed dev data
```

This single command starts all services, waits for health checks, and seeds the database with 50 users, ~36 positions, chats, moderation scenarios, and demographic data.

Other modes:
```bash
./dev.sh --reset-db           # Reset DB volume, then start + reseed
./dev.sh --reset-all          # Reset DB + Redis volumes
./dev.sh --skip-seed          # Start without seeding
./dev.sh --seed-only          # Re-run seed (services must be up)
./dev.sh --snapshot           # Save volume state to snapshots/
./dev.sh --reset-all --restore  # Fast reset from snapshot (~30s)
```

## Key URLs

| URL | Description |
|-----|-------------|
| http://localhost:8000/api/v1/ui | Swagger UI |
| http://localhost:5000/api/v3/ | Polis API |
| http://localhost:8180/admin | Keycloak Admin (admin/admin) |
| ws://localhost:8002 | Chat WebSocket |
| http://localhost:5001 | NLP Service |

**Test users** (password: `password`): `admin1`, `moderator1`, `normal1`-`normal5`, `guest1`-`guest2`. After seeding, `normal4` is banned.

## Running Tests

```bash
./run-tests.sh              # Backend unit tests + frontend Jest (auto-installs deps)
./run-tests.sh unit         # Backend unit tests only (no Docker)
./run-tests.sh frontend     # Frontend Jest tests only
./run-tests.sh integration  # Backend integration tests (Docker required)
./run-tests.sh all          # All of the above
```

Or run directly:

```bash
python3 -m pytest backend/tests/unit/ -v                           # Unit tests (no Docker)
cd frontend/app && npx jest                                        # Frontend tests
docker compose up -d && python3 -m pytest backend/tests/ -v --ignore=backend/tests/unit  # Integration tests
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
│   ├── polis-integration/ # Pol.is integration (server + math worker)
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
docker volume rm candid_postgres_data          # Reset database (includes Polis data)
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

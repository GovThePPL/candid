# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Candid is a chat platform for peaceful and productive discussion of issues of public concern. It's a monorepo with three Docker-orchestrated services: a Python Flask API backend, a PostgreSQL database, and a Pol.is integration for group opinion analysis.

## Development Commands

### Starting the environment
```bash
docker compose up -d          # Start all services
docker compose up -d --build  # Rebuild and start
```

### Database
```bash
psql -h localhost -p 5432 -U user -d candid   # Connect (password: postgres)
docker volume rm candid_postgres_data          # Reset database
docker volume rm candid_polis_docker_data      # Reset Polis
```

### Backend API
```bash
backend/server/build.sh       # Rebuild server locally from OpenAPI spec
# Requires: python3-pip, openapi-generator-cli, pipreqs
```

### Frontend
```bash
frontend/start.sh             # Regenerates API client, then starts Expo with tunnel
frontend/regenerate_api.sh    # Regenerate JS API client from OpenAPI spec only
```

### Key URLs (after docker compose up)
- Swagger UI: http://127.0.0.1:8000/api/v1/ui
- Polis UI: http://localhost:8080 (login: admin@polis.test / Te$tP@ssw0rd*)
- If Polis sign-in stalls, accept the self-signed cert at https://localhost:3000/

## Architecture

### OpenAPI-First Development

The OpenAPI spec at `docs/api.yaml` is the source of truth. Both backend and frontend code are generated from it:

- **Backend**: `openapi-generator-cli` generates a Python Flask app into `backend/server/generated/`. Custom controller implementations in `backend/server/controllers/` are then copied over the generated stubs. When the spec changes, update the function signatures in `controllers/` to match the newly generated stubs in `generated/candid/controllers/`.
- **Frontend**: `openapi-generator-cli` generates a JavaScript API client into `frontend/api/`, which is npm-linked into `frontend/app/`.

### Backend (backend/server/)

Python Flask app using Connexion for OpenAPI routing. Controllers are organized by domain:

- `controllers/helpers/config.py` - Dev/prod configuration
- `controllers/helpers/database.py` - PostgreSQL connection wrapper (psycopg2, RealDictCursor)
- `controllers/helpers/auth.py` - JWT tokens (60-min expiry), bcrypt (14 rounds), role-based authorization
- `controllers/__init__.py` - Flask app initialization, DB setup

Auth hierarchy: guest < normal < moderator < admin. Authorization decorator returns 401 if unauthenticated, 403 if insufficient role.

Database access uses direct parameterized SQL queries (no ORM).

### Frontend (frontend/app/)

React Native app with Expo (v54) and Expo Router (file-based routing). Authentication via JWT tokens from the backend API. State management via React Context (`contexts/`). All API calls use the generated JavaScript client (`frontend/api/`) via `promisify` wrappers in `lib/api.js`.

### Polis Integration (backend/polis-sysbox/)

Runs Pol.is as a Docker-in-Docker container using the Sysbox runtime. The `polis/` subdirectory is a git submodule from https://github.com/compdemocracy/polis.git. Requires Sysbox v0.6.7 installed on the host.

### Database (backend/database/)

PostgreSQL 17 with schema in `01-schema.sql` and test data in `02-basic-data.sql`. The schema has 24 tables covering users (4 role types), position statements, chat logs, moderation (reports/actions/appeals), surveys, and demographics. Default test password for all seeded users is `password`.

## Docker Services and Ports

| Service | Port | Description |
|---------|------|-------------|
| api     | 8000 | Flask API server |
| db      | 5432 | PostgreSQL |
| polis   | 5000 | Polis API |
| polis   | 8080 | Polis UI |
| polis   | 3000 | OIDC simulator |
| polis   | 443  | Polis HTTPS UI |
| polis   | 8005 | SES local email |

## Prerequisites

- Docker (latest)
- Sysbox runtime v0.6.7 (for Polis docker-in-docker)
- Node.js/npm (for frontend development)
- openapi-generator-cli, pipreqs (for local backend builds)

## Future Work

- **Location-aware categories**: Filter position categories by location relevance (e.g., "Foreign Policy" doesn't apply to "Oregon"). Categories are currently a flat global list in `position_category`.
- **Polis roll-over script and automation**: Automate Polis conversation roll-over (creating new conversations, migrating data, relinking pairwise surveys). Currently requires manual steps via `backend/scripts/backfill_polis_positions.py`.
- **Position timeouts**: Implement expiration/archival of positions after a configurable time period.

## Development Workflow

### Test-Driven Development

When planning a feature, design and create tests for it first. Tests live in `backend/tests/` and follow existing patterns (see `conftest.py` for shared fixtures and helpers).

Before committing or pushing, always run the test suite and ensure there are tests covering the changes since the last commit:

```bash
python3 -m pytest tests/ -v                    # Run all tests
python3 -m pytest tests/test_<module>.py -v     # Run specific test file
```

## Known Issues

### Connexion First-Tag Routing

Connexion routes each endpoint to the controller matching the **first tag** in the OpenAPI spec. If an endpoint has `tags: [Chat, Users]`, Connexion uses `chat_controller.py` and ignores `users_controller.py`. The OpenAPI generator still creates stubs in both controllers. To avoid dead code diverging from the live implementation:

1. **Prefer a single tag** per endpoint when possible.
2. If multiple tags are needed, **put the implementation in the first tag's controller** and don't maintain a copy in the others.
3. When modifying controller logic, verify which controller Connexion actually routes to by checking tag order in `docs/api.yaml`.

### API Spec Must Stay Accurate

The API spec at `docs/api.yaml` must accurately describe every field the backend returns. The generated JS client only deserializes fields defined in the spec — any fields missing from the spec will be silently dropped by the generated model's `constructFromObject`. **Never bypass the generated client with `response.body` or direct `fetch()` to work around missing fields.** Instead, add the missing fields to the spec and regenerate with `frontend/regenerate_api.sh`.

The one exception is the card queue endpoint (`GET /card-queue`), which uses `response.body` due to the oneOf discriminator bug described below. This is a generator limitation, not a spec issue.

### OpenAPI JavaScript Generator: oneOf Discriminator Bug

The OpenAPI JavaScript generator has a bug with `oneOf` discriminators — it checks if data matches *any* schema rather than using the discriminator field first. This is fixed by automated sed patches in `frontend/regenerate_api.sh` that run on every regeneration, patching all 6 `*CardItem.js` files to validate the discriminator `type` value first. The card queue endpoint in `lib/api.js` uses a custom callback with `response.body` to bypass the remaining deserialization issues with nested oneOf models.

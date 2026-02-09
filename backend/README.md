# Backend

All server-side services, database schema, scripts, and tests for Candid.

## Structure

```
backend/
├── server/           # Flask REST API (OpenAPI-first)
├── chat-server/      # WebSocket chat service (aiohttp + Redis)
├── database/         # PostgreSQL schema and seed data
├── nlp-service/      # Sentence embeddings and NSFW detection
├── polis-integration/ # Pol.is integration (server + math worker)
├── scripts/          # Dev/ops scripts (seeding, backfills)
└── tests/            # Integration test suite
```

## Services

| Service | Tech | Port | Docker Service |
|---------|------|------|----------------|
| server | Python Flask + Gunicorn | 8000 | `api` |
| chat-server | Python aiohttp + Redis | 8002 | `chat` |
| database | PostgreSQL 17 + pgvector | 5432 | `db` |
| nlp-service | Python FastAPI + sentence-transformers | 5001 | `nlp` |
| polis-integration | Pol.is (Node.js API + Clojure math) | 5000 | `polis-server`, `polis-math` |
| keycloak | Keycloak OIDC provider | 8180 | `keycloak` |

All services also depend on **Redis** (port 6379) for pub/sub messaging and presence tracking.

## Development

Services are started together via `docker compose up -d` or the convenience wrapper `./dev.sh`. Each service has its own `Dockerfile` and is built in the compose context.

### Running Tests

```bash
python3 -m pytest backend/tests/ -v
```

Tests run against the live API, so Docker services must be up first.

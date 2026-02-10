# Backend Server

Python Flask REST API using Connexion for OpenAPI routing, served by Gunicorn.

## OpenAPI-First Workflow

The OpenAPI spec at `docs/api.yaml` is the source of truth:

1. `openapi-generator-cli` generates a Flask app into `generated/` (gitignored)
2. Custom controller implementations in `controllers/` are copied over the generated stubs
3. The Dockerfile handles this automatically at build time

When the spec changes, update the function signatures in `controllers/` to match the newly generated stubs in `generated/candid/controllers/`.

## Structure

```
server/
├── controllers/          # Custom controller implementations (source of truth)
│   ├── helpers/          # Shared utilities (auth, DB, Redis, Polis, etc.)
│   ├── *_controller.py   # Domain controllers (auth, users, positions, bug_reports, etc.)
│   ├── __init__.py       # Flask app initialization, DB setup
│   └── __main__.py       # WSGI entry point (copied to generated/)
├── generated/            # OpenAPI-generated Flask app (gitignored)
├── Dockerfile            # Builds generated app + copies controllers
├── build.sh              # Local build script
└── openapi-config.json   # Generator configuration
```

## Building

```bash
# Local build (requires openapi-generator-cli, pipreqs)
backend/server/build.sh

# Docker build (automatic via docker compose)
docker compose up -d --build api
```

## Dockerfile Flow

1. Generates Flask app from `docs/api.yaml` using `openapi-generator-cli`
2. Patches UUID type annotations in generated models (generator bug workaround)
3. Copies custom `controllers/` over generated stubs
4. Installs dependencies and starts Gunicorn (4 workers by default)

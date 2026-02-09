# Polis Integration

Pol.is opinion analytics platform, running as direct docker-compose services.

## How It Works

Polis runs as two docker-compose services built from the `polis/` git submodule:
- **polis-server**: Node.js API server (port 5000)
- **polis-math**: Clojure math/clustering worker (no exposed port)

Both services share the main PostgreSQL container (database `polis-dev`). Admin authentication uses Keycloak OIDC (the `polis-admin` client in the `candid` realm).

## Structure

```
polis-integration/
├── polis/              # Git submodule: github.com/compdemocracy/polis (DO NOT EDIT)
└── README.md
```

## Startup Flow

1. Docker Compose starts `polis-server` and `polis-math` services
2. Both connect to the shared PostgreSQL database (`polis-dev` database)
3. `polis-server` validates admin tokens via Keycloak JWKS endpoint
4. Polis API becomes available on port 5000

## Ports

| Port | Description |
|------|-------------|
| 5000 | Polis API server |

## Integration

The main API interacts with Polis via `controllers/helpers/polis_client.py`, which handles Keycloak OIDC authentication for admin operations and XID-based JWT authentication for participant operations.

# Polis Sysbox

Docker-in-Docker container running the Pol.is opinion analytics platform using the Sysbox runtime.

## How It Works

Pol.is requires its own Docker environment (multiple internal containers). Sysbox provides a secure, rootless Docker-in-Docker runtime so Pol.is can run its full stack inside a single Docker container managed by our `docker-compose.yaml`.

## Structure

```
polis-sysbox/
├── polis/              # Git submodule: github.com/compdemocracy/polis (DO NOT EDIT)
├── Dockerfile          # Sysbox container setup
└── docker-compose.yaml # (if present) Internal Polis compose config
```

## Requirements

- **Sysbox v0.6.7** must be installed on the host
- The Docker daemon must be configured with the `sysbox-runc` runtime

## Startup Flow

1. Docker Compose starts the `polis` service with `runtime: sysbox-runc`
2. The container boots its own Docker daemon internally
3. Pol.is services (API, math worker, database, file server) start inside the container
4. Polis becomes available on port 8080 (UI) and port 5000 (API)

Startup is slow (~2-3 minutes) because Polis pulls/builds its own images on first run. The `./dev.sh` script waits non-fatally for Polis readiness.

## Ports

| Port | Description |
|------|-------------|
| 5000 | Polis API server |
| 8080 | Polis UI (proxied from internal port 80) |
| 3000 | OIDC simulator (for admin auth) |
| 443  | Polis HTTPS UI |
| 8005 | SES local email service |

## Integration

The main API interacts with Polis via `controllers/helpers/polis_client.py`, which handles OIDC authentication, conversation management, and vote syncing.

# Kubernetes Deployment Guide

This guide covers deploying the Candid platform on Kubernetes. It assumes familiarity with K8s concepts (Deployments, Services, ConfigMaps, Secrets, PVCs).

## Prerequisites

- **Kubernetes cluster** (any provider -- EKS, GKE, AKS, bare-metal, k3s)
- **kubectl** configured and authenticated against your cluster
- **Container registry access** (ECR, GCR, ACR, Docker Hub, etc.) with push/pull credentials
- **Secrets configured** (see `secrets.md` for required secret values)
- **PersistentVolume provisioner** available in the cluster (for database and Redis storage)

## Architecture Overview

The platform runs as the following pods/deployments:

| Pod | Replicas | Description |
|-----|----------|-------------|
| `candid-api` | N (horizontally scalable) | Flask API server. No background workers. Stateless. |
| `candid-worker` | 1 | Background workers: Polis sync, matrix factorization training, approval reminders. Same image as `candid-api` with different command and env vars. |
| `candid-chat` | N (horizontally scalable) | WebSocket chat server (Socket.IO + Redis adapter). Requires sticky sessions. |
| `candid-db` | 1 | PostgreSQL 17 (Candid + Keycloak databases). |
| `polis-db` | 1 | PostgreSQL (Polis database, separate instance for independent scaling). |
| `polis-server` | 1 | Polis API server. Paired 1:1 with `polis-db`. |
| `polis-math` | 1 | Polis math/clustering worker. Paired 1:1 with `polis-server`. |
| `keycloak` | 1 | OIDC provider. ClusterIP only -- not externally exposed. |
| `redis` | 1 | Shared cache and pub/sub for chat, presence, rate limiting, and caching. |
| `nlp` | 1 | NLP embeddings service for semantic similarity and proposal drafting. |
| `candid-frontend` | N (horizontally scalable) | Expo web bundle served by nginx. Stateless. |
| `file-server` | 1 | Polis static file server. |

### Network Topology

```
Internet
  |
  v
Ingress Controller (nginx / ALB / etc.)
  |
  +---> candid-frontend (ClusterIP, N replicas, static files)
  +---> candid-api (ClusterIP, N replicas)
  +---> candid-chat (ClusterIP, N replicas, sticky sessions)
  |
  (internal only -- no Ingress rules)
  +---> keycloak (ClusterIP)
  +---> candid-db (ClusterIP)
  +---> polis-db (ClusterIP)
  +---> polis-server (ClusterIP)
  +---> polis-math (ClusterIP)
  +---> redis (ClusterIP)
  +---> nlp (ClusterIP)
  +---> file-server (ClusterIP)
```

## Building Images

All builds are run from the repository root unless otherwise noted.

```bash
# API + Worker (same image, different CMD)
docker build -f backend/server/Dockerfile -t your-registry/candid-api:latest .

# Chat server
docker build -f backend/chat-server/Dockerfile -t your-registry/candid-chat:latest .

# Database
docker build -f backend/database/Dockerfile -t your-registry/candid-db:latest .

# Polis DB
docker build -f backend/polis-integration/database/Dockerfile -t your-registry/candid-polis-db:latest .

# NLP service
docker build -f backend/nlp-service/Dockerfile -t your-registry/candid-nlp:latest ./backend/nlp-service

# Polis images
docker build -f backend/polis-integration/polis/server/Dockerfile -t your-registry/candid-polis-server:latest backend/polis-integration/polis/server
docker build -f backend/polis-integration/polis/math/Dockerfile -t your-registry/candid-polis-math:latest backend/polis-integration/polis/math

# Frontend web (build args bake EXPO_PUBLIC_* env vars at Metro bundle time)
# Different environments need separate builds with different --build-arg values.
docker build -f frontend/Dockerfile.web \
  --build-arg EXPO_PUBLIC_API_URL=https://api.your-domain.com/api/v1 \
  --build-arg EXPO_PUBLIC_CHAT_URL=https://chat.your-domain.com \
  --build-arg EXPO_PUBLIC_KEYCLOAK_URL=https://auth.your-domain.com \
  -t your-registry/candid-frontend:latest .

# File server (build args bake auth config into static pages at build time)
docker build -f backend/polis-integration/polis/file-server/Dockerfile \
  --build-arg AUTH_ISSUER=https://auth.your-domain.com/realms/candid \
  --build-arg AUTH_CLIENT_ID=candid-app \
  --build-arg AUTH_AUDIENCE=users \
  -t your-registry/candid-polis-file-server:latest backend/polis-integration/polis
```

Tag images with a specific version (e.g., `v1.2.3` or a git SHA) for production. Avoid using `latest` in production manifests.

## File Server

The file server serves Polis static pages (report, admin, participation UIs). It is internal-only — accessed by `polis-server`, not exposed via Ingress.

- **Port**: 8080 (internal)
- **Build args**: `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_AUDIENCE` are baked in at build time (see [Building Images](#building-images))
- **Replicas**: 1

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
```

## Frontend Web

The frontend serves the Expo web bundle via nginx. It is stateless and horizontally scalable.

- **Port**: 80
- **Build args**: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CHAT_URL`, `EXPO_PUBLIC_KEYCLOAK_URL`, `EXPO_PUBLIC_SMS_ENABLED`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`, `EXPO_PUBLIC_APPLE_SERVICE_ID` are baked into the Metro bundle at build time. Different environments (staging, production) need separate Docker builds with different `--build-arg` values.
- **Replicas**: N (stateless, horizontally scalable)
- **Ingress**: Catch-all `/` route. The nginx Ingress controller matches `/api/` and `/socket.io/` by path specificity before falling through to `/`.

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 10
  periodSeconds: 30
```

## Worker Extraction

The API image serves double duty. API pods disable all background workers:

```yaml
# candid-api Deployment (excerpt)
env:
- name: POLIS_ENABLED
  value: "false"
- name: MF_ENABLED
  value: "false"
- name: APPROVAL_REMINDER_ENABLED
  value: "false"
```

The worker pod uses the same image but overrides the command and enables the workers:

```yaml
# candid-worker Deployment (excerpt)
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: worker
        image: your-registry/candid-api:latest
        command: ["python", "-m", "candid.worker_entrypoint"]
        env:
        - name: POLIS_ENABLED
          value: "true"
        - name: MF_ENABLED
          value: "true"
        - name: APPROVAL_REMINDER_ENABLED
          value: "true"
```

Run exactly **1 worker replica**. All three workers are safe for multi-instance operation (they use PostgreSQL-level locking), but there is no benefit to running multiples.

Set `terminationGracePeriodSeconds: 45` on the worker pod to allow in-flight sync cycles to complete before shutdown.

## WebSocket Sticky Sessions (Chat Service)

The chat service uses Socket.IO with a Redis adapter for cross-pod messaging. Multi-replica chat deployments require sticky sessions so that Socket.IO's HTTP long-polling upgrade handshake hits the same pod.

### Kubernetes Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: candid-chat
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 86400
  selector:
    app: candid-chat
  ports:
  - port: 8002
    targetPort: 8002
    protocol: TCP
```

### nginx Ingress Annotations

If using the nginx Ingress controller, add these annotations to the chat Ingress resource:

```yaml
annotations:
  nginx.ingress.kubernetes.io/affinity: "cookie"
  nginx.ingress.kubernetes.io/affinity-mode: "persistent"
  nginx.ingress.kubernetes.io/session-cookie-name: "CANDID_CHAT"
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  nginx.ingress.kubernetes.io/websocket-services: "candid-chat"
```

For other Ingress controllers (ALB, Traefik, etc.), consult their documentation for WebSocket support and session affinity configuration.

A ready-to-use Ingress manifest with both API and chat resources is provided in [`ingress.yaml`](ingress.yaml).

## Redis Configuration

Start with a single Redis pod backed by a PersistentVolumeClaim:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
data:
  redis.conf: |
    maxmemory 2gb
    maxmemory-policy allkeys-lru
    appendonly yes
    appendfsync everysec
    # NOTE: ConfigMaps do not perform variable substitution.
    # Option 1: Use a literal password here (less secure, password visible in ConfigMap).
    # Option 2: Use an init container to generate redis.conf from a Secret.
    requirepass REPLACE_WITH_ACTUAL_PASSWORD
```

> **Important**: `${REDIS_PASSWORD}` does not expand in K8s ConfigMaps. Either use a literal password value or generate `redis.conf` dynamically from a Secret using an init container.

Mount this ConfigMap into the Redis pod and start Redis with `redis-server /etc/redis/redis.conf`.

### What Redis Is Used For

- **Chat message storage** (TTL-based expiry)
- **Pub/sub** (chat events, discuss events, notifications)
- **User presence tracking**
- **Rate limiting** (sliding window counters)
- **Auth ban cache** (60-second TTL)
- **Location hierarchy cache** (5-minute TTL)

### Upgrade Path

For high availability, migrate to Redis Sentinel or Redis Cluster in a future iteration. The current architecture treats Redis as a cache/pub-sub layer; transient data loss during a Redis restart is acceptable (chat history is TTL-based, caches rebuild automatically).

## Keycloak (Internal Only)

Keycloak is proxied behind the API server. It does **not** need external exposure.

- **Service type**: `ClusterIP` (not LoadBalancer or NodePort)
- **No Ingress rule** for Keycloak
- The frontend authenticates via the API, which proxies auth requests to Keycloak internally
- **Important**: Update redirect URIs in the realm config (`backend/keycloak/candid-realm.json`) to match your production domain before deploying

```yaml
apiVersion: v1
kind: Service
metadata:
  name: keycloak
spec:
  type: ClusterIP
  selector:
    app: keycloak
  ports:
  - port: 8180
    targetPort: 8080
    protocol: TCP
```

## Database Migrations

Run migrations as a **Kubernetes Job** (preferred) rather than init containers. A Job with `parallelism: 1` ensures exactly one migration process runs, avoiding concurrency issues when multiple API pods start simultaneously. Init containers on a multi-replica Deployment would run migrations concurrently — the idempotent check prevents double-application, but concurrent DDL can cause errors.

### Job Approach (Recommended)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: candid-migrate
  annotations:
    helm.sh/hook: pre-upgrade
    helm.sh/hook-weight: "-1"
spec:
  parallelism: 1
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: migrate
        image: your-registry/candid-api:latest
        command: ["bash", "/usr/src/app/backend/database/migrations/run_migrations.sh"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: candid-secrets
              key: database-url
  backoffLimit: 3
```

The Job approach runs once per upgrade and reports success/failure independently. Each migration is atomic — the migration SQL and version record are committed in a single transaction.

### Init Container Approach (Single-Replica Only)

If you have a single API replica, an init container is acceptable:

```yaml
initContainers:
- name: migrate
  image: your-registry/candid-api:latest
  command: ["bash", "/usr/src/app/backend/database/migrations/run_migrations.sh"]
  env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: candid-secrets
        key: database-url
```

> **Warning**: Do not use init containers with multi-replica Deployments — use a Job instead.

## Polis Scaling

Each Polis instance requires its own dedicated database. The server, math worker, and database form a tightly coupled trio:

```
polis-db-1  <--  polis-server-1  <--  polis-math-1
polis-db-2  <--  polis-server-2  <--  polis-math-2  (future)
```

To scale Polis processing capacity, deploy additional independent stacks (each with its own DB, server, and math pod). The Candid API's `POLIS_API_URL` environment variable points to the primary Polis instance.

Do **not** horizontally scale `polis-server` or `polis-math` independently -- they must remain 1:1:1 with their database.

## Health Checks

Configure readiness and liveness probes for each service:

### candid-frontend

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 10
  periodSeconds: 30
```

### candid-api

```yaml
readinessProbe:
  httpGet:
    path: /api/v1/ui/
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /api/v1/ui/
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 30
```

### candid-chat

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8002
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /health
    port: 8002
  initialDelaySeconds: 15
  periodSeconds: 30
```

### nlp

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 30
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 60
  periodSeconds: 30
```

### polis-server

```yaml
readinessProbe:
  httpGet:
    path: /api/v3/participationInit
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /api/v3/participationInit
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 30
```

### redis

```yaml
readinessProbe:
  exec:
    command: ["redis-cli", "ping"]
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  exec:
    command: ["redis-cli", "ping"]
  initialDelaySeconds: 10
  periodSeconds: 30
```

### PostgreSQL (candid-db and polis-db)

```yaml
readinessProbe:
  exec:
    command: ["pg_isready", "-U", "user"]
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  exec:
    command: ["pg_isready", "-U", "user"]
  initialDelaySeconds: 15
  periodSeconds: 30
```

## Resource Recommendations

Starting resource requests/limits (tune based on load testing):

| Pod | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----|------------|-----------|----------------|--------------|
| candid-api | 250m | 1000m | 256Mi | 512Mi |
| candid-worker | 250m | 1000m | 256Mi | 512Mi |
| candid-chat | 100m | 500m | 128Mi | 256Mi |
| candid-db | 500m | 2000m | 512Mi | 2Gi |
| polis-db | 250m | 1000m | 256Mi | 1Gi |
| polis-server | 250m | 1000m | 256Mi | 512Mi |
| polis-math | 500m | 2000m | 512Mi | 2Gi |
| keycloak | 250m | 1000m | 512Mi | 1Gi |
| redis | 100m | 500m | 128Mi | 2Gi |
| nlp | 500m | 2000m | 512Mi | 2Gi |
| candid-frontend | 50m | 200m | 64Mi | 128Mi |
| file-server | 50m | 200m | 64Mi | 128Mi |

## Horizontal Pod Autoscaling

The stateless services (`candid-api`, `candid-chat`, and `candid-frontend`) can be autoscaled:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: candid-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: candid-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

Do **not** autoscale `candid-worker`, `candid-db`, `polis-server`, `polis-math`, or `polis-db`. These must remain at fixed replica counts.

## Polis Database Initialization

In Docker Compose, the Polis DB schema is applied via the standard PostgreSQL Docker entrypoint init scripts (`.sql` files in `/docker-entrypoint-initdb.d/`). For Kubernetes, use the same Polis DB image as either:

- An **init container** on the `polis-server` pod (runs the init SQL against the Polis DB)
- A **Job** that runs once after the `polis-db` pod is healthy

The Polis DB only needs initialization on first deployment — subsequent restarts use the PersistentVolume.

## Network Policies

Apply [`network-policies.yaml`](network-policies.yaml) to restrict pod-to-pod traffic. It includes a default-deny ingress rule and per-service allow rules matching the [network topology](#network-topology) above.

Requires a CNI plugin that supports NetworkPolicy (Calico, Cilium, etc.). Adjust the `app` label values if your Deployments use different names.

## Keycloak Production Setup

### Redirect URIs

`backend/keycloak/candid-realm.json` has hardcoded `localhost:*` redirect URIs. Before importing the realm in production, update the `candid-app` client:

- `redirectUris`: Replace `http://localhost:*` with your production domain (e.g., `https://app.your-domain.com/*`)
- `webOrigins`: Update to match (e.g., `https://app.your-domain.com`)

### KC_HOSTNAME

In production, set `KC_HOSTNAME` to your actual domain (e.g., `auth.your-domain.com`). This determines the `iss` claim in all tokens. You must also update:

- `KEYCLOAK_ISSUER_URL` on the API server to match
- `AUTH_ISSUER` on the Polis server to match (e.g., `https://auth.your-domain.com/realms/candid`)

All three must agree, or token validation will fail. See [secrets.md](secrets.md#issuer-url-consistency) for the full list.

### Social Login

Social login (Apple / Google) requires two things beyond setting env vars:

1. **Token exchange permissions** must be configured in Keycloak via the Admin REST API (realm JSON import alone is insufficient — fine-grained authorization policies on built-in clients like `realm-management` cannot be imported)
2. **Provider client IDs** must be set on the API server

#### Token Exchange Setup Job

The `setup_token_exchange.py` script configures Keycloak's fine-grained permissions for token exchange. It is idempotent and safe to run multiple times. Run it as a Kubernetes Job after Keycloak is healthy:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: candid-keycloak-token-exchange
  namespace: candid
  annotations:
    # If using Helm, run after install/upgrade:
    helm.sh/hook: post-install,post-upgrade
    helm.sh/hook-weight: "0"
    helm.sh/hook-delete-policy: hook-succeeded
spec:
  parallelism: 1
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
      # Wait for Keycloak to be ready before running the script
      - name: wait-for-keycloak
        image: busybox:1.36
        command: ['sh', '-c', 'until wget -qO- http://keycloak:8180/realms/candid; do echo waiting; sleep 5; done']
      containers:
      - name: setup
        image: your-registry/candid-api:latest
        command: ["python3", "backend/scripts/setup_token_exchange.py"]
        env:
        - name: KEYCLOAK_URL
          value: "http://keycloak:8180"
        - name: KEYCLOAK_REALM
          value: "candid"
        - name: KC_BOOTSTRAP_ADMIN_USERNAME
          value: "admin"
        - name: KC_BOOTSTRAP_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: candid-secrets
              key: keycloak-admin-password
  backoffLimit: 5
```

This script:
1. Enables fine-grained permissions on the Users resource (impersonation scope)
2. Enables fine-grained permissions on the `candid-app` client (token-exchange scope)
3. Creates a client policy granting `candid-backend` access to both scopes
4. Associates the policy with both permission resources

It only needs to run once per Keycloak database. Subsequent runs are no-ops (existing policies are detected and skipped). The `backoffLimit: 5` handles transient Keycloak startup delays.

#### Provider Configuration

Set these env vars on the API server (via ConfigMap or Secret):

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID_IOS` | Google OAuth client ID for iOS |
| `GOOGLE_CLIENT_ID_ANDROID` | Google OAuth client ID for Android |
| `GOOGLE_CLIENT_ID_WEB` | Google OAuth client ID for web |
| `APPLE_SERVICE_ID` | Apple Sign-In service/bundle ID |

Without at least one provider client ID configured, the corresponding social login button will fail with a validation error (no audience to check against).

### HTTPS

When Keycloak is behind a TLS-terminating Ingress, set `KC_PROXY_HEADERS=xforwarded` so Keycloak generates HTTPS URLs in token responses and redirect flows.

## Persistent Volumes

Apply [`pvcs.yaml`](pvcs.yaml) to create PersistentVolumeClaims for database and Redis storage:

| PVC | Mount Path | Size | Notes |
|-----|-----------|------|-------|
| `candid-db-data` | `/var/lib/postgresql/data` | 10Gi | Candid + Keycloak databases |
| `polis-db-data` | `/var/lib/postgresql/data` | 5Gi | One per Polis stack |
| `redis-data` | `/data` | 2Gi | AOF persistence, mostly TTL cache |

Set `storageClassName` in each PVC to match your cluster's provisioner (e.g., `gp3` on EKS, `premium-rwo` on GKE, `managed-premium` on AKS). Omit `storageClassName` to use the cluster default.

Reference PVCs from Deployments using `volumes` and `volumeMounts` — see the comment header in `pvcs.yaml` for a snippet.

## Backup Strategy

Apply [`backup-cronjob.yaml`](backup-cronjob.yaml) to create nightly database backup CronJobs.

| CronJob | Schedule | Target | Retention |
|---------|----------|--------|-----------|
| `candid-db-backup` | 02:00 UTC | Candid + Keycloak DB | 7 daily |
| `polis-db-backup` | 02:30 UTC | Polis DB | 7 daily |

Backups use `pg_dump --format=custom --compress=9` and write to a shared `candid-backups` PVC (20Gi). The 30-minute offset avoids I/O contention between dumps.

**RPO**: 24 hours (nightly dumps). **RTO**: 10–30 minutes (restore from most recent dump).

Backup pods use the `app: candid-backup` label, which is allowed through the `allow-candid-db` and `allow-polis-db` NetworkPolicies. The backup CronJob references `database-url` and `polis-database-url` keys from `candid-secrets`.

For production, consider uploading dumps to S3/GCS instead of a PVC — see the commented section in `backup-cronjob.yaml`. Also consider WAL archiving for point-in-time recovery (PITR).

The restore procedure (scale down, `pg_restore --clean`, scale up) is documented in the YAML file comments.

## Monitoring

Apply [`monitoring.yaml`](monitoring.yaml) to configure infrastructure-level monitoring.

### Prerequisites

- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) (Prometheus Operator + Grafana + Alertmanager)
- [prometheus-blackbox-exporter](https://github.com/prometheus-community/helm-charts/tree/main/charts/prometheus-blackbox-exporter)

### Blackbox Probes

Four `Probe` CRDs that check HTTP health endpoints every 30 seconds:

| Target | Endpoint | Criticality |
|--------|----------|-------------|
| `candid-api` | `/api/v1/ui/` | Critical |
| `candid-chat` | `/health` | Critical |
| `nlp` | `/health` | Critical (toxicity fails open when down) |
| `polis-server` | `/api/v3/participationInit` | Warning |

### Alerts

The `PrometheusRule` includes alerts for:

- **Service health**: `CandidAPIDown`, `CandidChatDown`, `CandidNLPDown` (5m, critical), `PolisServerDown` (10m, warning)
- **Pod stability**: `CandidPodCrashLooping` (>3 restarts in 15m)
- **Database**: `CandidDBHighConnections` (>80 for 10m) — requires `postgres_exporter` sidecar
- **Redis**: `CandidRedisHighMemory` (>85% maxmemory) — requires `redis_exporter` sidecar
- **TLS**: `CandidTLSCertExpiring` (<14 days) — requires cert-manager
- **Backups**: `CandidBackupFailed` (CronJob failure)

### Grafana Dashboards

Import these community dashboards for infrastructure visibility:

| ID | Dashboard |
|----|-----------|
| 315 | Kubernetes cluster monitoring |
| 1860 | Node Exporter full |
| 9628 | PostgreSQL (requires `postgres_exporter`) |
| 763 | Redis (requires `redis_exporter`) |

### Future: Application Metrics

The app currently has no Prometheus client libraries or `/metrics` endpoints. To add application-level metrics (request latency, active WebSocket connections, queue depth), add a Prometheus client to the Flask and Socket.IO servers and create a `ServiceMonitor` CRD for each.

## Environments

Candid supports three deployment environments: **production**, **staging**, and **dev**. Each runs in its own namespace with environment-specific configuration.

### Environment Comparison

| Aspect | Dev | Staging | Production |
|--------|-----|---------|------------|
| Namespace | `candid-dev` | `candid-staging` | `candid` |
| `FLASK_ENV` | `development` | `production` | `production` |
| Secrets | Dev defaults OK | Production-grade | Production-grade |
| Test data | Seeded (~150 users) | Minimal / manual | Real users |
| Replicas | 1 each | 1 each | 2+ (HPA) |
| Reset policy | Disposable, re-seed anytime | Semi-stable | Never reset |
| Backups | None | Optional | Required |
| CORS origins | Dev URLs | `staging.your-domain.com` | `app.your-domain.com` |

### Staging Environment

The staging environment mirrors production configuration with reduced resources. It auto-deploys on every merge to `main` and gates production deployment behind manual approval.

#### Namespace Setup

```bash
kubectl create namespace candid-staging
```

Apply the same Secrets and ConfigMaps as production, with these overrides:

| Config | Staging Value |
|--------|--------------|
| `FLASK_ENV` | `production` (tests real code paths) |
| CORS origins | `https://staging.your-domain.com` |
| `KC_HOSTNAME` | `auth-staging.your-domain.com` (if separate Keycloak) |
| Replicas | 1 each (no HPA) |

#### Staging Resource Recommendations

Half of production values:

| Pod | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----|------------|-----------|----------------|--------------|
| candid-api | 125m | 500m | 128Mi | 256Mi |
| candid-worker | 125m | 500m | 128Mi | 256Mi |
| candid-chat | 50m | 250m | 64Mi | 128Mi |
| candid-db | 250m | 1000m | 256Mi | 1Gi |
| polis-db | 125m | 500m | 128Mi | 512Mi |
| polis-server | 125m | 500m | 128Mi | 256Mi |
| polis-math | 250m | 1000m | 256Mi | 1Gi |
| keycloak | 125m | 500m | 256Mi | 512Mi |
| redis | 50m | 250m | 64Mi | 1Gi |
| nlp | 250m | 1000m | 256Mi | 1Gi |
| candid-frontend | 25m | 100m | 32Mi | 64Mi |
| file-server | 25m | 100m | 32Mi | 64Mi |

#### Staging Ingress

Create a separate Ingress resource for staging (same structure as [`ingress.yaml`](ingress.yaml), different host):

```yaml
spec:
  rules:
  - host: staging.your-domain.com
    # ... same paths as production
  tls:
  - hosts:
    - staging.your-domain.com
    secretName: candid-staging-tls
```

#### Keycloak Strategy

Two options:

1. **Shared Keycloak** (simpler): Use the production Keycloak instance. Add staging redirect URIs (`https://staging.your-domain.com/*`) to the `candid-app` client. Both environments share the same user database.

2. **Separate Keycloak** (isolated): Deploy a dedicated Keycloak in `candid-staging`. Set `KC_HOSTNAME=auth-staging.your-domain.com`. Users and realm config are fully independent.

Choose shared for simplicity; choose separate if you need to test Keycloak configuration changes before production.

#### Smoke Tests

After deploying to staging, verify:

```bash
# API health
curl -sf https://staging.your-domain.com/api/v1/ui/

# Chat health (if exposed)
curl -sf https://staging.your-domain.com/chat/health

# Auth flow (get a token)
curl -sf https://staging.your-domain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"password"}'
```

#### CI/CD Integration

The [CI/CD pipeline](../../.github/workflows/ci.yaml) automatically deploys to staging on every merge to `main`. Production deployment requires manual approval via a GitHub Environment protection rule. See the workflow file for details.

### Dev Environment

A shared cloud-hosted development environment with realistic test data for team testing and demos.

#### Namespace Setup

```bash
kubectl create namespace candid-dev
```

#### Configuration

- `FLASK_ENV=development` — enables dev defaults, relaxed rate limiting
- Dev-specific CORS origins and Keycloak redirect URIs
- Secrets can use dev defaults (security is not a concern)
- Default test password for all seeded users: `password`

#### Seeding Test Data

The existing `seed_dev_data.py` script accepts `API_URL`, `DATABASE_URL`, and `KEYCLOAK_URL` environment variables, so it can target a remote cluster. Apply [`seed-job.yaml`](seed-job.yaml) to run it as a Kubernetes Job:

```bash
kubectl apply -f seed-job.yaml -n candid-dev

# Monitor progress:
kubectl logs -f job/candid-seed-dev -n candid-dev
```

The seed Job creates ~150 users with coherent voting patterns, positions, chats, moderation scenarios, demographics, and pairwise data. It is idempotent — safe to re-run.

#### Reset / Reseed

To fully reset the dev environment:

```bash
# Nuclear option: delete everything and recreate
kubectl delete namespace candid-dev
kubectl create namespace candid-dev
# Re-apply secrets, deployments, services, then:
kubectl apply -f seed-job.yaml -n candid-dev
```

Or just re-run the seed Job on an existing environment:

```bash
kubectl delete job candid-seed-dev -n candid-dev
kubectl apply -f seed-job.yaml -n candid-dev
```

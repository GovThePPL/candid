# Kubernetes Deployment

Documentation for deploying Candid on Kubernetes.

## Files

| File | Purpose |
|------|---------|
| `deployment-guide.md` | Architecture overview, image builds, worker extraction, sticky sessions, Redis, Keycloak, health checks, resource recommendations, environments (staging/dev) |
| `secrets.md` | Secrets inventory, security notes, application instructions |
| `secrets-template.yaml` | K8s Secret YAML template with placeholder values |
| `ingress.yaml` | Ingress manifests for API, chat, and frontend (nginx, TLS, WebSocket sticky sessions, SPA catch-all) |
| `network-policies.yaml` | Default-deny ingress + per-service allow rules |
| `pvcs.yaml` | PersistentVolumeClaim manifests for databases and Redis |
| `backup-cronjob.yaml` | Nightly pg_dump CronJobs with retention and restore procedure |
| `monitoring.yaml` | Blackbox Exporter probes and PrometheusRule alerts |
| `seed-job.yaml` | K8s Job to seed dev environment with test data |

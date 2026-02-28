# Production Security Checklist

Pre-deployment checklist for securing the Candid stack. Items marked **(critical)** must be addressed before any public deployment.

## Secrets and Credentials

- [ ] **(critical)** Set all secrets via environment variables or Docker secrets — never use dev defaults:
  - `KEYCLOAK_BACKEND_CLIENT_SECRET` (not `candid-backend-secret`)
  - `POLIS_ADMIN_CLIENT_SECRET` (not `polis-admin-secret`)
  - `POLIS_ADMIN_PASSWORD` (not `password`)
  - PostgreSQL password in `DATABASE_URL` (not `postgres`)
  - Redis password in `REDIS_URL`
- [ ] **(critical)** Set `FLASK_ENV=production` — this enables rate limiting and requires all secrets via env vars
- [ ] Rotate Keycloak client secrets from the dev defaults in `candid-realm.json`
- [ ] Use `.env.example` as a template — copy to `.env` and fill in production values

## Network and CORS

- [ ] **(critical)** Set `CORS_ORIGINS` env var to your frontend domain(s) — both for the API server and chat server
- [ ] Remove host port mappings for `db` (5432) and `redis` (6379) — use `docker-compose.prod.yml` override
- [ ] Ensure PostgreSQL and Redis are only accessible within the Docker network
- [ ] Use TLS termination (nginx/load balancer) in front of all services
- [ ] Set `KEYCLOAK_URL` to the public HTTPS Keycloak URL

## Keycloak / Authentication

- [ ] **(critical)** Update `webOrigins` in Keycloak client configs from `"+"` to explicit frontend origin(s):
  - `candid-users` client: replace `"+"` with `["https://your-frontend-domain"]`
  - `polis-admin` client: replace `"+"` with `["https://your-api-domain"]`
  - `wikijs` client: replace `"+"` with the Wiki.js domain
- [ ] Update `redirectUris` to only include production callback URLs (remove `localhost` entries)
- [ ] Verify refresh token rotation is enabled (`revokeRefreshToken: true`, `refreshTokenMaxReuse: 0`)
- [ ] Configure SMTP in Keycloak and set `verifyEmail: true` in realm config (currently `false` — requires SMTP)
- [ ] Consider reducing `accessTokenLifespan` from 3600s if appropriate

## Application Security

- [ ] Security response headers are set automatically (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security` in production)
- [ ] JWT issuer validation is enforced (rejects tokens from other Keycloak realms)
- [ ] Rate limiting is active in production (verify `FLASK_ENV != dev`)
- [ ] NLP toxicity check failure mode is documented (fails open — content is posted without toxicity check if NLP service is down)

## Monitoring

- [ ] Set up alerting for NLP service downtime (toxicity checks fail open)
- [ ] Monitor for `SECURITY:` log lines from config.py (indicates dev defaults in production)
- [ ] Consider adding an `audit_log` table for admin/moderator actions

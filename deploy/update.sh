#!/bin/bash
# Candid Demo — Update Script
# Run after git pull to sync configs and rebuild.
#
# Usage:
#   sudo bash deploy/update.sh

set -euo pipefail

APP_DIR="/opt/candid"
cd "$APP_DIR"

echo "=== Candid Update ==="

# 1. Sync systemd service file
echo "Syncing systemd service..."
cp "$APP_DIR/deploy/candid.service" /etc/systemd/system/candid.service
systemctl daemon-reload

# 2. Sync nginx config
echo "Syncing nginx config..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/candid
nginx -t && systemctl reload nginx

# 3. Sync PgBouncer password from .env
echo "Syncing PgBouncer userlist..."
PG_PW=$(grep '^POSTGRES_PASSWORD=' "$APP_DIR/deploy/.env" | cut -d= -f2)
echo "\"user\" \"${PG_PW}\"" > "$APP_DIR/backend/pgbouncer/userlist.txt"

# 4. Build and restart
echo "Building images..."
docker compose -f docker-compose.yaml -f deploy/docker-compose.prod.yaml --env-file deploy/.env build

echo "Restarting services..."
docker compose -f docker-compose.yaml -f deploy/docker-compose.prod.yaml --env-file deploy/.env up -d

echo ""
echo "=== Update complete ==="
echo "Check status: sudo docker compose -f docker-compose.yaml -f deploy/docker-compose.prod.yaml --env-file deploy/.env ps"

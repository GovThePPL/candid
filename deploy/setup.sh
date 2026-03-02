#!/bin/bash
# Candid Demo — EC2 Setup Script
# Run as root on a fresh Ubuntu 22.04/24.04 instance
#
# Prerequisites:
#   - t3.large (2 vCPU, 8GB RAM) or larger
#   - 20GB+ EBS volume
#   - Security group: inbound TCP 22, 80, 443
#   - Elastic IP attached
#   - DNS A record: candid-demo.org → Elastic IP
#
# Usage:
#   sudo bash deploy/setup.sh

set -euo pipefail

DOMAIN="candid-demo.org"
APP_DIR="/opt/candid"
REPO_URL="git@github.com:GovThePPL/candid.git"

echo "=== Candid Demo Setup ==="

# 1. Swap (prevents OOM on builds and heavy workloads)
if [ ! -f /swapfile ]; then
    echo "Setting up 2GB swap..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
    echo "Swap already configured."
fi

# 2. System packages
echo "Installing system packages..."
apt-get update
apt-get install -y \
    ca-certificates curl gnupg lsb-release \
    nginx certbot python3-certbot-nginx \
    git

# 3. Docker (official repo)
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
else
    echo "Docker already installed."
fi

# 4. Clone repo
if [ ! -d "$APP_DIR" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    git submodule update --init --recursive
else
    echo "Repository already exists at $APP_DIR"
    cd "$APP_DIR"
    git pull
    git submodule update --init --recursive
fi

# 5. Environment file
if [ ! -f "$APP_DIR/deploy/.env" ]; then
    echo "Creating .env from example..."
    cp "$APP_DIR/deploy/.env.example" "$APP_DIR/deploy/.env"
    # Generate random secrets
    SECRET_KEY=$(openssl rand -hex 32)
    REDIS_PW=$(openssl rand -hex 16)
    PG_PW=$(openssl rand -hex 16)
    KC_SECRET=$(openssl rand -hex 16)
    KC_ADMIN_PW=$(openssl rand -hex 16)
    POLIS_SECRET=$(openssl rand -hex 16)
    POLIS_ADMIN_PW=$(openssl rand -hex 16)

    sed -i "s|CHANGE_ME_STRONG_PASSWORD|${PG_PW}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_REDIS_PASSWORD|${REDIS_PW}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_ADMIN_PASSWORD|${KC_ADMIN_PW}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_CLIENT_SECRET|${KC_SECRET}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_RANDOM_64_CHARS|${SECRET_KEY}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_POLIS_SECRET|${POLIS_SECRET}|g" "$APP_DIR/deploy/.env"
    sed -i "s|CHANGE_ME_POLIS_ADMIN_PW|${POLIS_ADMIN_PW}|g" "$APP_DIR/deploy/.env"

    echo ""
    echo ">>> .env created with generated secrets."
    echo ">>> Review $APP_DIR/deploy/.env before continuing."
    echo ""
else
    echo ".env already exists."
    PG_PW=$(grep '^POSTGRES_PASSWORD=' "$APP_DIR/deploy/.env" | cut -d= -f2)
    KC_SECRET=$(grep '^KEYCLOAK_BACKEND_CLIENT_SECRET=' "$APP_DIR/deploy/.env" | cut -d= -f2)
fi

# 6. Generate PgBouncer userlist with correct password
echo "Updating PgBouncer userlist..."
PG_PW=${PG_PW:-$(grep '^POSTGRES_PASSWORD=' "$APP_DIR/deploy/.env" | cut -d= -f2)}
echo "\"user\" \"${PG_PW}\"" > "$APP_DIR/backend/pgbouncer/userlist.txt"

# 7. Update Keycloak realm client secret to match generated secret
KC_SECRET=${KC_SECRET:-$(grep '^KEYCLOAK_BACKEND_CLIENT_SECRET=' "$APP_DIR/deploy/.env" | cut -d= -f2)}
REALM_FILE="$APP_DIR/backend/keycloak/candid-realm.json"
if [ -f "$REALM_FILE" ] && [ -n "$KC_SECRET" ]; then
    echo "Updating Keycloak realm client secret..."
    # Replace the candid-backend client secret in the realm JSON
    python3 -c "
import json, sys
with open('$REALM_FILE') as f:
    realm = json.load(f)
for client in realm.get('clients', []):
    if client.get('clientId') == 'candid-backend':
        client['secret'] = '$KC_SECRET'
        break
with open('$REALM_FILE', 'w') as f:
    json.dump(realm, f, indent=2)
print('Updated candid-backend client secret')
"
fi

# 8. Nginx config
echo "Configuring nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/candid
ln -sf /etc/nginx/sites-available/candid /etc/nginx/sites-enabled/candid
rm -f /etc/nginx/sites-enabled/default

# 9. SSL certificate
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "Obtaining SSL certificate..."
    # Temporarily serve HTTP for ACME challenge
    cat > /etc/nginx/sites-available/candid-temp <<TMPEOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'waiting for cert'; }
}
TMPEOF
    ln -sf /etc/nginx/sites-available/candid-temp /etc/nginx/sites-enabled/candid
    mkdir -p /var/www/certbot
    nginx -t && systemctl restart nginx

    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN"

    # Restore real config
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/candid
    ln -sf /etc/nginx/sites-available/candid /etc/nginx/sites-enabled/candid
    rm -f /etc/nginx/sites-available/candid-temp
else
    echo "SSL certificate already exists."
fi

nginx -t && systemctl restart nginx
systemctl enable nginx

# 10. Auto-renew certs
echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" \
    | crontab -

# 11. Systemd service
echo "Installing systemd service..."
cp "$APP_DIR/deploy/candid.service" /etc/systemd/system/candid.service
systemctl daemon-reload
systemctl enable candid

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Review secrets:  nano $APP_DIR/deploy/.env"
echo "  2. Build & start:   cd $APP_DIR && sudo docker compose -f docker-compose.yaml -f deploy/docker-compose.prod.yaml --env-file deploy/.env up -d --build"
echo "     (First start: Keycloak takes ~90s to initialize. If api/polis-server fail, re-run the same command.)"
echo "  3. Watch logs:      sudo docker compose -f docker-compose.yaml -f deploy/docker-compose.prod.yaml --env-file deploy/.env logs -f"
echo "  4. Seed data:       sudo docker exec candid-api-1 python /usr/src/app/backend/scripts/seed_dev_data.py"
echo ""
echo "Keycloak admin:  https://$DOMAIN/admin  (admin / see .env)"
echo "API docs:        https://$DOMAIN/api/v1/ui/"
echo "Web app:         https://$DOMAIN/"
echo ""

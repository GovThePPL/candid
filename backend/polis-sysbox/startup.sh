#!/bin/bash
# Start dockerd in background
dockerd-entrypoint.sh &

# Ensure SSL certificates are valid for OIDC simulator
WORK_DIR=$(pwd)
CERT_DIR=/root/.simulacrum/certs
CERT_FILE="$CERT_DIR/localhost.pem"

# Ensure certs directory exists
mkdir -p $CERT_DIR

# Always refresh the CA installation (idempotent, ensures CA is trusted)
echo "Refreshing mkcert CA..."
mkcert -install

# Regenerate certs if missing or older than 30 days
if [ ! -f "$CERT_FILE" ] || [ $(find "$CERT_FILE" -mtime +30 2>/dev/null | wc -l) -gt 0 ]; then
    echo "Generating/refreshing SSL certificates..."
    cd $CERT_DIR
    mkcert localhost
    cd $WORK_DIR
    echo "Certificates ready"
else
    echo "Certificates are valid"
fi

# Wait for docker to be ready
echo "Waiting for Docker daemon to start..."
timeout=60
while ! docker info >/dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "Timeout waiting for Docker daemon"
        exit 1
    fi
    echo "Docker daemon not ready yet, waiting..."
    sleep 2
    timeout=$((timeout-2))
done

echo "Docker daemon is ready!"
docker info

# Setup environment if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from example.env"
    cp example.env .env
    # Suppress auth errors (TODO: FIX)
    echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> .env

    # Configure OIDC for consistent localhost issuer
    # Both browser and Candid API will use localhost:3000 as the issuer
    # - Browser accesses https://localhost:3000 directly
    # - Candid API sets Host: localhost:3000 header when calling OIDC
    # This ensures all tokens have iss=https://localhost:3000/
    echo "" >> .env
    echo "# Candid OIDC Integration - Use localhost for consistent issuer" >> .env
    echo "AUTH_DOMAIN=localhost:3000" >> .env
    echo "AUTH_ISSUER=https://localhost:3000/" >> .env
    echo "JWKS_URI=https://oidc-simulator:3000/.well-known/jwks.json" >> .env
fi


# Start Polis development environment using docker-compose directly
echo "Starting Polis development environment..."
ls .
docker ps
exec /usr/bin/make start

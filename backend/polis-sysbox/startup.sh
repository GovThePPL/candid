#!/bin/bash
# Start dockerd in background
dockerd-entrypoint.sh &

# Install and configure mkcert for local ssl auth
WORK_DIR=$(pwd)

if [ ! -f /usr/bin/mkcert ]; then
    curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
    chmod +x mkcert-v*-linux-amd64
    cp mkcert-v*-linux-amd64 /usr/local/bin/mkcert
fi

if [ ! -d /root/.simulacrum/certs ]; then
    mkdir -p /root/.simulacrum/certs
    cd /root/.simulacrum/certs
    mkcert -install   # Created a new local CA at the location returned from mkcert -CAROOT
    mkcert localhost  # Using the local CA at CAROOT, create a new certificate valid for the following names
    cd $WORK_DIR 
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

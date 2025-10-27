#!/bin/bash
# Start dockerd in background
dockerd-entrypoint.sh &

# Wait for docker to be ready
sleep 15

# Setup environment if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from example.env"
    cp example.env .env
fi

# Start Polis development environment using docker-compose directly
echo "Starting Polis development environment..."
exec docker-compose --profile postgres --profile local-services -f docker-compose.yml -f docker-compose.dev.yml up

FROM docker:dind

# Install required tools
RUN apk add --no-cache \
    make \
    curl \
    nodejs \
    npm \
    bash

# Install docker-compose
RUN curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/docker-compose

# Create certificate directory for development
RUN mkdir -p /root/.simulacrum/certs

WORKDIR /workspace

# Create the startup script directly in the Dockerfile
RUN cat > /startup.sh << 'EOF'
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
EOF

RUN chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]

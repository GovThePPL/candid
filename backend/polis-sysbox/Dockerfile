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
# Copy and set up the startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]

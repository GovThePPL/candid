FROM docker:dind

# Install required tools
RUN apk add --no-cache \
    make \
    curl \
    nodejs \
    npm \
    bash \
    make \
    nss-tools

# Install docker-compose
RUN curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/docker-compose

# Install mkcert at build time
RUN curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64" \
    && chmod +x mkcert-v*-linux-amd64 \
    && mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# Create certificate directory and generate initial certs at build time
RUN mkdir -p /root/.simulacrum/certs \
    && mkcert -install \
    && cd /root/.simulacrum/certs \
    && mkcert localhost

WORKDIR /workspace

# Create the startup script directly in the Dockerfile
# Copy and set up the startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]

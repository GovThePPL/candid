FROM postgres:17

# Install pgvector extension for semantic similarity search
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-17-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV POSTGRES_DB=candid
ENV POSTGRES_USER=user
ENV POSTGRES_PASSWORD=postgres

# Copy SQL files to the initialization directory
# Files in /docker-entrypoint-initdb.d/ are executed in alphabetical order
# All migrations have been rolled into schema.sql (pre-production)
COPY backend/database/sql/00-create-keycloak-db.sql /docker-entrypoint-initdb.d/00a-create-keycloak-db.sql
COPY backend/database/sql/00-create-polis-db.sh /docker-entrypoint-initdb.d/00b-create-polis-db.sh
COPY backend/database/sql/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY backend/database/test_data/basic.sql /docker-entrypoint-initdb.d/02-basic-data.sql
COPY backend/database/test_data/pairwise_surveys.sql /docker-entrypoint-initdb.d/03-pairwise-data.sql

# Copy Polis migrations (referenced by 00b-create-polis-db.sh)
COPY backend/polis-integration/polis/server/postgres/migrations/0*.sql /polis-migrations/

# Expose the default PostgreSQL port
EXPOSE 5432

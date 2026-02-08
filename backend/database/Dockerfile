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
COPY sql/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY test_data/basic.sql /docker-entrypoint-initdb.d/02-basic-data.sql
COPY test_data/pairwise_surveys.sql /docker-entrypoint-initdb.d/03-pairwise-data.sql

# Expose the default PostgreSQL port
EXPOSE 5432

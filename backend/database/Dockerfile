FROM postgres:17

# Set environment variables
ENV POSTGRES_DB=govtheppl
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres

# Copy SQL files to the initialization directory
# Files in /docker-entrypoint-initdb.d/ are executed in alphabetical order
COPY sql/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY test_data/basic.sql /docker-entrypoint-initdb.d/02-basic-data.sql

# Expose the default PostgreSQL port
EXPOSE 5432

# The postgres image already has the correct CMD, so we don't need to override it

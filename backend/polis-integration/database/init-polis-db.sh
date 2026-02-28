#!/bin/bash
# Applies Polis migrations to the polis-dev database.
# Runs as a PostgreSQL docker-entrypoint-initdb.d script.

set -e

echo "Running Polis migrations..."
for f in /polis-migrations/*.sql; do
    if [ -f "$f" ]; then
        echo "  Applying $(basename "$f")..."
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
    fi
done

echo "Polis database setup complete."

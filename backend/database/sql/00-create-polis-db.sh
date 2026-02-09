#!/bin/bash
# Creates the polis-dev database and runs all Polis migrations.
# This runs as a postgres init script (before 01-schema.sql).

set -e

echo "Creating polis-dev database..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE \"polis-dev\";" 2>/dev/null || echo "polis-dev database already exists"

echo "Running Polis migrations..."
for f in /polis-migrations/*.sql; do
    if [ -f "$f" ]; then
        echo "  Applying $(basename "$f")..."
        psql -U "$POSTGRES_USER" -d "polis-dev" -f "$f"
    fi
done

echo "Polis database setup complete."

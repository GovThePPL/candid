#!/bin/bash
# Forward-only schema migration runner.
#
# Creates a tracking table if needed, then applies unapplied .sql files
# in sorted order. Each migration is applied atomically: the migration SQL
# and the version record are committed in a single transaction.
#
# Usage:
#   ./run_migrations.sh
#
# Environment:
#   DATABASE_URL  — PostgreSQL connection string
#                   (default: postgresql://user:postgres@db:5432/candid)

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://user:postgres@db:5432/candid}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Running migrations from $MIGRATIONS_DIR..."

# Create tracking table if it doesn't exist
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );"

# Apply unapplied migrations in order
applied=0
for f in "$MIGRATIONS_DIR"/[0-9]*.sql; do
  [ -f "$f" ] || continue
  version=$(basename "$f")

  already=$(psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM schema_migrations WHERE version=\$\$${version}\$\$")

  if [ -z "$already" ]; then
    echo "  Applying $version..."
    # Atomic: migration SQL + version record in a single transaction.
    # If the migration fails, the version is never recorded.
    # If it succeeds, both are committed together.
    {
      cat "$f"
      echo "INSERT INTO schema_migrations (version) VALUES (\$\$${version}\$\$);"
    } | psql "$DATABASE_URL" --single-transaction
    applied=$((applied + 1))
  fi
done

if [ "$applied" -eq 0 ]; then
  echo "No new migrations to apply."
else
  echo "Applied $applied migration(s)."
fi

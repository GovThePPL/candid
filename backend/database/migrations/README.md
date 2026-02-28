# Schema Migrations

Forward-only numbered SQL migrations for the Candid database.

## How It Works

`run_migrations.sh` creates a `schema_migrations` tracking table, then applies any unapplied `.sql` files in sorted order. Each migration is **atomic**: the migration SQL and the version record are committed in a single transaction. If a migration fails, the version is never recorded; if it succeeds, both are committed together.

Version strings use **dollar-quoting** (`$$version$$`) instead of single quotes to safely handle any characters in filenames.

## Structure

```
migrations/
├── run_migrations.sh   # Runner script
├── 001_initial.sql     # Baseline marker (no-op, marks schema.sql as applied)
└── README.md
```

## Adding a Migration

1. Create `NNN_description.sql` (zero-padded, e.g. `002_add_foo_column.sql`)
2. Write forward-only SQL (no rollback support)
3. Run: `./run_migrations.sh`

## Usage

```bash
# Local (requires DATABASE_URL or uses default)
./backend/database/migrations/run_migrations.sh

# In Docker
docker compose exec api bash /usr/src/app/backend/database/migrations/run_migrations.sh
```

## Kubernetes Deployments

Run migrations as a **Job** (not init containers) to avoid concurrent execution when multiple API pods start simultaneously. The Job should have `parallelism: 1` and `backoffLimit: 3`. See `docs/kubernetes/deployment-guide.md` for the full Job manifest.

If the script is accidentally run twice (e.g., manual re-run), the idempotent check (`SELECT 1 FROM schema_migrations WHERE version = ...`) prevents double-application.

## Notes

- Fresh installs use `schema.sql` via Docker init scripts; `001_initial.sql` just marks the baseline as applied
- The tracking table (`schema_migrations`) stores the filename and timestamp of each applied migration
- Migrations are idempotent to re-run — already-applied files are skipped

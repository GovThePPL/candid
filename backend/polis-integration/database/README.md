# Polis Database

Separate PostgreSQL 17 container for Polis data. Decoupled from the main Candid database to support independent Polis scaling (each Polis instance needs its own DB + server + math worker).

## Structure

```
database/
├── Dockerfile          # postgres:17, copies Polis migrations
├── init-polis-db.sh    # Runs Polis migrations on first start
└── README.md
```

## Init Flow

On first container start, `init-polis-db.sh` applies all Polis schema migrations from the `polis` submodule (`polis/server/postgres/migrations/0*.sql`).

## Scaling

To add Polis processing capacity, deploy additional independent stacks:

```
polis-db-1 + polis-server-1 + polis-math-1
polis-db-2 + polis-server-2 + polis-math-2
```

Each stack is a 1:1:1 trio sharing a single database.

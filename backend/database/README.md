# Database

PostgreSQL 17 with pgvector extension for semantic similarity search.

## Schema Design

The schema supports the full Candid domain: users, positions, voting, chat, surveys, moderation, demographics, and Polis integration. Key tables include:

- **users** -- User accounts with role hierarchy (guest/normal/moderator/admin), diagnostics consent flag
- **position / user_position** -- Position statements and per-user adoption
- **response** -- Agree/disagree/pass/chat votes on positions
- **chat_request / chat_log** -- Chat lifecycle and message storage (JSONB)
- **survey / survey_question / survey_question_option** -- Multi-question surveys with pairwise comparisons
- **report / mod_action** -- Content moderation pipeline with appeals
- **user_demographics** -- Demographics for group analytics
- **position_category / location** -- Hierarchical categorization and geography
- **bug_report** -- User-submitted bug reports with optional device diagnostics

## Dockerfile Init Flow

Files in `/docker-entrypoint-initdb.d/` execute alphabetically on first container start:

1. `01-schema.sql` -- Full schema (all migrations rolled in, pre-production)
2. `02-basic-data.sql` -- Infrastructure seed: users, categories, locations, rules, surveys
3. `03-pairwise-data.sql` -- Pairwise survey questions and options

Rich dev data (50 users, ~36 positions, chats, moderation) is created by `backend/scripts/seed_dev_data.py` via `./dev.sh`.

## Structure

```
database/
├── sql/
│   └── schema.sql        # Complete current schema (all pre-production migrations rolled in)
├── test_data/
│   ├── basic.sql         # Core seed data (users, categories, locations, rules)
│   └── pairwise_surveys.sql  # Pairwise survey data
└── Dockerfile            # postgres:17 + pgvector, copies init files
```

## Resetting

```bash
docker volume rm candid_postgres_data    # Remove data volume
docker compose up -d --build db          # Rebuild and re-init
```

Or use `./dev.sh --reset-db` to reset and reseed in one step.

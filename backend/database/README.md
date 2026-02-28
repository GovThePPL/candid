# Database

PostgreSQL 17 with pgvector extension for semantic similarity search.

## Schema Design

The schema supports the full Candid domain: users, positions, voting, chat, surveys, moderation, demographics, and Polis integration. Key tables include:

- **users** -- User accounts with role hierarchy (guest/normal/moderator/admin), diagnostics consent flag, phone verification, normalized email for anti-abuse
- **position / user_position** -- Position statements and per-user adoption
- **response** -- Agree/disagree/pass/chat votes on positions
- **chat_request / chat_log** -- Chat lifecycle and message storage (JSONB)
- **survey / survey_question / survey_question_option** -- Multi-question surveys with pairwise comparisons
- **report / mod_action** -- Content moderation pipeline with appeals
- **user_demographics** -- Demographics for group analytics
- **session / location** -- Session management and geography. `location` has a `deleted_at` column for soft-delete; deleted locations are preserved for FK references but filtered from all active queries
- **bug_report** -- User-submitted bug reports with optional device diagnostics
- **mf_training_log** -- Matrix factorization training audit log (per-conversation)

## Dockerfile Init Flow

Files in `/docker-entrypoint-initdb.d/` execute alphabetically on first container start:

1. `00a-create-keycloak-db.sql` -- Creates the Keycloak database
2. `01-schema.sql` -- Full Candid schema (all migrations rolled in, pre-production)
3. `02-basic-data.sql` -- Infrastructure seed: users, categories, locations, rules, surveys
4. `03-pairwise-data.sql` -- Pairwise survey questions and options

Polis has its own database container (`polis-db`) — see `backend/polis-integration/database/`.

Rich dev data (50 users, ~36 positions, chats, moderation) is created by `backend/scripts/seed_dev_data.py` via `./dev.sh`.

## Structure

```
database/
├── sql/
│   ├── schema.sql                        # Complete current schema (all pre-production migrations rolled in)
│   ├── migrate_category_to_session.sql   # Rename category → session throughout schema
│   ├── migrate_label_survey_phase.sql    # Add label survey phase to sessions
│   ├── migrate_pinned_posts.sql          # Add pinned posts support
│   ├── migrate_polis_phase.sql           # Add Polis phase tracking to sessions
│   ├── migrate_proposals.sql             # Add proposal posts and endorsement tables
│   ├── migrate_voting_results.sql        # Add voting results storage
│   ├── migrate_voting_round_candidate.sql # Add voting round candidate tracking
│   ├── migrate_proposal_methods.sql      # Add direct_proposal to proposal_method CHECK
│   ├── migrate_phone_verification.sql   # Add phone_number, phone_verified, normalized_email to users
│   ├── migrate_audit_log.sql            # Add audit_log table for admin/moderator action trail
│   ├── migrate_bridging_kudos.sql       # Add bridging kudos support
│   ├── migrate_chats_disabled.sql       # Add chats_disabled flag to sessions
│   ├── migrate_pinned_post_type.sql     # Add pinned post type tracking
│   ├── migrate_rule_post_types.sql      # Add rule post type constraints
│   └── migrate_stage_rename.sql         # Rename stages for consistency
├── migrations/
│   ├── run_migrations.sh          # Forward-only migration runner
│   ├── 001_initial.sql            # Baseline marker
│   ├── 002_avatar_nsfw_queue.sql  # Avatar NSFW processing queue
│   └── README.md
├── test_data/
│   ├── basic.sql         # Core seed data (users, categories, locations, rules)
│   └── pairwise_surveys.sql  # Pairwise survey data
└── Dockerfile            # postgres:17 + pgvector, copies init files
```

## Resetting

```bash
docker volume rm candid_postgres_data    # Remove Candid + Keycloak data
docker volume rm candid_polis_data       # Remove Polis data
docker compose up -d --build db polis-db # Rebuild and re-init
```

Or use `./dev.sh --reset-db` to reset both volumes and reseed in one step.

# Tests

Two test suites: **integration tests** (require Docker services) and **unit tests** (run standalone with mocks).

## Running

```bash
# Integration tests (require Docker services running)
docker compose up -d                                    # Start services first
python3 -m pytest backend/tests/ -v --ignore=backend/tests/unit  # All integration tests
python3 -m pytest backend/tests/test_auth.py -v         # Single file
python3 -m pytest backend/tests/ -v -m smoke            # Smoke tests only

# Unit tests (no Docker needed)
python3 -m pytest backend/tests/unit/ -v                # All unit tests
python3 -m pytest backend/tests/unit/ -v -m unit        # Unit marker only

# Coverage
python3 -m pytest backend/tests/unit/ --cov --cov-report=term-missing --cov-report=html

# Benchmarks
python3 -m pytest backend/tests/unit/ --benchmark-only -v
```

## Test Files

| File | Domain |
|------|--------|
| `test_auth.py` | Registration, login, token validation |
| `test_user_account.py` | Account management, deletion |
| `test_users_profile.py` | Profile CRUD, avatar |
| `test_users_settings.py` | User settings |
| `test_users_demographics.py` | Demographics data |
| `test_users_positions.py` | User position management |
| `test_positions.py` | Position CRUD, search, voting |
| `test_cards.py` | Card queue (positions, surveys, chat requests) |
| `test_categories.py` | Position categories |
| `test_locations.py` | Location hierarchy |
| `test_chats.py` | Chat requests, chat logs |
| `test_chat_events.py` | Real-time chat event delivery |
| `test_chat_matching.py` | Chat availability and matching logic |
| `test_chatting_list_extras.py` | Chatting list management |
| `test_surveys.py` | Survey CRUD and responses |
| `test_surveys_pairwise.py` | Pairwise survey comparisons |
| `test_surveys_results.py` | Survey result aggregation |
| `test_moderation.py` | Report queue, mod actions, appeals |
| `test_stats.py` | Statistics and analytics endpoints |
| `test_polis_integration.py` | Pol.is API integration |
| `test_bug_reports.py` | Bug report submission and diagnostics consent |
| `test_avatars.py` | Avatar serving endpoint |
| `test_auth_required.py` | Consolidated 401 checks for all protected endpoints (parametrized) |

## Unit Tests (`unit/`)

| File | Module Under Test | Description |
|------|-------------------|-------------|
| `test_pairwise_graph.py` | `pairwise_graph.py` | Graph algorithms: preference graph, transitive closure, Tarjan's SCC, ranked pairs, entropy |
| `test_cache_headers.py` | `cache_headers.py` | HTTP date parsing, ETag generation, conditional request handling |
| `test_auth.py` | `auth.py` | Role hierarchy, authorization, ban checking with Redis cache |
| `test_presence.py` | `presence.py` | Redis presence tracking: swiping, heartbeat, batch checks, likelihoods |
| `test_chat_availability.py` | `chat_availability.py` | Likelihood filtering, weighted random selection, notification eligibility |
| `test_config.py` | `config.py` | Config defaults, env var overrides, Dev/Prod subclasses |
| `test_keycloak.py` | `keycloak.py` | Role extraction, token validation, user creation, conflict handling |
| `test_nlp.py` | `nlp.py` | Embeddings, similarity, NSFW check, avatar processing, health check |
| `test_polis_client.py` | `polis_client.py` | Admin token caching, HTTP error handling, XID tokens, token clearing |
| `test_polis_sync.py` | `polis_sync.py` | XID generation, vote mapping, queue operations, time windows |
| `test_polis_worker.py` | `polis_worker.py` | Exponential backoff, status transitions, batch processing, queue stats |
| `test_push_notifications.py` | `push_notifications.py` | Statement truncation, Expo Push API formatting, daily counter |
| `test_chat_events.py` | `chat_events.py` | Redis pub/sub event structure, optional fields, error handling |
| `test_bug_reports.py` | `bug_reports_controller.py` | Bug report creation, diagnostics consent, input validation |
| `test_database.py` | `database.py` | Connection pool and query execution |
| `test_polis_scheduler.py` | `polis_scheduler.py` | Conversation lifecycle management |
| `test_redis_pool.py` | `redis_pool.py` | Shared Redis connection pool singleton behavior |
| `test_admin_helpers.py` | `admin_controller.py` | Role management helpers: authority location, approval peers, role changes, auto-approve |
| `test_moderation_helpers.py` | `moderation_controller.py` | Hierarchical appeal routing: content scope, actioner level, peer/escalation reviewers |

## Key Files

- `conftest.py` -- Shared fixtures and helpers for integration tests: API URL configuration, auth helpers, test user credentials, cleanup utilities
- `unit/conftest.py` -- Shared fixtures for unit tests: MockDB, MockRedis, MockConfig, path setup (syncs controllers to generated, mocks DB connections)
- `pytest.ini` (at repo root) -- Marker definitions (`smoke`, `mutation`, `unit`, `benchmark`)

## Conventions

- Integration tests are organized by API domain, one file per controller area
- Unit tests are organized by helper module, one file per module
- Fixtures in `conftest.py` handle login and provide authenticated sessions
- Tests that write to the database are marked with `@pytest.mark.mutation`
- Quick validation tests are marked with `@pytest.mark.smoke`
- Unit tests are marked with `@pytest.mark.unit`
- Performance benchmarks use `pytest-benchmark` and are marked with `@pytest.mark.benchmark`
- Authentication (401) tests are consolidated in `test_auth_required.py` — do not add individual `test_unauthenticated` methods in domain test files

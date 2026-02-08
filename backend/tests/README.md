# Tests

Integration test suite that runs against the live API. All tests use HTTP requests to the running Flask API server.

## Running

```bash
docker compose up -d                                    # Start services first
python3 -m pytest backend/tests/ -v                     # All tests
python3 -m pytest backend/tests/test_auth.py -v         # Single file
python3 -m pytest backend/tests/ -v -m smoke            # Smoke tests only
python3 -m pytest backend/tests/ -v -m "not mutation"   # Read-only tests
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

## Key Files

- `conftest.py` -- Shared fixtures and helpers: API URL configuration, auth helpers (`login_as`, `register_user`), test user credentials, cleanup utilities
- `pytest.ini` (at repo root) -- Marker definitions (`smoke`, `mutation`)

## Conventions

- Tests are organized by API domain, one file per controller area
- Fixtures in `conftest.py` handle login and provide authenticated sessions
- Tests that write to the database are marked with `@pytest.mark.mutation`
- Quick validation tests are marked with `@pytest.mark.smoke`

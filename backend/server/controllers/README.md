# Controllers

Custom controller implementations for the Flask API. These files are copied over the OpenAPI-generated stubs at build time.

## Structure

| Controller | Domain | Key Endpoints |
|------------|--------|---------------|
| `authentication_controller.py` | Auth | Register, login, social login (Google/Facebook) |
| `users_controller.py` | Users | Profile CRUD, settings, demographics, avatar, locations |
| `positions_controller.py` | Positions | Create/search/adopt positions, vote, report, closures |
| `cards_controller.py` | Card Queue | Get card stack (positions, surveys, chat requests, etc.) |
| `chat_controller.py` | Chat | Chat requests, chat logs, reporting, kudos |
| `chatting_list_controller.py` | Chatting List | Add/remove positions from chatting list |
| `surveys_controller.py` | Surveys | Survey CRUD, responses, pairwise rankings, crosstabs |
| `categories_controller.py` | Categories | Position categories, NLP-suggested categories |
| `stats_controller.py` | Statistics | Location-based stats, demographic breakdowns |
| `moderation_controller.py` | Moderation | Report queue, claims, actions, appeals, user history |
| `admin_controller.py` | Admin | Admin-only operations |
| `security_controller.py` | Security | JWT token validation for Connexion |

## Special Files

- `__init__.py` -- Flask app factory, database setup, CORS configuration
- `__main__.py` -- WSGI entry point (also copied to `generated/candid/`)
- `helpers/` -- Shared utilities (auth, database, Redis, Polis, etc.)

## Connexion First-Tag Routing

Connexion routes each endpoint to the controller matching the **first tag** in the OpenAPI spec. If an endpoint has `tags: [Chat, Users]`, Connexion uses `chat_controller.py` and ignores `users_controller.py`. When modifying controller logic, verify which controller Connexion actually routes to by checking tag order in `docs/api.yaml`.

## Workflow

1. Update `docs/api.yaml` with new/changed endpoints
2. Run `backend/server/build.sh` to regenerate stubs
3. Compare generated stubs in `generated/candid/controllers/` with your custom controllers
4. Update function signatures in the custom controllers to match
5. Implement the endpoint logic

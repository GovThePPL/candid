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
| `admin_controller.py` | Admin | Role management, approval workflow, locations, surveys |
| `posts_controller.py` | Posts | Create/list/update/delete posts, voting, locking |
| `comments_controller.py` | Comments | Create/list/update/delete comments, voting, Q&A auth |
| `moderation_controller.py` | Moderation | Report queue, claims, actions, appeals, user history, post/comment reports |
| `security_controller.py` | Security | JWT token validation for Connexion |

## Special Files

- `__init__.py` -- Flask app factory, database setup, CORS configuration
- `__main__.py` -- WSGI entry point (also copied to `generated/candid/`)
- `helpers/` -- Shared utilities (see Helper Modules section below)

## Connexion First-Tag Routing

Connexion routes each endpoint to the controller matching the **first tag** in the OpenAPI spec. If an endpoint has `tags: [Chat, Users]`, Connexion uses `chat_controller.py` and ignores `users_controller.py`. When modifying controller logic, verify which controller Connexion actually routes to by checking tag order in `docs/api.yaml`.

## Workflow

1. Update `docs/api.yaml` with new/changed endpoints
2. Run `backend/server/build.sh` to regenerate stubs
3. Compare generated stubs in `generated/candid/controllers/` with your custom controllers
4. Update function signatures in the custom controllers to match
5. Implement the endpoint logic

## Role & Authorization System

Candid uses a hierarchical, location-scoped role system. Roles live in the `user_role` table and are separate from `user_type` on `users` (which is only `'normal'` or `'guest'`).

### Role Hierarchy

```
Admin (location-scoped, inherits DOWN the location tree)
  └─ Moderator (location-scoped, inherits DOWN)
      └─ Facilitator (location + category scoped, NO inheritance)
          ├─ Assistant Moderator (location + category scoped)
          ├─ Expert (location + category scoped)
          └─ Liaison (location + category scoped)
```

Any role is satisfied by any role above it. Requiring `facilitator` is satisfied by `admin`, `moderator`, or `facilitator`.

### Scoping

Locations form a tree (e.g., `World → US → Oregon → Portland`).

- **Admin and Moderator** inherit **downward**. An admin at "US" has authority at "Oregon", "Portland", and all other US descendants.
- **Facilitator and below** have **no location inheritance**. A facilitator at "Oregon" has authority at exactly "Oregon".
- **Admin and Moderator** are location-only (no category). The DB enforces `position_category_id IS NULL`.
- **Facilitator and below** are location + category scoped. A facilitator at "Oregon" for "Education" is separate from "Oregon" for "Healthcare".
- **Root admin** (admin at the root location) is the superadmin. Required by `authorization_site_admin()` for system-wide operations.

Location ancestry is resolved with recursive CTEs (`get_location_ancestors`, `get_location_descendants` in `helpers/auth.py`), cached with a 5-minute TTL.

### Authorization Functions (`helpers/auth.py`)

| Function | Purpose |
|----------|---------|
| `authorization(level, token_info)` | Basic `user_type` check (`'normal'` vs `'guest'`). No role awareness. |
| `authorization_scoped(role, token_info, location_id, category_id)` | Primary role check. Walks hierarchy + location ancestors. If no `location_id`, checks any role anywhere. |
| `authorization_site_admin(token_info)` | Root admin only. For global operations (e.g. creating categories). |
| `authorization_allow_banned(level, token_info)` | Like `authorization()` but skips ban check. For profile, card queue, appeals. |
| `is_admin_at_location(user_id, location_id)` | Admin at this location or any ancestor. |
| `is_moderator_at_location(user_id, location_id)` | Moderator or admin at this location or any ancestor. |
| `is_facilitator_for(user_id, location_id, category_id)` | Facilitator at exact location+category. |
| `get_highest_role_at_location(user_id, location_id, category_id)` | User's most powerful role at a location. |
| `has_qa_authority(user_id, location_id, category_id)` | Check if user has a qualifying role for Q&A answers. |

### Role Assignment & Approval Workflow (`admin_controller.py`)

Role changes go through a request → review → apply pipeline.

**Who can assign what:**

| Assigner | Assignable Roles | Scope |
|----------|-----------------|-------|
| Admin | `admin`, `moderator`, `facilitator` | At their location or any descendant |
| Facilitator | `assistant_moderator`, `expert`, `liaison` | At their exact location + category |

**Request flow:**

1. Requester submits → `role_change_request` created (`status: 'pending'`)
2. `_find_approval_peer()` searches for eligible reviewers
3. Peer found → request waits; peers notified via push notification
4. No peer found → auto-approved immediately (`status: 'auto_approved'`)
5. Peer approves/denies → `status: 'approved'`/`'denied'`, `reviewed_by` set
6. After `ROLE_APPROVAL_TIMEOUT_DAYS` (default 7), pending requests auto-approve on next access

**Peer selection (`_find_approval_peer`)** finds reviewers who are not the requester:

- *Admin-assignable roles:* peer admin at requester's authority location → admin at target location → auto-approve
- *Facilitator-assignable roles:* peer facilitator at same location+category → location moderator → location admin → auto-approve

**Authority location:** `requester_authority_location_id` records where the requester's authority comes from. An admin at "US" assigning at "Oregon" has authority location "US". Peer selection uses this to find co-admins at the same level.

**Request statuses:**

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting peer review |
| `approved` | Peer approved, role change applied |
| `denied` | Peer denied, with optional `denial_reason` |
| `auto_approved` | No peer available or timeout expired, role change applied |
| `rescinded` | Requester withdrew the request |

### Database Tables

**`user_role`** — Active role assignments. Admin/moderator require `location_id`, forbid `position_category_id`. Facilitator and below require `location_id`, category optional. Unique indexes prevent duplicates (separate indexes for with/without category due to NULL handling).

**`role_change_request`** — Audit trail. Tracks action, target user, role, location, category, requester, authority location, reason, status, reviewer, denial reason, auto-approve deadline, and timestamps.

**`location`** — Self-referential tree (`parent_location_id`). Soft-deletable (`deleted_at`). Deleting reparents children to parent.

**`location_category`** — Maps which position categories are available at which locations.

### Frontend Mirror (`frontend/app/lib/roles.js`)

The frontend replicates the hierarchy and scoping logic for UI decisions:

| Function | Purpose |
|----------|---------|
| `hasRole(user, requiredRole)` | Checks hierarchy (mirrors `authorization_scoped`) |
| `getAssignableRoles(user)` | Roles the user can assign |
| `getAssignableLocations(user, role, allLocations)` | Location scope for a given role |
| `isAdminAtLocation(user, locationId, allLocations)` | Admin authority with descendant BFS |
| `canManageRoleAssignment(user, roleAssignment, allLocations)` | Can this user remove a specific assignment |

The frontend receives `user.roles[]` (array of `{role, locationId, positionCategoryId}`) from `GET /users/me`.

### Ban System

Separate from roles. `users.status = 'banned'` blocks all authorized endpoints except those using `authorization_allow_banned`. Temporary bans auto-expire via `mod_action_target.action_end_time`. Ban status is cached in Redis (60s TTL).

## Helper Modules (`helpers/`)

| Module | Purpose |
|--------|---------|
| `admin.py` | Admin-specific helpers (request log queries, organization management) |
| `auth.py` | Role-based authorization, location-scoped role checks, hierarchy walking, Q&A authority |
| `cache_headers.py` | HTTP cache header utilities |
| `card_builders.py` | Card queue construction helpers (position, survey, demographic cards) |
| `chat_availability.py` | Chat partner matching and availability logic |
| `chat_events.py` | WebSocket chat event handling |
| `config.py` | Dev/prod configuration loader |
| `constants.py` | Shared constants (limits, defaults, enums) |
| `database.py` | PostgreSQL connection pool wrapper (psycopg2, RealDictCursor, DatabaseError) |
| `geometry.py` | Geometric helpers (convex hull, centroid, coordinate transforms) |
| `ideological_coords.py` | PCA projection from Polis votes, lazy coord caching, blending with MF |
| `keycloak.py` | Keycloak OIDC token validation (RS256 JWKS), auto-registration |
| `matrix_factorization.py` | Community Notes-style MF on comment votes: SGD fitting, Polis regularization, DB I/O |
| `mf_worker.py` | Background daemon for periodic MF training with advisory-lock concurrency control |
| `moderation.py` | Moderation queue helpers (report aggregation, action resolution) |
| `nlp.py` | NLP service client for embeddings |
| `pairwise_graph.py` | Graph algorithms for pairwise survey ranking |
| `polis_client.py` | Polis API client (XID auth for participants, OIDC for admin) |
| `polis_scheduler.py` | Background scheduler for Polis sync jobs |
| `polis_sync.py` | Queue-based async sync of positions and votes to Polis |
| `polis_worker.py` | Worker thread for processing Polis sync queue |
| `presence.py` | User presence and swiping state tracking via Redis |
| `push_notifications.py` | Expo push notification delivery with quiet hours |
| `rate_limiting.py` | Sliding-window rate limiting using Redis sorted sets |
| `redis_pool.py` | Shared Redis connection pool |
| `scoring.py` | Wilson score, hot score, controversial score, vote weighting by ideological distance |
| `stats.py` | Stats computation helpers (opinion groups, vote distributions) |
| `user_mappers.py` | User object serialization helpers (profile, public view, admin view) |
| `user_summary.py` | Fetch user dict with fields needed for UserCard display (displayName, avatarIconUrl, trustScore, kudosCount) |

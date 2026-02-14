# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Candid is a chat platform for peaceful and productive discussion of issues of public concern. It's a monorepo with three Docker-orchestrated services: a Python Flask API backend, a PostgreSQL database, and a Pol.is integration for group opinion analysis.

## Development Commands

### Starting the environment
```bash
./dev.sh                      # Start all services, wait for readiness, seed if needed
./dev.sh --reset-db           # Reset DB volume, then start + reseed
./dev.sh --reset-all          # Reset DB + Redis volumes, then start + reseed (Polis data is in the DB)
./dev.sh --skip-seed          # Start services without running seed script
./dev.sh --seed-only          # Only run seed (services must already be up)
docker compose up -d --build  # Manual start (no auto-seed or health checks)
```

### Database
```bash
psql -h localhost -p 5432 -U user -d candid   # Connect (password: postgres)
docker volume rm candid_postgres_data          # Reset database (includes Polis data)
```

### Backend API
```bash
backend/server/build.sh       # Rebuild server locally from OpenAPI spec
# Requires: python3-pip, openapi-generator-cli, pipreqs
```

### Frontend
```bash
frontend/start.sh             # Regenerates API client, then starts Expo with tunnel
frontend/regenerate_api.sh    # Regenerate JS API client from OpenAPI spec only
```

### Key URLs (after docker compose up)
- Swagger UI: http://127.0.0.1:8000/api/v1/ui
- Polis API: http://localhost:5000/api/v3/
- Keycloak Admin: http://localhost:8180/admin (admin/admin)

## Architecture

### OpenAPI-First Development

The OpenAPI spec at `docs/api.yaml` is the source of truth. Both backend and frontend code are generated from it:

- **Backend**: `openapi-generator-cli` generates a Python Flask app into `backend/server/generated/`. Custom controller implementations in `backend/server/controllers/` are then copied over the generated stubs. When the spec changes, update the function signatures in `controllers/` to match the newly generated stubs in `generated/candid/controllers/`.
- **Frontend**: `openapi-generator-cli` generates a JavaScript API client into `frontend/api/`, which is npm-linked into `frontend/app/`.

### Backend (backend/server/)

Python Flask app using Connexion for OpenAPI routing. Controllers are organized by domain:

- `controllers/helpers/config.py` - Dev/prod configuration
- `controllers/helpers/database.py` - PostgreSQL connection wrapper (psycopg2, RealDictCursor)
- `controllers/helpers/keycloak.py` - Keycloak OIDC token validation (RS256 JWKS), auto-registration
- `controllers/helpers/auth.py` - Role-based authorization
- `controllers/__init__.py` - Flask app initialization, DB setup

Auth: `user_type` is only `'normal'` or `'guest'`. All privileged roles (admin, moderator, facilitator, etc.) are location-scoped in the `user_role` table with a hierarchical approval workflow. See `backend/server/controllers/README.md` for the full role system. Authorization returns 401 if unauthenticated, 403 if insufficient role.

Database access uses direct parameterized SQL queries (no ORM).

### Frontend (frontend/app/)

React Native app with Expo (v54) and Expo Router (file-based routing). Authentication via JWT tokens from the backend API. State management via React Context (`contexts/`). All API calls use the generated JavaScript client (`frontend/api/`) via `promisify` wrappers in `lib/api.js`.

#### Keyboard Handling

Keyboard avoidance must work on Expo Go (iOS/Android) and mobile web. The app uses **platform branching**: native `Keyboard` API on iOS/Android, `visualViewport` API on web. Reference implementations: `login.jsx` and `register.jsx` in `frontend/app/app/(auth)/`.

**Rules:**

- **Never use `KeyboardAvoidingView`** — causes layout re-centering bugs with `justifyContent: center`. The `behavior` prop is inconsistent across iOS/Android.
- **Platform branching is required** — React Native Web's `KeyboardAvoidingView` is a no-op stub, and `Keyboard` module events don't fire on web. Always branch on `Platform.OS === 'web'`.
- **`react-native-keyboard-controller`** is installed (bundled in Expo Go SDK 54+) but only works on native. Its `KeyboardAwareScrollView` scrolls to the focused input, not the submit button — use manual scroll for forms where the button must be visible. Useful for simpler screens where showing the focused input is sufficient.

**Native pattern (Expo Go):**

Use plain `ScrollView` with `Keyboard.addListener('keyboardDidShow'/'keyboardDidHide')`. Structure:
```
ScrollView (flexGrow: 1)
├── Centering wrapper (flex: 1, justifyContent: center, minHeight: measured)
│   ├── Logo/header
│   └── Form container (onLayout → track Y + height)
│       ├── Inputs
│       └── Submit button
├── Below-fold content (errors, nav links — outside centering wrapper)
└── Keyboard spacer (height: keyboardHeight, only when keyboard open)
```
- Lock `minHeight` on centering wrapper via `onLayout` when keyboard is closed — prevents collapse when keyboard spacer makes content exceed screen height.
- Scroll target: `formBottom - screenHeight + keyboardHeight + 20` (positions submit button 20px above keyboard).
- On keyboard hide: `scrollTo({ y: 0 })`.

**Web pattern (mobile browsers):**

Use `window.visualViewport` API (Chrome 62+, Safari 13+, Firefox 91+). Key requirements:
- Store `window.innerHeight` at mount as `initialHeight` — compare `visualViewport.height` against this stored value, NOT live `window.innerHeight`.
- Threshold: `initialHeight - vv.height > 150` filters address bar changes (~50-80px).
- **Firefox fires NO resize events on keyboard open**. `vv.height` doesn't update on the *first* open. You MUST use `focusin`/`focusout` listeners as the primary detection path, not a fallback. On `focusin`, immediately estimate keyboard height (40% of screen), render spacer, scroll. Poll `vv.height` every 100ms to refine with real value.
- **Firefox shrinks layout viewport** when keyboard opens, which shrinks ScrollView container. Set `minHeight` on `contentContainerStyle` to `initialHeight` to prevent content from shrinking with it.
- `focusout`: wait 300ms then check `vv.height` — reset if keyboard closed. Use `clearTimeout` to cancel pending focusout on new focusin (handles input switching).
- Separate scroll logic into a `useEffect` watching `keyboardHeight` state (ensures spacer has rendered before scrolling). Use 150-300ms delay before scroll on web.

**Other web notes:**
- `position: fixed; bottom: 0` is hidden behind keyboard on both iOS Safari and Chrome Android.
- `interactive-widget=resizes-content` meta tag fixes Chrome Android without JS (not supported in Safari).
- `100dvh` instead of `100vh` avoids address-bar overflow issues.
- Android `softwareKeyboardLayoutMode` defaults to `resize` (correct for manual scroll management).

#### Theme System (Light/Dark Mode)

The app supports light mode (default), dark mode, and system preference via `contexts/ThemeContext.js`. Light mode is the default because it promotes trust and readability for a civic discourse platform. All UI changes must work correctly in both themes:

- **Use theme tokens** from `constants/Colors.js` — never hardcode colors like `#FFFFFF` or `#333333` for backgrounds/text
- **Use `useThemeColors()` hook** + `createStyles(colors)` factory pattern in all components
- **Use `BrandColor`** (`#5C005C`) for surfaces with white text (card headers/footers) — it's theme-invariant
- **Use `badgeBg`/`badgeText`** for location badges and accent elements — these are solid in dark mode (translucent alpha backgrounds are invisible on dark surfaces)
- **Use `buttonDefault`/`buttonSelected`** for interactive pill buttons — these invert between themes (darker on select in light, lighter on select in dark)
- **Use `Theme` text styles** from `constants/Theme.js` — never hardcode font sizes (e.g., `fontSize: 14`) or colors directly in component styles. All text sizing and coloring should come from theme tokens.
- **WCAG contrast**: Text must meet AA (4.5:1 normal, 3:1 large). Placeholder/disabled text is exempt. Non-text UI components need 3:1
- **Test both themes** when modifying any component with colored elements

### Polis Integration (backend/polis-integration/)

Runs Pol.is as direct docker-compose services (`polis-server` and `polis-math`) with Keycloak OIDC for admin authentication. The `polis/` subdirectory is a git submodule from https://github.com/compdemocracy/polis.git. The Polis database (`polis-dev`) lives in the shared PostgreSQL container.

### Database (backend/database/)

PostgreSQL 17 with schema in `01-schema.sql` and test data in `02-basic-data.sql` (infrastructure-only: users, categories, locations, rules, surveys, and test-critical positions/chats). Rich dev data (50 generated users, ~36 positions with coherent voting, chats, moderation scenarios, demographics, pairwise data) is created by `backend/scripts/seed_dev_data.py`, which runs automatically via `./dev.sh`. After seeding, `normal4` is banned. Default test password for all seeded users is `password`.

## Docker Services and Ports

| Service | Port | Description |
|---------|------|-------------|
| api     | 8000 | Flask API server |
| db      | 5432 | PostgreSQL (Candid + Polis + Keycloak databases) |
| polis-server | 5000 | Polis API server |
| polis-math   | -    | Polis math/clustering worker |
| keycloak | 8180 | Keycloak OIDC provider |
| chat    | 8002 | WebSocket chat server |
| nlp     | 5001 | NLP embeddings service |
| redis   | 6379 | Redis pub/sub and presence |

## Prerequisites

- Docker (latest)
- Node.js/npm (for frontend development)
- openapi-generator-cli, pipreqs (for local backend builds)

## Future Work

- **Location-aware categories**: Filter position categories by location relevance (e.g., "Foreign Policy" doesn't apply to "Oregon"). Categories are currently a flat global list in `position_category`.
- **Polis roll-over script and automation**: Automate Polis conversation roll-over (creating new conversations, migrating data, relinking pairwise surveys). Currently requires manual steps via `backend/scripts/backfill_polis_positions.py`.
- **Position timeouts**: Implement expiration/archival of positions after a configurable time period.

## Development Workflow

### Planning Large Tasks

Before starting non-trivial multi-step tasks, write a plan to `.claude-plans/` (gitignored). Plans survive context resets and let work resume across sessions.

- **File naming**: `.claude-plans/YYYY-MM-DD_HH-MM_<short-title>.md` (e.g., `2026-02-09_14-30_dark-mode-migration.md`)
- **Contents**: Task description, step-by-step plan with checkboxes, key files involved, and any decisions made
- **Accessibility**: When planning UI features, include a step for screen-reader support (e.g., `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` on interactive elements)
- **Update as you go**: Mark steps complete (`[x]`) and add notes as work progresses
- **Check on startup**: At the beginning of a session, check `.claude-plans/` for any in-progress plans to resume

### README Maintenance

Each directory contains a README.md describing its purpose and structure. If you added, removed, or renamed files, or changed the design/structure of a directory, update its README.md to reflect the current state.

### Internationalization (i18n)

All user-facing strings in frontend components must use `t()` from `react-i18next` instead of hardcoded English. This includes:

- Visible text (button labels, placeholders, headings, empty states)
- `accessibilityLabel` and `accessibilityHint` values
- Alert/modal titles and messages

All translation keys must be added to both `en/` and `es/` locale files in `frontend/app/i18n/locales/`. Use the appropriate namespace (`common.json` for shared UI, or component-specific namespaces like `stats.json`, `settings.json`, `create.json`). Accessibility-only keys follow the `keyNameA11y` naming convention.

### Test-Driven Development

When planning a feature, design and create tests for it first. There are two test suites:

- **Unit tests** (`backend/tests/unit/`) — Fast, no Docker needed. All external calls (DB, Redis, HTTP) are mocked. One test file per helper module. Include unit tests for any new or modified helper logic.
- **Integration tests** (`backend/tests/`) — Hit live Docker services. One test file per API domain.

When modifying a backend helper in `controllers/helpers/`, always add or update the corresponding unit test file in `backend/tests/unit/`. Unit tests should cover pure logic, edge cases, and error handling paths. Integration tests cover end-to-end API behavior.

### Pre-Commit Checklist

Run through all of these before committing or pushing:

1. **Test coverage** — Ensure any logic added or changed since the last commit has appropriate tests. New backend helpers need unit tests in `backend/tests/unit/`. New or modified endpoints need integration tests in `backend/tests/`. New frontend components or behaviors need Jest tests in `frontend/app/__tests__/`.
2. **Internationalization** — Verify no hardcoded English strings were introduced since the last commit. Any new user-visible text and accessibility labels must use `t()` with keys in both `en/` and `es/` locale files.
3. **Accessibility** — Any interactive elements (`TouchableOpacity`, `Pressable`, `TextInput`, `Slider`, etc.) added since the last commit must have `accessibilityRole` and `accessibilityLabel` (using `t()` for i18n). New stateful controls need `accessibilityState`.
4. **Theme compliance** — Any colored elements added since the last commit use theme tokens from `useThemeColors()`, not hardcoded color values. Test in both light and dark mode.
5. **README updates** — If files were added, removed, or renamed since the last commit, update the directory's README.md.
6. **API spec sync** — If backend endpoints were added or changed since the last commit, ensure `docs/api.yaml` matches, then regenerate clients (`backend/server/build.sh` and `frontend/regenerate_api.sh`).
7. **REST best practices** — Check all API changes since the last commit conform to REST best practices.
8. **Run tests** — Run all test suites and confirm they pass:
   ```bash
   cd frontend/app && npx jest                                        # Frontend tests
   python3 -m pytest backend/tests/unit/ -v                           # Backend unit tests (no Docker)
   python3 -m pytest backend/tests/ -v --ignore=backend/tests/unit    # Backend integration tests (Docker required)
   ```

## Known Issues

### Connexion First-Tag Routing

Connexion routes each endpoint to the controller matching the **first tag** in the OpenAPI spec. If an endpoint has `tags: [Chat, Users]`, Connexion uses `chat_controller.py` and ignores `users_controller.py`. The OpenAPI generator still creates stubs in both controllers. To avoid dead code diverging from the live implementation:

1. **Prefer a single tag** per endpoint when possible.
2. If multiple tags are needed, **put the implementation in the first tag's controller** and don't maintain a copy in the others.
3. When modifying controller logic, verify which controller Connexion actually routes to by checking tag order in `docs/api.yaml`.

### API Spec Must Stay Accurate

The API spec at `docs/api.yaml` must accurately describe every field the backend returns. The generated JS client only deserializes fields defined in the spec — any fields missing from the spec will be silently dropped by the generated model's `constructFromObject`. **Never bypass the generated client with `response.body` or direct `fetch()` to work around missing fields.** Instead, add the missing fields to the spec and regenerate with `frontend/regenerate_api.sh`.

The one exception is the card queue endpoint (`GET /card-queue`), which uses `response.body` due to the oneOf discriminator bug described below. This is a generator limitation, not a spec issue.

### OpenAPI JavaScript Generator: oneOf Discriminator Bug

The OpenAPI JavaScript generator has a bug with `oneOf` discriminators — it checks if data matches *any* schema rather than using the discriminator field first. This is fixed by automated sed patches in `frontend/regenerate_api.sh` that run on every regeneration, patching all 6 `*CardItem.js` files to validate the discriminator `type` value first. The card queue endpoint in `lib/api.js` uses a custom callback with `response.body` to bypass the remaining deserialization issues with nested oneOf models.

# Codebase Refactoring Evaluation

## Context

Comprehensive assessment of technical debt and refactoring opportunities across the full Candid codebase (frontend, backend, infrastructure). The codebase is generally well-architected — no class components, consistent patterns, good test coverage. The issues below are scale-related (files growing too large) and boilerplate-related (repeated patterns), not fundamental design problems.

---

## Tier 1: High Impact, Low-Medium Effort

### 1. Split `chat/[id].jsx` (3,860 lines — largest file in codebase)

The chat screen is a single component with ~45 useState hooks, 15+ socket listeners, message rendering, input handling, reactions, definitions, explanations, and keyboard management all in one file.

**Split into:**
- `ChatScreen.jsx` — wrapper, navigation, modal state
- `ChatMessageList.jsx` — message rendering, scroll behavior
- `ChatInput.jsx` — input bar, keyboard handling, content size
- `useChatSession.js` — socket event listeners, message state, typing indicators
- `useChatEffects.js` — side effects (definitions, explanations, reactions API calls)

**Why now:** Every bug fix in chat (we've done 3 this session alone) requires navigating a 3,860-line file. Splitting improves debuggability and makes socket logic independently testable.

### 2. Extract `useFetch()` hook for data loading screens

20+ screens repeat identical loading/error/data state management:
```js
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)
const [data, setData] = useState(...)
useEffect(() => { api.method().then(setData).catch(setError).finally(...) }, [])
```

**Create:** `hooks/useFetch.js` — returns `{ data, loading, error, refetch }`
**Affected screens:** All settings, admin, stats, wiki screens

### 3. Consolidate `_get_user_card()` (4 duplicate implementations)

Identical function in 4 files:
- `positions_controller.py:38`
- `surveys_controller.py:23`
- `helpers/admin.py:32`
- `helpers/moderation.py:18`

**Fix:** Single implementation in `helpers/user_mappers.py`, imported everywhere.

### 4. Authorization decorator (119 repeated check patterns)

Every controller endpoint repeats:
```python
authorized, auth_err = authorization(..., token_info)
if not authorized:
    return auth_err, auth_err.code
```

**Create:** `@require_authorization(level)` decorator that handles this automatically.

---

## Tier 2: Medium Impact, Medium Effort

### 5. Split `CardQueueContent.jsx` (1,603 lines)

Handles card fetching, 10+ card type renderers, 6 modals, tutorial state, and animations.

**Split into:**
- `CardQueueContent.jsx` — container, modals, tutorial
- `cards/CardRenderer.jsx` — card type switching and display
- `hooks/useCardQueue.js` — fetch, pagination, filtering logic

### 6. Split `glossary_controller.py` (2,358 lines — largest backend file)

Currently handles 3 distinct domains: glossary terms, wiki pages, and image uploads.

**Split into:**
- `glossary_controller.py` — term CRUD, suggestions
- `wiki_controller.py` — wiki pages, edits, history, diffs
- Update `docs/api.yaml` tags accordingly

### 7. Split `admin_controller.py` (2,071 lines) and helpers

Controller handles roles, rules, surveys, organizations, locations, demographics — too many domains.

**Split `helpers/admin.py` (966 lines) into:**
- `helpers/admin_roles.py` — role assignment, approval workflow
- `helpers/admin_rules.py` — rule management
- `helpers/admin_surveys.py` — survey helpers

### 8. Split `api.js` (1,437 lines)

The frontend API layer has domain wrappers that follow a uniform pattern. Could be split into domain modules (`api/auth.js`, `api/users.js`, `api/positions.js`, etc.) with a facade `api.js` re-exporting them.

### 9. Transaction context manager for database.py

No explicit transaction grouping exists. Multi-step operations (role assignment + notification + audit) aren't atomic.

**Add:** `with db.transaction():` context manager for grouped commits/rollbacks.

---

## Tier 3: Lower Priority / Nice-to-Have

### 10. Split large admin screens
- `admin/rules.jsx` (1,585 lines) — extract `useRuleManagement()` hook
- `admin/organization.jsx` (1,414 lines) — extract `useOrganizationManagement()` hook

### 11. Split `helpers/moderation.py` (945 lines)
- Queue aggregation, appeal routing, and action resolution are distinct concerns

### 12. Fix N+1 queries in glossary endpoints
- Glossary term scope fetching loops over rows with individual queries
- Should use JOINs or array aggregates

### 13. Split `ModerationQueueContent.jsx` (1,254 lines) and `WysiwygEditor.jsx` (1,238 lines)

### 14. Code generation fragility
- `regenerate_api.sh` has 7 sed patches for CardItem oneOf discriminator bug
- Document these better and add post-generation validation

---

## What's Already Good (No Action Needed)

- **i18n**: 14 well-organized namespace files per language, en/es perfectly mirrored
- **Theme system**: Colors.js + Theme.js are clean and minimal
- **UserContext**: Already split into Auth/Chat/Navigation contexts
- **Test infrastructure**: 93 frontend + 42 backend unit + 37 backend integration test files
- **Database helper**: Clean connection pool with `execute_query()`
- **Docker infrastructure**: Well-organized with health checks
- **No deprecated patterns**: All modern React hooks, no class components

---

## Recommended Execution Order

If we proceed with refactoring, I'd recommend this order:

1. **Items 3-4** (backend duplication) — quick wins, low risk, improve every future controller change
2. **Item 2** (`useFetch` hook) — quick win, reduces boilerplate across 20+ screens
3. **Item 1** (chat screen split) — highest-value single change, improves daily development
4. **Items 5-6** (CardQueue + glossary splits) — medium effort, big readability wins
5. **Items 7-9** (admin split, api.js, transactions) — incremental improvements
6. **Tier 3 items** — as encountered during other work

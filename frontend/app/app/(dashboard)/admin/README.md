# Admin Routes

Admin panel screens for organization, user, survey, and rule management. Accessible to users with `facilitator`, `moderator`, or `admin` roles.

## Structure

```
admin/
├── _layout.jsx        # Stack navigator (headerless)
├── index.jsx          # Admin hub — role badges + menu (Organization, Request Log, Users, Surveys, Rules)
├── organization.jsx   # Combined location hierarchy + role management — edit locations, manage categories, assign/remove roles with user cards
├── request-log.jsx    # Audit log — three tabs: Needs Review, All Requests, My Requests
├── users.jsx          # User management — search, view moderation history, ban/unban
├── surveys.jsx        # Survey management — create standard (multiple choice) and pairwise (top preference) surveys
└── rules.jsx          # Rule management — create/edit/delete community rules with severity, content type, location/category scoping
```

## Organization

The Organization page merges the former separate Locations and Roles pages into a single hierarchical view:

- **Location hierarchy** is the primary structure, with depth communicated through typography (h2 → h3 → label) rather than indentation
- **Role holders** are displayed inline at each location as rich user cards (avatar with trust badge, display name, @username, role badge)
- **Per-location actions**: assign role, manage categories, add child location, edit, delete
- The user's highest-role location is expanded by default; all others collapsed

## Request Log

Replaces the former single-purpose pending-requests page with a full audit trail:

- **Needs Review** — pending requests the current user can approve/deny (peer-approval rules)
- **All Requests** — every request within the user's authority scope, all statuses
- **My Requests** — the current user's own submissions, with rescind for pending ones

Status-aware cards show requester, reviewer, timestamps, denial reasons, and auto-approve countdowns.

## Rules

Community rule management with the same peer-approval workflow as role assignments:

- **List view** with filters: location, status (active/inactive/all), content type (position/chat/post/comment)
- **Rule cards** display severity badge (color-coded 1-5), status badge, location/category scope, content type chips, and title/description
- **Create/Edit form** with severity picker, content type multi-select, location/category pickers, sentencing guidelines, and change reason
- **Delete** submits a deletion request through the peer-approval workflow
- Access control via `canManageRuleScope` — rules use the same location/category authority model as roles

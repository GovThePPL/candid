# Admin Routes

Admin panel screens for organization, user, and survey management. Accessible to users with `facilitator`, `moderator`, or `admin` roles.

## Structure

```
admin/
├── _layout.jsx        # Stack navigator (headerless)
├── index.jsx          # Admin hub — role badges + menu (Organization, Request Log, Users, Surveys)
├── organization.jsx   # Combined location hierarchy + role management — edit locations, manage categories, assign/remove roles with user cards
├── request-log.jsx    # Audit log — three tabs: Needs Review, All Requests, My Requests
├── users.jsx          # User management — search, view moderation history, ban/unban
└── surveys.jsx        # Survey management — create standard (multiple choice) and pairwise (top preference) surveys
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

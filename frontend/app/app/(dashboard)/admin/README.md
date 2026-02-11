# Admin Routes

Admin panel screens for role and location management. Accessible to users with `facilitator`, `moderator`, or `admin` roles.

## Structure

```
admin/
├── _layout.jsx        # Stack navigator (headerless)
├── index.jsx          # Admin hub — role badges + menu (Roles, Request Log, Locations)
├── roles.jsx          # Role assignment — search users, assign/remove roles
├── request-log.jsx    # Audit log — three tabs: Needs Review, All Requests, My Requests
└── locations.jsx      # Location management
```

## Request Log

Replaces the former single-purpose pending-requests page with a full audit trail:

- **Needs Review** — pending requests the current user can approve/deny (peer-approval rules)
- **All Requests** — every request within the user's authority scope, all statuses
- **My Requests** — the current user's own submissions, with rescind for pending ones

Status-aware cards show requester, reviewer, timestamps, denial reasons, and auto-approve countdowns.

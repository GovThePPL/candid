# Dashboard Routes

Main app screens behind authentication. All routes in this group are wrapped by `UserOnly`.

## Architecture

The dashboard uses a **Stack + Tabs** pattern:
- **Dashboard Stack** (`_layout.jsx`): Top-level Stack navigator with providers (`UserOnly`, `NotificationProvider`, `ToastProvider`). Handles deep links, chat auto-navigation.
- **Tabs** (`(tabs)/_layout.jsx`): 5 visible tabs (cards, discuss, wiki, stats, moderation). The `(tabs)` group is a route group — no URL segment is added.
- **Overlays**: Profile, settings, admin, notifications, chat, etc. push onto the dashboard Stack above the tabs.

Navigation patterns:
- Tab → overlay: `router.push('/profile')` — pushes onto dashboard Stack
- Overlay → post detail: `router.push('/post/123')` — pushes onto dashboard Stack, back returns to overlay
- Notification → tab content: `router.back()` then `router.navigate('/discuss/123')` — dismiss overlay, land in tab
- Back from overlay: `router.back()` — pops dashboard Stack
- Deep link: `router.navigate(href)` — traverses hierarchy to correct tab

Note: `/post/[id]` and `/discuss/[id]` render the same component. Use `/post/` when pushing
from overlays (profile, etc.) so back returns to the overlay. Use `/discuss/` for in-tab
navigation where back should return to the discuss feed.

## Structure

```
(dashboard)/
├── _layout.jsx                # Dashboard Stack — providers, deep links, chat auto-nav
├── (tabs)/                    # Tab group (no URL segment)
│   ├── _layout.jsx            # Tabs navigator (4 visible tabs)
│   ├── cards.jsx              # Card queue — swipeable card stack
│   ├── stats.jsx              # Statistics dashboard — opinion groups, surveys
│   ├── moderation.jsx         # Moderation queue — flagged content review
│   ├── discuss/               # Discussion forum (nested Stack)
│   │   ├── _layout.jsx        # Stack navigator (headerless)
│   │   ├── index.jsx          # Post feed with tabs and filters
│   │   ├── create.jsx         # Create new discussion post
│   │   └── [id].jsx           # Post detail with threaded comments
│   └── wiki/                  # Wiki knowledgebase (nested Stack)
│       ├── _layout.jsx        # Stack navigator (headerless)
│       ├── index.jsx          # Wiki list (pages + terms tabs)
│       ├── [...slug].jsx      # Wiki page detail
│       ├── glossary/
│       │   └── [slug].jsx     # Glossary term detail
│       ├── suggestions.jsx    # Wiki suggestions list (my + review)
│       ├── suggestion-form.jsx # Create/edit wiki suggestion form
│       ├── history.jsx        # Version history list (page or term)
│       └── version.jsx        # Version detail with diff view
├── profile.jsx                # Own profile overlay (4 tabs: positions, posts, comments, chats)
├── user/                      # Public profile by username
│   └── [username].jsx         # Public profile (2 tabs: posts, comments)
├── setup-profile.jsx          # First-time profile setup
├── admin/                     # Admin panel (see admin/README.md)
├── post/                      # Post detail overlay (re-exports discuss/[id])
│   ├── _layout.jsx            # Stack navigator (headerless)
│   └── [id].jsx               # Post detail — used when pushing from overlays
├── chat/                      # Chat screens
│   ├── _layout.jsx            # Stack navigator (headerless)
│   └── [id].jsx               # Individual chat conversation
├── notifications/             # Notification inbox
│   ├── _layout.jsx            # Stack navigator (headerless)
│   └── index.jsx              # Notification list with deep linking
├── position-closures/         # Position closure details
│   ├── _layout.jsx            # Stack navigator (headerless)
│   └── [id].jsx               # Closure detail
└── settings/                  # User settings
    ├── _layout.jsx            # Stack navigator (headerless)
    ├── index.jsx              # Settings hub
    ├── account.jsx            # Account settings
    ├── activity.jsx           # Redirect to /profile
    ├── demographics.jsx       # Demographic info editing
    ├── notifications.jsx      # Notification preferences
    ├── preferences.jsx        # App preferences (theme, language)
    └── profile.jsx            # Profile editing
```

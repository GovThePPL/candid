# Dashboard Routes

Main app screens behind authentication. All routes in this group are wrapped by `UserOnly`.

## Structure

```
(dashboard)/
├── _layout.jsx            # Dashboard layout — drawer with sidebar, bottom tab bar, notification badge
├── cards.jsx              # Card queue — swipeable card stack (positions, surveys, notifications)
├── chats.jsx              # Redirect to /profile
├── create.jsx             # Redirect to /profile
├── moderation.jsx         # Moderation queue — flagged content review for moderators
├── profile.jsx            # User profile — avatar, display name, admin shortcut, 4 content tabs (Positions, Posts, Comments, Chats)
├── setup-profile.jsx      # First-time profile setup (display name, avatar, demographics)
├── stats.jsx              # Statistics dashboard — opinion groups, surveys, position closures
├── admin/                 # Admin panel (see admin/README.md)
├── chat/                  # Chat screens
│   ├── _layout.jsx        # Stack navigator (headerless)
│   └── [id].jsx           # Individual chat conversation
├── discuss/               # Discussion forum
│   ├── _layout.jsx        # Stack navigator (headerless)
│   ├── index.jsx          # Post feed with tabs (Hot, New, Top) and filters
│   ├── create.jsx         # Create new discussion post
│   └── [id].jsx           # Post detail with threaded comments
├── notifications/         # Notification inbox
│   ├── _layout.jsx        # Stack navigator (headerless)
│   └── index.jsx          # Notification list with mark-read and real-time updates
├── position-closures/     # Position closure details
│   ├── _layout.jsx        # Stack navigator (headerless)
│   └── [id].jsx           # Closure detail — final stats, group breakdown, agreed statements
└── settings/              # User settings
    ├── _layout.jsx        # Stack navigator (headerless)
    ├── index.jsx          # Settings hub — menu items linking to sub-pages
    ├── account.jsx        # Account settings (email, password)
    ├── activity.jsx       # Redirect to /profile
    ├── demographics.jsx   # Demographic info editing
    ├── notifications.jsx  # Notification preferences (push, email, mute)
    ├── preferences.jsx    # App preferences (theme, language)
    └── profile.jsx        # Profile editing (display name, bio, avatar)
```

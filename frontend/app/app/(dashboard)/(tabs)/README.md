# Tabs Group

Route group containing the 4 main tab screens. The `(tabs)` directory is a route group — the parentheses mean it adds no URL segment, so `/cards` and `/discuss/123` keep their URLs.

## Layout

`_layout.jsx` renders a `<Tabs>` navigator with:
- 4 visible tabs: Cards, Discuss, Stats, Moderation
- Mod queue badge count (fetched on mount)
- Moderation tab hidden for non-moderator users
- Discuss tab bar hiding when navigated to a sub-screen (create, post detail)
- Web accessibility: blurs active element on tab focus for aria-hidden

## Screens

| File | Route | Description |
|------|-------|-------------|
| `cards.jsx` | `/cards` | Swipeable card queue (positions, surveys, chat requests) |
| `stats.jsx` | `/stats` | Statistics dashboard with opinion groups and surveys |
| `moderation.jsx` | `/moderation` | Moderation queue for flagged content (moderator-only) |
| `discuss/` | `/discuss` | Discussion forum with nested Stack (feed, create, post detail) |

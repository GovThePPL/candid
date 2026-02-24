# Tabs Group

Route group containing the 4 main tab screens. The `(tabs)` directory is a route group — the parentheses mean it adds no URL segment, so `/cards` and `/discuss/123` keep their URLs.

## Layout

`_layout.jsx` renders a `<Tabs>` navigator with:
- 5 visible tabs: Cards, Discuss, Wiki, Stats, Moderation
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
| `wiki/` | `/wiki` | Wiki knowledgebase with nested Stack (list, articles, glossary, suggestions, history) |

## Wiki Stack

```
wiki/
├── _layout.jsx           # Stack navigator for wiki screens
├── index.jsx             # Wiki page list
├── [...slug].jsx         # Wiki article detail (catch-all for nested slugs)
├── glossary/
│   └── [slug].jsx        # Glossary term detail
├── suggestion-form.jsx   # Create/edit wiki suggestion
├── suggestions.jsx       # List of wiki suggestions with detail/approve views
├── history.jsx           # Revision history for a wiki page
└── version.jsx           # Single revision detail with diff view
```

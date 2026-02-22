# Candid TODO

## Authentication & Identity
- Social login (Google, Apple, etc.)
- Configure Keycloak SMTP (prerequisite for password reset and email verification)
- Password reset
- Make email required?
- Require phone number for sign-up -- explore other user de-duplication options, consider cost of sending messages
- Captcha on sign-up
- ~~Send user back to login screen when token expires and refresh fails~~

## Security
- Implement bot detection system
- Captcha cards when necessary (triggered by suspicious behavior)
- Only allow responses to items sent in the card queue (outside of dev mode)
- ~~Add toxicity checks and cooldown to chat~~
- ~~API rate limiting with backoff~~
- Anti-gaming features
- ~~Only allow one report per user per item~~

## Trust System
- ~~Design and implement whole trust system~~
- Take trust into account in chat matching

## Positions & Categories
- Location-aware categories — filter categories by location relevance
- Statement merge tool — NLP-assisted similarity surfacing for moderators/facilitators to merge near-duplicate position statements. All statements enter the vote pool by default; moderators review NLP-suggested candidates (high cosine similarity threshold to minimize false positives) and merge manually. Votes consolidate onto the surviving statement, merged statement is retired from Polis, submitters are notified that their statement was merged, and users can appeal the merge (which unmerges and flags for facilitator review)

## Card Queue
- Donation cards
- Map Reveal Requests — mutual-consent sharing of opinion map positions between users. Swipeable card to accept/decline, partner management modal on stats page, revocation support. See [plan](.claude/plans/radiant-skipping-fox.md)

## Kudos Spending & Awards
- Kudos spending — let users spend earned kudos to award comments/posts (three tiers: Good Faith, Thoughtful, Bridge Builder), promote agreed chat statements as inspirational cards, and boost chat likelihood for 24 hours. Includes anti-gaming measures (per-pair daily limits, substantive discussion checks, ideological distance weighting, diminishing returns, reciprocity blocking, same-group discounts). Awards add phantom weighted upvotes to content scores. See [plan](.claude-plans/2026-02-20_14-00_kudos-spending-awards.md)

## Chat Fixes and Enhancements
- ~~Basic markdown support in chat~~
- ~~Quoting another user's comment~~
- ~~Option selection emojis~~
- ~~Define message type~~
- ~~Restore quotes~~
- ~~Add emoji reactions~~
- Make chat connection more robust
- Address users disappearing from chat
- Improve agreed position layout

## Admin Page
- ~~Admin CRUD for community rules — create, edit, and delete rules, and set each rule's context (positions, chat, etc.)~~
- Other admin-specific features

## Guest Access
- Allow guests to swipe cards but only store responses locally
- Limit number of cards guests can swipe on
- New sign-up option to convert guest to full account (retain local data)

## Tutorial
- Card-based tutorial that walks user through each swipe action

## Moderation
- Fetch moderation queue one item at a time instead of the full queue — claimed reports are locked for 15 minutes and hidden from other moderators, so bulk-fetching unnecessarily locks items that may not be reviewed in time
- ~~Implement comment and post reporting — the three-dot menu on comments has a Report button (currently no-op). Needs: backend endpoint for reporting comments/posts, reason picker, and integration with the existing moderation queue~~
- Comment moderation actions — ~~delete comments~~, ~~lock comment threads~~, ~~pin comments~~
- ~~Fix assistant moderator permissions for admin page and ensure they have access to the moderation queue in their category~~
- Banned words list rule type — content containing banned words is blocked at creation time, applied per rule scope (positions, chat, posts, comments)

## Discuss
- Show detailed score calculation option for comments
- @mention tagging in posts and comments — `@username` mentions individual users, `@expert` mentions an expert with category-specific expertise. Limit of 3 tagged users per post/comment. Tagged users receive notifications
- Pin up to 3 posts per location/category — pinned posts float to top of feed with "move pinned post to top" reordering

## Wiki & Glossary
- Edit & Approve two-version history — when a reviewer modifies a suggestion before approving, create two version entries (one for the submitter's original changes, one for the reviewer's modifications) so reviewer edits are visible in version history. Also fix `edited_by` attribution on edit suggestions. See [plan](.claude-plans/2026-02-22_15-00_wiki-edit-approve-two-versions.md)
- Scope expression tree — replace flat scopes + single AND/OR operator with recursive boolean expression tree (nested AND/OR groups) for wiki terms and pages. Enables expressions like "Oregon AND (Education OR Healthcare)". JSONB storage, recursive evaluator, query-builder UI component, backward-compatible migration. See [plan](.claude-plans/2026-02-22_14-00_scope-expression-tree.md)

## Frontend Improvements
- UGC Translation — runtime translation of user-generated content (positions, chat messages, surveys). See [plan](.claude-plans/2026-02-10_ugc-translation.md)
- ~~Move settings menu to replace user profile picture in top bar~~
- Audit back button usage on web — make it close open modals instead of navigating away

## Infrastructure
- Will eventually need frontend web servers
- Migrate to Kubernetes?
- Polis math worker Python reimplementation — replace the Clojure math worker (~6,200 lines) with Python using NumPy. 146 branches across 7 core modules, 27 test cases for 100% branch coverage, golden snapshot validation against Clojure output. See [plan](.claude-plans/2026-02-17_polis-math-python-reimplementation.md)

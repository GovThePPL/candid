# Candid TODO

## Authentication & Identity
- Social login (Google, Apple, etc.)
- Configure Keycloak SMTP (prerequisite for password reset and email verification)
- Password reset
- Make email required?
- Require phone number for sign-up -- explore other user de-duplication options, consider cost of sending messages
- Captcha on sign-up

## Security
- Majority vote role approval — replace single-peer approval with majority vote from eligible admins/moderators/facilitators at the authority level. 7-day voting window, role suspension during revocation votes, tie = denied. Prevents single bad actor from unilaterally granting/revoking roles. See [plan](.claude-plans/2026-02-27_role-approval-majority-vote.md)
- Implement bot detection system
- Captcha cards when necessary (triggered by suspicious behavior)
- Only allow responses to items sent in the card queue (outside of dev mode)
- Anti-gaming features

## Trust System
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
- Make chat connection more robust
- Address users disappearing from chat
- Improve agreed position layout

## Admin Page
- Other admin-specific features

## Guest Access
- Allow guests to swipe cards but only store responses locally
- Limit number of cards guests can swipe on
- New sign-up option to convert guest to full account (retain local data)

## Tutorial
- Card-based tutorial that walks user through each swipe action

## Moderation
- Fetch moderation queue one item at a time instead of the full queue — claimed reports are locked for 15 minutes and hidden from other moderators, so bulk-fetching unnecessarily locks items that may not be reviewed in time
- Banned words list rule type — content containing banned words is blocked at creation time, applied per rule scope (positions, chat, posts, comments)

## Discuss
- Show detailed score calculation option for comments
- @mention tagging in posts and comments — `@username` mentions individual users, `@expert` mentions an expert with category-specific expertise. Limit of 3 tagged users per post/comment. Tagged users receive notifications
- Pin up to 3 posts per location/category — pinned posts float to top of feed with "move pinned post to top" reordering

## Wiki & Glossary
- Scope expression tree — replace flat scopes + single AND/OR operator with recursive boolean expression tree (nested AND/OR groups) for wiki terms and pages. Enables expressions like "Oregon AND (Education OR Healthcare)". JSONB storage, recursive evaluator, query-builder UI component, backward-compatible migration. See [plan](.claude-plans/2026-02-22_14-00_scope-expression-tree.md)

## Frontend Improvements
- UGC Translation — runtime translation of user-generated content (positions, chat messages, surveys). See [plan](.claude-plans/2026-02-10_ugc-translation.md)
- Audit back button usage on web — make it close open modals instead of navigating away

## Infrastructure
- Will eventually need frontend web servers
- Migrate to Kubernetes?
- Polis math worker Python reimplementation — replace the Clojure math worker (~6,200 lines) with Python using NumPy. 146 branches across 7 core modules, 27 test cases for 100% branch coverage, golden snapshot validation against Clojure output. See [plan](.claude-plans/2026-02-17_polis-math-python-reimplementation.md)

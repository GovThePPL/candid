# Candid TODO

## Authentication & Identity
- Social login (Google, Apple, etc.)
- Configure Keycloak SMTP (prerequisite for password reset and email verification)
- Password reset
- Make email required?
- Require phone number for sign-up -- explore other user de-duplication options, consider cost of sending messages
- Captcha on sign-up

## Security
- Implement bot detection system
- Captcha cards when necessary (triggered by suspicious behavior)
- Only allow responses to items sent in the card queue (outside of dev mode)
- Add toxicity checks and cooldown to chat
- API rate limiting with backoff
- Anti-gaming features
- Only allow one report per user per item

## Trust System
- Design and implement whole trust system
- Take trust into account in chat matching

## Positions & Categories
- Location-aware categories — filter categories by location relevance

## Card Queue
- Donation cards

## Chat Fixes and Enhancements
- Basic markdown support in chat
- Quoting another user's comment
- Option selection emojis
- Define message type
- Restore quotes
- Add emoji reactions
- Make chat connection more robust
- Address users disappearing from chat
- Improve agreed position layout

## Admin Page
- Admin CRUD for community rules — create, edit, and delete rules, and set each rule's context (positions, chat, etc.)
- Other admin-specific features

## Guest Access
- Allow guests to swipe cards but only store responses locally
- Limit number of cards guests can swipe on
- New sign-up option to convert guest to full account (retain local data)

## Tutorial
- Card-based tutorial that walks user through each swipe action

## Moderation
- Fetch moderation queue one item at a time instead of the full queue — claimed reports are locked for 15 minutes and hidden from other moderators, so bulk-fetching unnecessarily locks items that may not be reviewed in time

## Frontend Improvements
- UGC Translation — runtime translation of user-generated content (positions, chat messages, surveys). See [plan](.claude-plans/2026-02-10_ugc-translation.md)

## Infrastructure
- Will eventually need frontend web servers
- Migrate to Kubernetes?

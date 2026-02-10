# Candid TODO

## Authentication & Identity
- Social login (Google, Apple, etc.)
- Configure Keycloak SMTP (prerequisite for password reset and email verification)
- Password reset
- Make email required?
- Require phone number for sign-up -- explore other user de-duplication options, consider cost of sending messages
- Captcha on sign-up
- Require location on sign-up

## Security
- Implement bot detection system
- Captcha cards when necessary (triggered by suspicious behavior)
- Only allow responses to items sent in the card queue (outside of dev mode)
- Add toxicity checks and cooldown to chat

## Trust System
- Design and implement whole trust system
- Take trust into account in chat matching

## Positions & Categories
- Location-aware categories — filter categories by location relevance

## Card Queue
- Donation cards

## Chat Fixes and Enhancements
- Basic markdown support in chat
- Restore quotes
- Add emoji reactions
- Make chat connection more robust
- Address users disappearing from chat
- Improve agreed position layout

## Admin Page
- Unban user
- Create surveys including group label surveys
- Modify rules
- Promote users
- Other admin-specific features

## Guest Access
- Allow guests to swipe cards but only store responses locally
- Limit number of cards guests can swipe on
- New sign-up option to convert guest to full account (retain local data)

## Tutorial
- Card-based tutorial that walks user through each swipe action

## Frontend Improvements
- UGC Translation — runtime translation of user-generated content (positions, chat messages, surveys). See [plan](.claude-plans/2026-02-10_ugc-translation.md)
- Language drop-down menu

## Infrastructure
- Will eventually need frontend web servers
- Migrate to Kubernetes?

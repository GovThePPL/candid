# Candid TODO

## Authentication & Identity
- OIDC/OAuth2 integration
- Password reset
- Make email required?
- Require phone number for sign-up -- explore other user de-duplication options, consider cost of sending messages
- Captcha on sign-up

## Security
- Implement bot detection system
- Captcha cards when necessary (triggered by suspicious behavior)
- Only allow responses to items sent in the card queue (outside of dev mode)
- Add toxicity checks and cooldown to chat

## Trust System
- Design and implement whole trust system
- Take trust into account in chat matching

## Card Queue
- Chat request card should be next in queue when on card queue page
- Should jump to top when user is on other pages
- Stop cards page from fetching card queue with every swipe
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
- Other admin-specific features

## Guest Access
- Allow guests to swipe cards but only store responses locally
- Limit number of cards guests can swipe on
- New sign-up option to convert guest to full account (retain local data)

## Tutorial
- Card-based tutorial that walks user through each swipe action

## Frontend Improvements
- Bug report endpoint from user sidebar menu
- Merge profile and settings page
- Search for position on stats page
- Dark mode
- Accessibility
- Internationalization

## NLP / Matching
- NLP position matching should only return results over 50% match
- Improve pairwise comparison algorithm for more meaningful matchups

## Unit Tests
- Add unit tests for backend controllers and helpers (complement existing integration tests)

## Infrastructure
- Remove any hard-coded IPs/Ports
- ~~Move Polis out of docker-in-docker~~ (done — now runs as direct docker-compose services)
- Will eventually need frontend web servers
- Migrate to Kubernetes?

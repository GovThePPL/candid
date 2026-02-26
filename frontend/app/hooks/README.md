# Hooks

Custom React hooks used across the app.

| Hook | Purpose |
|------|---------|
| `useAdminSessions.js` | Dedicated admin sessions page: fetch, create, advance stages, label surveys |
| `useCardHandlers.js` | Card queue swipe action handlers (agree, disagree, pass, chat request) |
| `useChatHistory.js` | Chat history pagination and loading |
| `useKeyboardHeight.js` | Cross-platform keyboard height detection (native + web) |
| `useModerationQueue.js` | Moderation queue fetching, filtering, and action dispatch |
| `usePositionManagement.js` | Position list management with search and pagination |
| `useRoleAssignment.js` | Admin role assignment and approval workflows |
| `useSurveyForm.js` | Survey creation/editing form state and validation |
| `useCommentThread.js` | Comment thread state: fetch, tree build, sort, collapse, vote, create |
| `useModerateChecker.js` | Per-item moderation scope checker using cached location tree |
| `useNotifications.js` | Notification inbox state: fetch, cursor pagination, mark read, real-time prepend |
| `usePostsFeed.js` | Paginated post feed with sort, filter, and optimistic upvote |
| `useProposalWizard.js` | Proposal wizard state: step navigation, AI-assisted drafting, template definitions |
| `useToxicityCheck.js` | Pre-send toxicity check with ReconsiderModal integration (checkAndSend + modalProps) |
| `useModalBackHandler.js` | Web-only hook that integrates modal visibility with browser history and Escape key |
| `useThemeColors.js` | Theme-aware color tokens from `ThemeContext` |
| `useUser.js` | Current user state, refresh, and auth status from `UserContext` |
| `useIsDesktop.js` | Reactive desktop breakpoint hook (>= 1024px) using `useWindowDimensions` |

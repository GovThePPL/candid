# Hooks

Custom React hooks used across the app.

| Hook | Purpose |
|------|---------|
| `useCardHandlers.js` | Card queue swipe action handlers (agree, disagree, pass, chat request) |
| `useCategoryManagement.js` | Admin category CRUD with optimistic updates |
| `useChatHistory.js` | Chat history pagination and loading |
| `useKeyboardHeight.js` | Cross-platform keyboard height detection (native + web) |
| `useModerationQueue.js` | Moderation queue fetching, filtering, and action dispatch |
| `usePositionManagement.js` | Position list management with search and pagination |
| `useRoleAssignment.js` | Admin role assignment and approval workflows |
| `useSurveyForm.js` | Survey creation/editing form state and validation |
| `usePostsFeed.js` | Paginated post feed with sort, filter, and optimistic upvote |
| `useThemeColors.js` | Theme-aware color tokens from `ThemeContext` |
| `useUser.js` | Current user state, refresh, and auth status from `UserContext` |

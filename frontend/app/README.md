# Frontend App

React Native application source code, organized by Expo conventions.

## Structure

```
app/
├── app/              # Expo Router file-based routes
├── components/       # Reusable React Native components
├── contexts/         # React Context providers (global state)
├── constants/        # Theme, colors, shared styles
├── hooks/            # Custom React hooks
├── lib/              # Utility libraries (API, WebSocket, cache, etc.)
├── assets/           # Images and static files
├── package.json      # Dependencies (Expo v54, React Native)
├── babel.config.js   # Babel configuration
└── metro.config.js   # Metro bundler configuration
```

## Architecture

- **Routing:** Expo Router with file-based routes in `app/`
- **State:** `UserContext` in `contexts/` manages auth, user data, and chat state
- **API:** Generated JS client wrapped with `promisify()` in `lib/api.js`
- **Real-time:** Socket.IO client in `lib/socket.js` for chat messaging
- **Styling:** Themed components using `constants/Colors.js` and `constants/Theme.js`

## Auth Flow

1. App mounts -> `UserProvider` checks AsyncStorage for saved token/user
2. Routes split into `(auth)` group (login/register, guarded by `GuestOnly`) and `(dashboard)` group (main app, guarded by `UserOnly`)
3. On login -> token saved, WebSocket connected, navigates to dashboard
4. On logout -> storage cleared, socket disconnected, navigates to login

# Frontend

React Native application built with Expo (v54) and Expo Router for file-based routing.

## Structure

```
frontend/
├── app/                  # Application source code
├── regenerate_api.sh     # Regenerate JS API client from docs/api.yaml
├── start.sh              # Regenerate API client + start Expo dev server
└── openapitools.json     # OpenAPI generator configuration
```

## Getting Started

```bash
frontend/start.sh         # Regenerate API client, npm link, start Expo
```

This script:
1. Runs `regenerate_api.sh` to generate the JS API client from `docs/api.yaml`
2. Sets up npm linking between `frontend/api/` and `frontend/app/`
3. Starts the Expo development server with tunnel mode

Download Expo Go on your phone and scan the QR code to open the app.

## API Client Generation

The JavaScript API client in `frontend/api/` (gitignored) is generated from `docs/api.yaml`:

```bash
frontend/regenerate_api.sh    # Regenerate only
```

After regeneration, you must re-run npm linking:
```bash
cd frontend/api && npm link && cd ../app && npm link ../api/
```

The regeneration script also applies sed patches to fix the oneOf discriminator bug in generated `*CardItem.js` files.

## Key Architecture

- **Expo Router** for file-based routing with (auth) and (dashboard) route groups
- **React Context** (`UserContext`) for global auth state and user data
- **Generated API client** via `promisify` wrappers in `lib/api.js`
- **Socket.IO** for real-time chat via `lib/socket.js`
- **Hybrid caching** (in-memory + AsyncStorage) via `lib/cache.js`

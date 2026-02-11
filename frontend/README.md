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
frontend/start.sh         # Regenerate API client, detect host IP, start Expo
frontend/start.sh -v      # Same, with full regeneration output
frontend/start.sh -h      # Show all options and env overrides
```

This script:
1. Auto-detects the host IP for Expo Go on physical devices (WSL2-aware)
2. Sets `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CHAT_URL`, and `EXPO_PUBLIC_KEYCLOAK_URL`
3. Runs `regenerate_api.sh` to generate the JS API client from `docs/api.yaml`
4. Prints a summary banner with service URLs and any WSL2 warnings
5. Starts the Expo development server with tunnel mode on port 3001

Download Expo Go on your phone and scan the QR code to open the app.

### WSL2 Setup

On WSL2, Docker ports aren't directly reachable from the LAN. The script detects this and prints the required `netsh portproxy` commands. One-time setup in an **admin PowerShell**:

```powershell
# Port forwarding (WSL2 IP changes on reboot — start.sh prints updated commands)
netsh interface portproxy set v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=<WSL2_IP>
netsh interface portproxy set v4tov4 listenport=8002 listenaddress=0.0.0.0 connectport=8002 connectaddress=<WSL2_IP>
netsh interface portproxy set v4tov4 listenport=8180 listenaddress=0.0.0.0 connectport=8180 connectaddress=<WSL2_IP>
netsh interface portproxy set v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=<WSL2_IP>

# Firewall rule (once)
New-NetFirewallRule -DisplayName 'Candid Dev Ports' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000,8002,8180,3001
```

Also ensure your Wi-Fi network profile is set to **Private** (Public blocks inbound).

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
- **i18n** via i18next + react-i18next with English and Spanish locales (9 namespaces). Language picker on login, register, and settings screens. `I18nContext` persists preference to AsyncStorage.
- **Generated API client** via `promisify` wrappers in `lib/api.js`
- **Socket.IO** for real-time chat via `lib/socket.js`
- **Hybrid caching** (in-memory + AsyncStorage) via `lib/cache.js`

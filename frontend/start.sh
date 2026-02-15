#!/bin/bash
# Resolve the directory this script lives in (frontend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse flags
VERBOSE=false
for arg in "$@"; do
    case "$arg" in
        -v|--verbose) VERBOSE=true ;;
        -h|--help)
            echo "Usage: ./start.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose  Show full output from API regeneration and npm install"
            echo "  -h, --help     Show this help message"
            echo ""
            echo "Environment overrides:"
            echo "  EXPO_PUBLIC_HOST_IP       Override auto-detected host IP"
            echo "  EXPO_PUBLIC_API_URL       Override API URL      (default: http://<host>:8000/api/v1)"
            echo "  EXPO_PUBLIC_CHAT_URL      Override Chat URL     (default: http://<host>:8002)"
            echo "  EXPO_PUBLIC_KEYCLOAK_URL  Override Keycloak URL (default: http://<host>:8180)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg (use -h for help)"
            exit 1
            ;;
    esac
done

# Check dependencies
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v npm >/dev/null 2>&1 || missing+=("npm")
command -v npx >/dev/null 2>&1 || missing+=("npx")
command -v openapi-generator-cli >/dev/null 2>&1 || missing+=("openapi-generator-cli")

if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: Missing required dependencies: ${missing[*]}"
    echo ""
    echo "Install Node.js (includes npm/npx):"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    echo "  source ~/.bashrc"
    echo "  nvm install --lts"
    echo ""
    echo "Install OpenAPI generator:"
    echo "  npm install -g @openapitools/openapi-generator-cli"
    exit 1
fi

# Auto-detect host IP for Expo Go on physical devices.
# On WSL2, queries the Windows Wi-Fi adapter IP via powershell.exe.
# Otherwise, uses the machine's LAN IP.
# Set EXPO_PUBLIC_HOST_IP to override auto-detection.
PORTPROXY_WARNING=""
if [ -z "$EXPO_PUBLIC_HOST_IP" ]; then
    if grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL2: get the Windows Wi-Fi LAN IP (reachable from phone on same network).
        # The /etc/resolv.conf nameserver is the WSL gateway (172.x.x.x), not the LAN IP.
        EXPO_PUBLIC_HOST_IP=$(powershell.exe -NoProfile -Command \
            "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -match 'Wi-Fi' -and \$_.PrefixOrigin -eq 'Dhcp' }).IPAddress" \
            2>/dev/null | tr -d '\r')
        if [ -z "$EXPO_PUBLIC_HOST_IP" ]; then
            # Fallback: try resolv.conf nameserver (may work with mirrored networking)
            EXPO_PUBLIC_HOST_IP=$(grep -m1 nameserver /etc/resolv.conf | awk '{print $2}')
        fi

        # WSL2 port forwarding: Docker ports are only reachable at the WSL2 internal IP,
        # not at Windows localhost. netsh portproxy must forward to the WSL2 IP, which
        # changes on every WSL restart.
        WSL2_IP=$(ip addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+')
        if [ -n "$EXPO_PUBLIC_HOST_IP" ] && [ -n "$WSL2_IP" ]; then
            PORTPROXY_OUTPUT=$(powershell.exe -NoProfile -Command \
                "netsh interface portproxy show v4tov4" 2>/dev/null | tr -d '\r')

            # Check that all ports are forwarded to the current WSL2 IP
            PORTPROXY_OK=true
            for port in 8000 8002 8180 3001; do
                if ! echo "$PORTPROXY_OUTPUT" | grep -q "$port.*$WSL2_IP"; then
                    PORTPROXY_OK=false
                    break
                fi
            done

            if [ "$PORTPROXY_OK" = false ]; then
                PORTPROXY_WARNING="yes"
            fi
        fi
    else
        # Native Linux: use first non-loopback IPv4 address
        EXPO_PUBLIC_HOST_IP=$(hostname -I | awk '{print $1}')
    fi
fi

# Set service URLs from host IP (env vars take precedence if already set)
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://${EXPO_PUBLIC_HOST_IP}:8000/api/v1}"
export EXPO_PUBLIC_CHAT_URL="${EXPO_PUBLIC_CHAT_URL:-http://${EXPO_PUBLIC_HOST_IP}:8002}"
export EXPO_PUBLIC_KEYCLOAK_URL="${EXPO_PUBLIC_KEYCLOAK_URL:-http://${EXPO_PUBLIC_HOST_IP}:8180}"

# Regenerate API client (suppress output unless -v)
if [ "$VERBOSE" = true ]; then
    "$SCRIPT_DIR/regenerate_api.sh"
else
    echo -n "Regenerating API client..."
    if "$SCRIPT_DIR/regenerate_api.sh" >/dev/null 2>&1; then
        echo " done"
    else
        echo " FAILED (rerun with -v to see errors)"
        exit 1
    fi
fi

# Print summary banner right before Expo starts
echo ""
echo "==========================================="
echo "  Candid Frontend"
echo "==========================================="
echo "  API:      $EXPO_PUBLIC_API_URL"
echo "  Chat:     $EXPO_PUBLIC_CHAT_URL"
echo "  Keycloak: $EXPO_PUBLIC_KEYCLOAK_URL"
if [ -z "$EXPO_PUBLIC_HOST_IP" ]; then
    echo ""
    echo "  WARNING: Could not detect host IP."
    echo "  Set EXPO_PUBLIC_HOST_IP manually, e.g.:"
    echo "    EXPO_PUBLIC_HOST_IP=192.168.1.100 $0"
fi
if [ "$PORTPROXY_WARNING" = "yes" ]; then
    echo ""
    echo "  WARNING: WSL2 port forwarding needs update (WSL2 IP: $WSL2_IP)"
    echo "  Run in an admin PowerShell:"
    echo ""
    echo "    netsh interface portproxy set v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=$WSL2_IP"
    echo "    netsh interface portproxy set v4tov4 listenport=8002 listenaddress=0.0.0.0 connectport=8002 connectaddress=$WSL2_IP"
    echo "    netsh interface portproxy set v4tov4 listenport=8180 listenaddress=0.0.0.0 connectport=8180 connectaddress=$WSL2_IP"
    echo "    netsh interface portproxy set v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$WSL2_IP"
    echo ""
    echo "  First-time setup also needs a firewall rule:"
    echo "    New-NetFirewallRule -DisplayName 'Candid Dev Ports' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000,8002,8180,3001"
fi
echo "==========================================="
echo ""

cd "$SCRIPT_DIR/app"
npx expo start --tunnel --port 3001

#!/usr/bin/env bash
#
# Single-command dev environment startup for Candid.
#
# Usage:
#   ./dev.sh                          Start services + wait + seed if needed
#   ./dev.sh --reset-db               Reset DB volume first
#   ./dev.sh --reset-all              Reset DB + Redis volumes
#   ./dev.sh --skip-seed              Skip seed script
#   ./dev.sh --seed-only              Only run seed (services already up)
#   ./dev.sh --down                   Stop all services and exit
#   ./dev.sh --snapshot               Snapshot all volumes then exit
#   ./dev.sh --restore                Restore volumes from snapshots/ before starting
#
# Examples:
#   ./dev.sh                          Start + seed if needed
#   ./dev.sh --snapshot               Save current state to snapshots/
#   ./dev.sh --reset-all --restore    Fast reset from snapshot (~30s)
#
set -euo pipefail

# --- Parse flags -------------------------------------------------------

RESET_DB=false
RESET_ALL=false
SKIP_SEED=false
SEED_ONLY=false
DOWN=false
SNAPSHOT=false
RESTORE=false

for arg in "$@"; do
    case "$arg" in
        --reset-db)   RESET_DB=true ;;
        --reset-all)  RESET_ALL=true ;;
        --skip-seed)  SKIP_SEED=true ;;
        --seed-only)  SEED_ONLY=true ;;
        --down)       DOWN=true ;;
        --snapshot)   SNAPSHOT=true ;;
        --restore)    RESTORE=true ;;
        -h|--help)
            echo "Usage: ./dev.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --reset-db     Remove DB volume before starting"
            echo "  --reset-all    Remove DB and Redis volumes before starting"
            echo "  --skip-seed    Skip running the seed script"
            echo "  --seed-only    Only run the seed script (services must already be up)"
            echo "  --down         Stop all services"
            echo "  --snapshot     Snapshot all volumes (stops services) then exit"
            echo "  --restore      Restore volumes from snapshots/ before starting"
            echo "  -h, --help     Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./dev.sh                          Start + seed if needed"
            echo "  ./dev.sh --snapshot               Save current state to snapshots/"
            echo "  ./dev.sh --reset-all --restore    Fast reset from snapshot (~30s)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            exit 1
            ;;
    esac
done

# --- Helper functions --------------------------------------------------

log()  { echo -e "\033[1;34m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m  ✓ $*\033[0m"; }
warn() { echo -e "\033[1;33m  ⚠ $*\033[0m"; }
err()  { echo -e "\033[1;31m  ✗ $*\033[0m"; }

wait_for_healthy() {
    local service="$1" timeout="${2:-60}"
    local elapsed=0
    echo -n "  Waiting for $service "
    while (( elapsed < timeout )); do
        local state health
        state=$(docker compose ps --format '{{.State}}' "$service" 2>/dev/null || true)
        health=$(docker compose ps --format '{{.Health}}' "$service" 2>/dev/null || true)
        if [[ -n "$state" ]]; then

            # If container exited/crashed, fail immediately
            if [[ "$state" == "exited" || "$state" == "dead" ]]; then
                echo ""
                err "$service container is $state. Last logs:"
                docker compose logs --tail=10 "$service" 2>/dev/null || true
                return 1
            fi

            # If healthy or no healthcheck defined (running is enough)
            if [[ "$health" == "healthy" ]]; then
                echo ""
                ok "$service ready (healthy)"
                return 0
            fi
            if [[ -z "$health" && "$state" == "running" ]]; then
                echo ""
                ok "$service ready (running, no healthcheck)"
                return 0
            fi
        fi
        echo -n "."
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo ""
    err "$service did not become ready within ${timeout}s. Last logs:"
    docker compose logs --tail=10 "$service" 2>/dev/null || true
    return 1
}

# --- Dependency check ----------------------------------------------------

check_deps() {
    local missing=0

    # CLI tools
    for cmd in docker curl python3; do
        if ! command -v "$cmd" &>/dev/null; then
            err "Missing required command: $cmd"
            missing=$((missing + 1))
        fi
    done

    if ! docker compose version &>/dev/null; then
        err "Missing required command: docker compose"
        missing=$((missing + 1))
    fi

    # Docker daemon access
    if ! docker info &>/dev/null; then
        if id -nG | grep -qw docker; then
            err "Cannot connect to Docker daemon despite being in the docker group."
            err "On WSL2, run 'wsl --shutdown' from PowerShell, then reopen your terminal."
        else
            err "Cannot connect to Docker daemon. Add yourself to the docker group:"
            err "  sudo usermod -aG docker \$USER"
            err "Then restart your terminal (on WSL2: 'wsl --shutdown' from PowerShell)."
        fi
        missing=$((missing + 1))
    fi

    # Python packages (needed for seed/backfill scripts)
    if [[ "$SKIP_SEED" == "false" ]]; then
        for pkg in psycopg2 requests; do
            if ! python3 -c "import $pkg" &>/dev/null; then
                err "Missing Python package: $pkg (pip3 install ${pkg/psycopg2/psycopg2-binary})"
                missing=$((missing + 1))
            fi
        done
    fi

    if (( missing > 0 )); then
        echo ""
        err "Install missing dependencies and try again."
        exit 1
    fi
}

check_deps

# --- Volume names (must match docker-compose.yaml) ----------------------

VOLUMES=(candid_postgres_data candid_redis_data)
SNAPSHOT_DIR="snapshots"

# --- Snapshot functions --------------------------------------------------

snapshot_volumes() {
    log "Stopping services before snapshot..."
    docker compose down 2>/dev/null || true

    mkdir -p "$SNAPSHOT_DIR"

    local snapped=0
    for vol in "${VOLUMES[@]}"; do
        if ! docker volume inspect "$vol" >/dev/null 2>&1; then
            warn "Volume $vol does not exist, skipping"
            continue
        fi
        log "Snapshotting $vol..."
        docker run --rm \
            -v "${vol}:/source:ro" \
            -v "$(pwd)/${SNAPSHOT_DIR}:/backup" \
            alpine tar czf "/backup/${vol}.tar.gz" -C /source .
        local size
        size=$(du -h "${SNAPSHOT_DIR}/${vol}.tar.gz" | cut -f1)
        ok "$vol -> ${vol}.tar.gz ($size)"
        snapped=$((snapped + 1))
    done

    if (( snapped == 0 )); then
        err "No volumes found to snapshot"
        return 1
    fi

    # Write metadata
    echo "timestamp: $(date -Iseconds)" > "${SNAPSHOT_DIR}/snapshot.meta"
    echo "volumes:" >> "${SNAPSHOT_DIR}/snapshot.meta"
    for f in "${SNAPSHOT_DIR}"/*.tar.gz; do
        if [[ -f "$f" ]]; then
            local size
            size=$(du -h "$f" | cut -f1)
            echo "  - $(basename "$f") ($size)" >> "${SNAPSHOT_DIR}/snapshot.meta"
        fi
    done

    echo ""
    ok "Snapshot complete. Files in ${SNAPSHOT_DIR}/:"
    ls -lh "${SNAPSHOT_DIR}/"
}

restore_volumes() {
    if [[ ! -d "$SNAPSHOT_DIR" ]]; then
        err "No ${SNAPSHOT_DIR}/ directory found. Run './dev.sh --snapshot' first."
        exit 1
    fi

    local found=0
    for vol in "${VOLUMES[@]}"; do
        [[ -f "${SNAPSHOT_DIR}/${vol}.tar.gz" ]] && found=$((found + 1))
    done

    if (( found == 0 )); then
        err "No snapshot files found in ${SNAPSHOT_DIR}/. Run './dev.sh --snapshot' first."
        exit 1
    fi

    log "Stopping services before restore..."
    docker compose down 2>/dev/null || true

    # Restore full volumes (Candid postgres, Redis)
    for vol in "${VOLUMES[@]}"; do
        if [[ ! -f "${SNAPSHOT_DIR}/${vol}.tar.gz" ]]; then
            warn "No snapshot for $vol, skipping"
            continue
        fi
        log "Restoring $vol..."
        docker volume rm "$vol" 2>/dev/null || true
        docker volume create "$vol" >/dev/null
        docker run --rm \
            -v "${vol}:/target" \
            -v "$(pwd)/${SNAPSHOT_DIR}:/backup:ro" \
            alpine sh -c "cd /target && tar xzf /backup/${vol}.tar.gz"
        ok "$vol restored"
    done

    SKIP_SEED=true
    echo ""
    ok "Volume restore complete"
}

# --- Down mode (stop services, exit) ------------------------------------

if [[ "$DOWN" == "true" ]]; then
    log "Stopping all services..."
    docker compose down
    ok "All services stopped"
    exit 0
fi

# --- Snapshot mode (stop, snapshot, exit) --------------------------------

if [[ "$SNAPSHOT" == "true" ]]; then
    snapshot_volumes
    exit 0
fi

# --- Volume reset (if requested) ----------------------------------------

if [[ "$RESET_ALL" == "true" ]]; then
    log "Removing DB and Redis volumes..."
    docker compose down 2>/dev/null || true
    docker volume rm candid_postgres_data candid_redis_data 2>/dev/null || true
    ok "Volumes removed"
elif [[ "$RESET_DB" == "true" ]]; then
    log "Removing DB volume..."
    docker compose down 2>/dev/null || true
    docker volume rm candid_postgres_data 2>/dev/null || true
    ok "DB volume removed"
fi

# --- Restore mode (restore volumes before starting) ---------------------

if [[ "$RESTORE" == "true" ]]; then
    restore_volumes
fi

# --- Detect host IP and set CORS origins --------------------------------

if [[ -z "${CORS_ORIGINS:-}" ]]; then
    HOST_IP=""
    if grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL2: get the Windows Wi-Fi LAN IP (reachable from phone on same network)
        HOST_IP=$(powershell.exe -NoProfile -Command \
            "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -match 'Wi-Fi' -and \$_.PrefixOrigin -eq 'Dhcp' }).IPAddress" \
            2>/dev/null | tr -d '\r')
    fi
    if [[ -z "$HOST_IP" ]]; then
        HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi

    CORS_ORIGINS="http://localhost:3001,http://localhost:8081,http://localhost:8082,http://localhost:19006"
    if [[ -n "$HOST_IP" ]]; then
        CORS_ORIGINS="${CORS_ORIGINS},http://${HOST_IP}:3001,http://${HOST_IP}:8081,http://${HOST_IP}:8082,http://${HOST_IP}:19006"
        ok "CORS origins include host IP ${HOST_IP}"
    fi
    export CORS_ORIGINS
fi

# --- Generate Polis JWT keys (if missing) --------------------------------

POLIS_KEYS_DIR="backend/polis-integration/keys"
if [[ ! -f "${POLIS_KEYS_DIR}/jwt-private.pem" ]]; then
    log "Generating Polis JWT keypair..."
    mkdir -p "$POLIS_KEYS_DIR"
    openssl genpkey -algorithm RSA -out "${POLIS_KEYS_DIR}/jwt-private.pem" -pkeyopt rsa_keygen_bits:2048 2>/dev/null
    openssl rsa -in "${POLIS_KEYS_DIR}/jwt-private.pem" -pubout -out "${POLIS_KEYS_DIR}/jwt-public.pem" 2>/dev/null
    ok "JWT keypair generated in ${POLIS_KEYS_DIR}/"
else
    ok "Polis JWT keys already exist"
fi

# --- Start services (unless --seed-only) --------------------------------

if [[ "$SEED_ONLY" == "false" ]]; then
    log "Starting services with docker compose..."
    docker compose up -d --build
    echo ""

    # Wait for critical services using Docker health status
    log "Waiting for services to become ready..."
    wait_for_healthy "db" 60
    wait_for_healthy "redis" 15
    wait_for_healthy "keycloak" 60
    wait_for_healthy "api" 60
    wait_for_healthy "nlp" 180
    wait_for_healthy "chat" 30

    # Wait for Polis (non-fatal — Polis build can be slow)
    echo ""
    log "Waiting for Polis..."
    if ! wait_for_healthy "polis-server" 60; then
        warn "Polis is not ready yet."
        echo "    You can check with: docker compose logs -f polis-server"
        echo "    Continuing without Polis..."
    fi
    echo ""
fi

# --- Seed data (unless --skip-seed) ------------------------------------

if [[ "$SKIP_SEED" == "false" ]]; then
    # Check if seeding is needed by counting positions
    POSITION_COUNT=$(docker compose exec -T db psql -U user -d candid -tAc \
        "SELECT count(*) FROM position" 2>/dev/null || echo "0")
    POSITION_COUNT=$(echo "$POSITION_COUNT" | tr -d '[:space:]')

    if (( POSITION_COUNT < 20 )); then
        log "Seed data not detected (${POSITION_COUNT} positions). Running seed script..."
        python3 backend/scripts/seed_dev_data.py
        ok "Seed script complete"
        echo ""

        # Seed large discussion thread (200 comments, deep nesting)
        log "Seeding large discussion thread..."
        python3 backend/scripts/seed_large_thread.py && \
            ok "Large thread seeded" || warn "Large thread seed failed (non-fatal)"
        echo ""

        # Run embedding backfill
        log "Running embedding backfill..."
        NLP_SERVICE_URL=http://localhost:5001 python3 backend/scripts/backfill_embeddings.py 2>/dev/null && \
            ok "Embeddings backfilled" || warn "Embedding backfill skipped (script not found or failed)"
        echo ""

        # Run Polis backfill (needed for stats page)
        log "Checking Polis availability for backfill..."
        if curl -sf http://localhost:5000/api/v3/ >/dev/null 2>&1; then
            log "Running Polis backfill (positions + votes)..."
            python3 backend/scripts/backfill_polis_positions.py && \
                ok "Polis backfill queued" || warn "Polis backfill failed (check logs)"

            # Wait for position sync to complete, then re-link pairwise surveys.
            # The backfill script queues positions asynchronously; the worker must
            # process them (creating Polis conversations) before surveys can be linked.
            log "Waiting for Polis worker to process positions..."
            for i in $(seq 1 60); do
                PENDING=$(docker compose exec -T db psql -U user -d candid -tAc \
                    "SELECT COUNT(*) FROM polis_sync_queue WHERE operation_type='position' AND status IN ('pending','processing')" 2>/dev/null | tr -d '[:space:]')
                if [ "$PENDING" = "0" ] 2>/dev/null; then
                    ok "Polis positions processed"
                    log "Re-linking pairwise surveys to Polis conversations..."
                    python3 backend/scripts/backfill_polis_positions.py --relink-only && \
                        ok "Pairwise surveys linked" || warn "Pairwise survey linking failed"

                    # Force full math recompute — bulk vote seeding overwhelms
                    # the incremental math worker, causing it to miss participants.
                    log "Resetting Polis math for full recompute..."
                    docker compose exec -T db psql -U user -d polis-dev -tAc "
                        DELETE FROM math_main WHERE math_env = 'dev';
                        DELETE FROM math_ticks WHERE math_env = 'dev';
                        DELETE FROM math_bidtopid WHERE math_env = 'dev';
                        DELETE FROM math_profile WHERE math_env = 'dev';
                    " >/dev/null 2>&1
                    docker compose restart polis-math >/dev/null 2>&1
                    ok "Polis math reset — will recompute in background"
                    break
                fi
                sleep 5
            done
        else
            warn "Polis is not available. Skipping Polis backfill."
            echo "    To backfill Polis data later, run:"
            echo "    python3 backend/scripts/backfill_polis_positions.py"
        fi
        echo ""
    else
        ok "Seed data already present (${POSITION_COUNT} positions). Skipping seed."
    fi
fi

# --- Status summary ----------------------------------------------------

log "Dev environment is ready!"
echo ""
echo "  Services:"
echo "    API (Swagger UI):  http://localhost:8000/api/v1/ui"
echo "    Keycloak Admin:    http://localhost:8180/admin  (admin/admin)"
echo "    PostgreSQL:        localhost:5432  (user/postgres)"
echo "    Polis API:         http://localhost:5000"
echo "    Chat WebSocket:    ws://localhost:8002"
echo "    NLP Service:       http://localhost:5001"
echo "    Redis:             localhost:6379"
echo ""
echo "  Test users (password: password):"
echo "    admin1      - Admin"
echo "    moderator1  - Moderator"
echo "    normal1-5   - Normal users (normal4 may be banned after seeding)"
echo "    guest1-2    - Guest users"
echo ""
echo "  Useful commands:"
echo "    psql -h localhost -p 5432 -U user -d candid    # Connect to DB"
echo "    ./run-tests.sh                                 # Run tests"
echo "    ./dev.sh --down                                # Stop all services"
echo "    ./dev.sh --seed-only                           # Re-run seed script"
echo "    ./dev.sh --reset-db                            # Fresh DB + reseed"
echo "    ./dev.sh --snapshot                            # Save state to snapshots/"
echo "    ./dev.sh --reset-all --restore                 # Fast reset from snapshot"
echo ""

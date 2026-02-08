#!/usr/bin/env bash
#
# Single-command dev environment startup for Candid.
#
# Usage:
#   ./dev.sh                          Start services + wait + seed if needed
#   ./dev.sh --reset-db               Reset DB volume first
#   ./dev.sh --reset-all              Reset DB + Polis + Redis volumes
#   ./dev.sh --skip-seed              Skip seed script
#   ./dev.sh --seed-only              Only run seed (services already up)
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
SNAPSHOT=false
RESTORE=false
RESTORE_POLIS_LATER=false

for arg in "$@"; do
    case "$arg" in
        --reset-db)   RESET_DB=true ;;
        --reset-all)  RESET_ALL=true ;;
        --skip-seed)  SKIP_SEED=true ;;
        --seed-only)  SEED_ONLY=true ;;
        --snapshot)   SNAPSHOT=true ;;
        --restore)    RESTORE=true ;;
        -h|--help)
            echo "Usage: ./dev.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --reset-db     Remove DB volume before starting"
            echo "  --reset-all    Remove DB, Polis, and Redis volumes before starting"
            echo "  --skip-seed    Skip running the seed script"
            echo "  --seed-only    Only run the seed script (services must already be up)"
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
        local json
        json=$(docker compose ps --format json "$service" 2>/dev/null || true)
        if [[ -n "$json" ]]; then
            local state health
            state=$(echo "$json" | jq -r '.State // empty' 2>/dev/null || true)
            health=$(echo "$json" | jq -r '.Health // empty' 2>/dev/null || true)

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

# Old-style wait for services without Docker healthchecks (Polis)
wait_for() {
    local label="$1" cmd="$2" timeout="${3:-60}"
    local elapsed=0
    echo -n "  Waiting for $label "
    while ! eval "$cmd" >/dev/null 2>&1; do
        if (( elapsed >= timeout )); then
            echo ""
            err "$label did not become ready within ${timeout}s"
            return 1
        fi
        echo -n "."
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo ""
    ok "$label ready"
}

# --- Volume names (must match docker-compose.yaml) ----------------------

# Volumes that get full snapshot/restore (small volumes only)
VOLUMES=(candid_postgres_data candid_redis_data)
# Polis DinD volume is huge (~37GB with Docker images) — we only snapshot
# the internal postgres data (~100MB) to keep snapshots manageable.
POLIS_DID_VOL="candid_polis_docker_data"
POLIS_PG_SUBPATH="volumes/polis-dev_postgres_data"
POLIS_SNAPSHOT_NAME="candid_polis_postgres_data"
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

    # Polis: only snapshot the internal postgres data, not the whole DinD volume
    if docker volume inspect "$POLIS_DID_VOL" >/dev/null 2>&1; then
        log "Snapshotting Polis postgres data (from DinD volume)..."
        docker run --rm \
            -v "${POLIS_DID_VOL}:/source:ro" \
            -v "$(pwd)/${SNAPSHOT_DIR}:/backup" \
            alpine tar czf "/backup/${POLIS_SNAPSHOT_NAME}.tar.gz" \
                -C "/source/${POLIS_PG_SUBPATH}" .
        local size
        size=$(du -h "${SNAPSHOT_DIR}/${POLIS_SNAPSHOT_NAME}.tar.gz" | cut -f1)
        ok "Polis postgres -> ${POLIS_SNAPSHOT_NAME}.tar.gz ($size)"
        snapped=$((snapped + 1))
    else
        warn "Polis volume does not exist, skipping"
    fi

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
    [[ -f "${SNAPSHOT_DIR}/${POLIS_SNAPSHOT_NAME}.tar.gz" ]] && found=$((found + 1))

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

    # Restore Polis postgres data into DinD volume (if DinD volume exists)
    if [[ -f "${SNAPSHOT_DIR}/${POLIS_SNAPSHOT_NAME}.tar.gz" ]]; then
        if docker volume inspect "$POLIS_DID_VOL" >/dev/null 2>&1; then
            log "Restoring Polis postgres data into DinD volume..."
            docker run --rm \
                -v "${POLIS_DID_VOL}:/target" \
                -v "$(pwd)/${SNAPSHOT_DIR}:/backup:ro" \
                alpine sh -c "cd /target/${POLIS_PG_SUBPATH} && tar xzf /backup/${POLIS_SNAPSHOT_NAME}.tar.gz"
            ok "Polis postgres data restored"
        else
            warn "Polis DinD volume does not exist yet. Polis data will be restored after Polis starts."
            RESTORE_POLIS_LATER=true
        fi
    fi

    SKIP_SEED=true
    echo ""
    ok "Volume restore complete"
}

# --- Snapshot mode (stop, snapshot, exit) --------------------------------

if [[ "$SNAPSHOT" == "true" ]]; then
    snapshot_volumes
    exit 0
fi

# --- Volume reset (if requested) ----------------------------------------

if [[ "$RESET_ALL" == "true" ]]; then
    log "Removing DB, Polis, and Redis volumes..."
    docker compose down 2>/dev/null || true
    docker volume rm candid_postgres_data candid_polis_docker_data candid_redis_data 2>/dev/null || true
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

# --- Start services (unless --seed-only) --------------------------------

if [[ "$SEED_ONLY" == "false" ]]; then
    log "Starting services with docker compose..."
    docker compose up -d --build
    echo ""

    # Wait for critical services using Docker health status
    log "Waiting for services to become ready..."
    wait_for_healthy "db" 30
    wait_for_healthy "redis" 15
    wait_for_healthy "api" 60
    wait_for_healthy "nlp" 180
    wait_for_healthy "chat" 30

    # Polis is docker-in-docker; no health check possible. Wait non-fatally.
    echo ""
    log "Waiting for Polis (non-fatal, docker-in-docker is slow)..."
    if ! wait_for "Polis" "curl -sf http://localhost:5000/api/v3/ || curl -sf http://localhost:8080" 120; then
        warn "Polis is not ready yet. It may still be pulling images."
        echo "    You can check with: docker compose logs -f polis"
        echo "    Continuing without Polis..."
    fi

    # Deferred Polis postgres restore (if DinD volume didn't exist during restore)
    if [[ "$RESTORE_POLIS_LATER" == "true" ]]; then
        if docker volume inspect "$POLIS_DID_VOL" >/dev/null 2>&1; then
            # Wait for Polis inner postgres to actually exist (DinD needs to pull images first)
            log "Waiting for Polis inner postgres to start (may take a few minutes on first run)..."
            local polis_elapsed=0
            local polis_timeout=300
            local polis_ready=false
            while (( polis_elapsed < polis_timeout )); do
                if docker compose exec -T polis docker ps --format '{{.Names}}' 2>/dev/null | grep -q postgres; then
                    polis_ready=true
                    break
                fi
                echo -n "."
                sleep 5
                polis_elapsed=$((polis_elapsed + 5))
            done
            echo ""

            if [[ "$polis_ready" == "true" ]]; then
                log "Restoring Polis postgres data (deferred)..."
                # Stop Polis postgres briefly to restore
                docker compose exec -T polis docker stop polis-dev-postgres-1 2>/dev/null || true
                sleep 2
                docker run --rm \
                    -v "${POLIS_DID_VOL}:/target" \
                    -v "$(pwd)/${SNAPSHOT_DIR}:/backup:ro" \
                    alpine sh -c "cd /target/${POLIS_PG_SUBPATH} && tar xzf /backup/${POLIS_SNAPSHOT_NAME}.tar.gz"
                docker compose exec -T polis docker start polis-dev-postgres-1 2>/dev/null || true
                ok "Polis postgres data restored (deferred)"
            else
                warn "Polis inner postgres did not start within ${polis_timeout}s."
                echo "    Once Polis is ready, restore manually with:"
                echo "    docker compose exec polis docker stop polis-dev-postgres-1"
                echo "    docker run --rm -v ${POLIS_DID_VOL}:/target -v \$(pwd)/${SNAPSHOT_DIR}:/backup:ro alpine sh -c 'cd /target/${POLIS_PG_SUBPATH} && tar xzf /backup/${POLIS_SNAPSHOT_NAME}.tar.gz'"
                echo "    docker compose exec polis docker start polis-dev-postgres-1"
            fi
        else
            warn "Polis DinD volume still not available. Run Polis backfill manually."
        fi
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
        docker compose exec api python3 /app/backend/scripts/seed_dev_data.py
        ok "Seed script complete"
        echo ""

        # Run embedding backfill
        log "Running embedding backfill..."
        docker compose exec api python3 /app/backend/scripts/backfill_embeddings.py 2>/dev/null && \
            ok "Embeddings backfilled" || warn "Embedding backfill skipped (script not found or failed)"
        echo ""

        # Run Polis backfill (needed for stats page)
        log "Checking Polis availability for backfill..."
        if curl -sf http://localhost:5000/api/v3/ >/dev/null 2>&1 || \
           curl -sf http://localhost:8080 >/dev/null 2>&1; then
            log "Running Polis backfill (positions + votes)..."
            docker compose exec api python3 /app/backend/scripts/backfill_polis_positions.py && \
                ok "Polis backfill queued" || warn "Polis backfill failed (check logs)"

            # Wait for position sync to complete, then re-link pairwise surveys.
            # The backfill script queues positions asynchronously; the worker must
            # process them (creating Polis conversations) before surveys can be linked.
            log "Waiting for Polis worker to process positions..."
            for i in $(seq 1 60); do
                PENDING=$(docker compose exec -T api python3 -c "
import psycopg2; conn = psycopg2.connect('postgresql://user:postgres@db:5432/candid')
cur = conn.cursor(); cur.execute(\"SELECT COUNT(*) FROM polis_sync_queue WHERE operation_type='position' AND status IN ('pending','processing')\")
print(cur.fetchone()[0]); conn.close()
" 2>/dev/null)
                if [ "$PENDING" = "0" ] 2>/dev/null; then
                    ok "Polis positions processed"
                    log "Re-linking pairwise surveys to Polis conversations..."
                    docker compose exec api python3 /app/backend/scripts/backfill_polis_positions.py --relink-only && \
                        ok "Pairwise surveys linked" || warn "Pairwise survey linking failed"
                    break
                fi
                sleep 5
            done
        else
            warn "Polis is not available. Skipping Polis backfill."
            echo "    To backfill Polis data later, run:"
            echo "    docker compose exec api python3 /app/backend/scripts/backfill_polis_positions.py"
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
echo "    PostgreSQL:        localhost:5432  (user/postgres)"
echo "    Polis UI:          http://localhost:8080"
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
echo "    python3 -m pytest backend/tests/ -v            # Run tests"
echo "    ./dev.sh --seed-only                           # Re-run seed script"
echo "    ./dev.sh --reset-db                            # Fresh DB + reseed"
echo "    ./dev.sh --snapshot                            # Save state to snapshots/"
echo "    ./dev.sh --reset-all --restore                 # Fast reset from snapshot"
echo ""

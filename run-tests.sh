#!/usr/bin/env bash
# run-tests.sh — Run project test suites with dependency checks.
#
# Usage:
#   ./run-tests.sh              # Run all tests (unit + frontend)
#   ./run-tests.sh unit         # Backend unit tests only (no Docker)
#   ./run-tests.sh frontend     # Frontend Jest tests only
#   ./run-tests.sh integration  # Backend integration tests (Docker required)
#   ./run-tests.sh all          # All tests including integration

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------

check_python_deps() {
  local missing=()
  local deps=(redis dateutil connexion flask jwt pytest_benchmark)

  for dep in "${deps[@]}"; do
    if ! python3 -c "import $dep" 2>/dev/null; then
      missing+=("$dep")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${YELLOW}Missing Python packages: ${missing[*]}${NC}"
    echo -e "Installing from backend/server/requirements.txt..."
    pip install -r "$REPO_ROOT/backend/server/requirements.txt" 2>&1 | tail -3
    # Re-check
    for dep in "${missing[@]}"; do
      if ! python3 -c "import $dep" 2>/dev/null; then
        echo -e "${RED}Failed to install $dep. Please install manually.${NC}"
        exit 1
      fi
    done
    echo -e "${GREEN}Dependencies installed.${NC}"
  fi
}

check_generated_dir() {
  local gen_dir="$REPO_ROOT/backend/server/generated/candid"
  if [ ! -d "$gen_dir" ]; then
    echo -e "${YELLOW}Generated candid package not found. Creating minimal structure for unit tests...${NC}"
    mkdir -p "$gen_dir/controllers/helpers"
    touch "$gen_dir/__init__.py" "$gen_dir/controllers/__init__.py" "$gen_dir/controllers/helpers/__init__.py"
  fi
  # Create minimal model stubs if openapi-generator hasn't been run
  if [ ! -d "$gen_dir/models" ]; then
    echo -e "${YELLOW}Creating minimal model stubs for unit tests...${NC}"
    mkdir -p "$gen_dir/models"
    cat > "$gen_dir/models/__init__.py" << 'PYEOF'
from candid.models.user import User
from candid.models.error_model import ErrorModel
PYEOF
    cat > "$gen_dir/models/user.py" << 'PYEOF'
class User:
    def __init__(self, id=None, username=None, display_name=None, avatar_url=None,
                 avatar_icon_url=None, status=None, trust_score=None, kudos_count=None, **kwargs):
        self.id = id
        self.username = username
        self.display_name = display_name
        self.avatar_url = avatar_url
        self.avatar_icon_url = avatar_icon_url
        self.status = status
        self.trust_score = trust_score
        self.kudos_count = kudos_count
PYEOF
    cat > "$gen_dir/models/error_model.py" << 'PYEOF'
class ErrorModel:
    def __init__(self, code=None, detail=None, **kwargs):
        self.code = code
        self.detail = detail
PYEOF
  fi
}

check_node_deps() {
  if [ ! -d "$REPO_ROOT/frontend/app/node_modules" ]; then
    echo -e "${YELLOW}Frontend node_modules not found. Running npm install...${NC}"
    (cd "$REPO_ROOT/frontend/app" && npm install)
  fi
}

# ---------------------------------------------------------------------------
# Test runners
# ---------------------------------------------------------------------------

run_backend_unit() {
  echo -e "\n${GREEN}=== Backend Unit Tests ===${NC}"
  check_python_deps
  check_generated_dir
  python3 -m pytest "$REPO_ROOT/backend/tests/unit/" -v "$@"
}

run_frontend() {
  echo -e "\n${GREEN}=== Frontend Tests ===${NC}"
  check_node_deps
  (cd "$REPO_ROOT/frontend/app" && npx jest --no-coverage "$@")
}

run_backend_integration() {
  echo -e "\n${GREEN}=== Backend Integration Tests ===${NC}"
  check_python_deps
  python3 -m pytest "$REPO_ROOT/backend/tests/" -v --ignore="$REPO_ROOT/backend/tests/unit" "$@"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

MODE="${1:-default}"
shift 2>/dev/null || true

case "$MODE" in
  unit)
    run_backend_unit "$@"
    ;;
  frontend)
    run_frontend "$@"
    ;;
  integration)
    run_backend_integration "$@"
    ;;
  all)
    run_backend_unit "$@"
    run_frontend "$@"
    run_backend_integration "$@"
    ;;
  default)
    run_backend_unit "$@"
    run_frontend "$@"
    ;;
  *)
    echo "Usage: $0 [unit|frontend|integration|all]"
    exit 1
    ;;
esac

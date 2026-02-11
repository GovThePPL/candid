"""Shared fixtures for unit tests — no Docker dependencies.

All external calls (DB, Redis, HTTP) are mocked via fixtures.
"""

import sys
import os
import shutil
from unittest.mock import MagicMock, patch
import pytest

# ---------------------------------------------------------------------------
# Path setup: sync real controllers → generated, then add to sys.path
# ---------------------------------------------------------------------------
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_CONTROLLERS_SRC = os.path.join(_REPO_ROOT, "backend", "server", "controllers")
_GENERATED = os.path.join(_REPO_ROOT, "backend", "server", "generated")
_CONTROLLERS_DST = os.path.join(_GENERATED, "candid", "controllers")

# Copy real controllers over generated stubs (mirrors build.sh step)
if os.path.isdir(_CONTROLLERS_SRC) and os.path.isdir(_CONTROLLERS_DST):
    shutil.copytree(_CONTROLLERS_SRC, _CONTROLLERS_DST, dirs_exist_ok=True)

# Mock the Database class BEFORE importing candid — prevents real DB connections
_mock_database_class = MagicMock()
_mock_database_instance = MagicMock()
_mock_database_instance.execute_query = MagicMock(return_value=None)
_mock_database_class.return_value = _mock_database_instance
sys.modules.setdefault("psycopg2", MagicMock())
sys.modules.setdefault("psycopg2.extras", MagicMock())
sys.modules.setdefault("psycopg2.pool", MagicMock())
# Mock connexion to avoid Flask/Connexion version compatibility issues
# (connexion.apps.flask_app references removed flask.json.JSONEncoder)
_mock_connexion = MagicMock()
_mock_connexion.request = MagicMock()
_mock_connexion.request.is_json = False
sys.modules.setdefault("connexion", _mock_connexion)

# Patch Database before candid.controllers.__init__ imports it
with patch.dict("sys.modules", {
    "candid.controllers.helpers.database": MagicMock(Database=_mock_database_class),
}):
    pass  # Module is now in sys.modules cache

# Disable Polis worker auto-start by setting POLIS_ENABLED=false in env
os.environ.setdefault("POLIS_ENABLED", "false")

# Now add generated to path so 'candid' resolves
if _GENERATED not in sys.path:
    sys.path.insert(0, _GENERATED)


# ---------------------------------------------------------------------------
# Mock DB
# ---------------------------------------------------------------------------

class MockDB:
    """Drop-in replacement for candid.controllers.db.

    Call mock_db.set_return(value) to control what execute_query returns.
    Call mock_db.set_side_effect(fn) for dynamic responses.
    """

    def __init__(self):
        self._mock = MagicMock()
        self._mock.execute_query = MagicMock(return_value=None)

    def execute_query(self, *args, **kwargs):
        return self._mock.execute_query(*args, **kwargs)

    def set_return(self, value):
        self._mock.execute_query.return_value = value

    def set_side_effect(self, fn):
        self._mock.execute_query.side_effect = fn

    @property
    def call_args_list(self):
        return self._mock.execute_query.call_args_list

    def reset(self):
        self._mock.reset_mock()


@pytest.fixture
def mock_db():
    """Provide a MockDB instance and patch candid.controllers.db."""
    db = MockDB()
    with patch.dict("sys.modules", {
        "candid": MagicMock(),
        "candid.controllers": MagicMock(db=db),
    }):
        yield db


# ---------------------------------------------------------------------------
# Mock Redis
# ---------------------------------------------------------------------------

class MockRedis:
    """In-memory Redis fake supporting the subset of commands used by helpers."""

    def __init__(self):
        self._data = {}
        self._ttls = {}

    def get(self, key):
        return self._data.get(key)

    def set(self, key, value):
        self._data[key] = value

    def setex(self, key, ttl, value):
        self._data[key] = value
        self._ttls[key] = ttl

    def exists(self, key):
        return 1 if key in self._data else 0

    def delete(self, *keys):
        for k in keys:
            self._data.pop(k, None)
            self._ttls.pop(k, None)

    def keys(self, pattern="*"):
        import fnmatch
        return [k for k in self._data if fnmatch.fnmatch(k, pattern)]

    def pipeline(self):
        return MockPipeline(self)

    def publish(self, channel, message):
        return 1  # Simulates 1 subscriber


class MockPipeline:
    """Pipelines queue commands and return results in order."""

    def __init__(self, redis_instance):
        self._redis = redis_instance
        self._ops = []

    def setex(self, key, ttl, value):
        self._ops.append(("setex", key, ttl, value))
        return self

    def exists(self, key):
        self._ops.append(("exists", key))
        return self

    def get(self, key):
        self._ops.append(("get", key))
        return self

    def execute(self):
        results = []
        for op in self._ops:
            cmd = op[0]
            if cmd == "setex":
                self._redis.setex(op[1], op[2], op[3])
                results.append(True)
            elif cmd == "exists":
                results.append(self._redis.exists(op[1]))
            elif cmd == "get":
                results.append(self._redis.get(op[1]))
        self._ops = []
        return results


@pytest.fixture
def mock_redis():
    """Provide a MockRedis and patch get_redis() to return it."""
    r = MockRedis()
    with patch(
        "candid.controllers.helpers.redis_pool.get_redis", return_value=r
    ):
        yield r


# ---------------------------------------------------------------------------
# Mock Config
# ---------------------------------------------------------------------------

class MockConfig:
    """Provides default config values for tests."""
    SQLALCHEMY_DATABASE_URI = "postgresql://test:test@localhost/test"
    REDIS_URL = "redis://localhost:6379"
    KEYCLOAK_URL = "http://keycloak:8180"
    KEYCLOAK_REALM = "candid"
    KEYCLOAK_BACKEND_CLIENT_ID = "candid-backend"
    KEYCLOAK_BACKEND_CLIENT_SECRET = "test-secret"
    CORS_ORIGINS = ["http://localhost:3001"]
    POLIS_API_URL = "http://polis-server:5000/api/v3"
    POLIS_BASE_URL = "http://polis-server:5000"
    POLIS_PUBLIC_URL = "http://localhost:5000"
    POLIS_ENABLED = True
    POLIS_TIMEOUT = 10
    POLIS_CONVERSATION_WINDOW_MONTHS = 6
    POLIS_ADMIN_CLIENT_SECRET = "polis-admin-secret"
    POLIS_ADMIN_EMAIL = "polis-admin@candid.dev"
    POLIS_ADMIN_PASSWORD = "password"
    NLP_SERVICE_URL = "http://nlp:5001"
    NLP_SERVICE_TIMEOUT = 10
    DEV = True


@pytest.fixture
def mock_config():
    return MockConfig()

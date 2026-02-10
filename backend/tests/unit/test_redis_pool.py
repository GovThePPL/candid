"""Unit tests for redis_pool.py — shared Redis connection pool.

NOTE: We only test the pool-reuse (singleton) behavior, which is the one
piece of real logic in this module. Tests for "creates pool on first call"
and "reads default env vars" were removed — they verified mock wiring and
os.getenv defaults (Python stdlib), not application logic.
"""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


class TestGetRedis:
    def test_reuses_pool_on_subsequent_calls(self):
        import candid.controllers.helpers.redis_pool as mod
        existing_pool = MagicMock()
        mod._pool = existing_pool

        with patch("candid.controllers.helpers.redis_pool.redis") as mock_redis_mod:
            mock_redis_mod.Redis.return_value = MagicMock()
            mod.get_redis()

            # ConnectionPool.from_url should NOT be called again
            mock_redis_mod.ConnectionPool.from_url.assert_not_called()
            # Redis should use the existing pool
            mock_redis_mod.Redis.assert_called_once_with(connection_pool=existing_pool)
            mod._pool = None  # Reset

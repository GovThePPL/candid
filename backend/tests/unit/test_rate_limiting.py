"""Unit tests for rate_limiting.py — Redis sliding window rate limiter."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


class FakeRedis:
    """Minimal in-memory Redis mock supporting ZSET operations."""

    def __init__(self):
        self._store = {}  # key -> {member: score}

    def pipeline(self):
        return FakePipeline(self)

    def zrem(self, key, member):
        if key in self._store:
            self._store[key].pop(member, None)

    def zremrangebyscore(self, key, min_score, max_score):
        if key not in self._store:
            return 0
        to_remove = [m for m, s in self._store[key].items()
                     if min_score <= s <= max_score]
        for m in to_remove:
            del self._store[key][m]
        return len(to_remove)

    def zcard(self, key):
        return len(self._store.get(key, {}))

    def zadd(self, key, mapping):
        if key not in self._store:
            self._store[key] = {}
        self._store[key].update(mapping)

    def expire(self, key, ttl):
        pass  # no-op for tests


class FakePipeline:
    """Fake Redis pipeline that collects commands and executes them."""

    def __init__(self, redis_inst):
        self._redis = redis_inst
        self._commands = []

    def zremrangebyscore(self, key, min_s, max_s):
        self._commands.append(("zremrangebyscore", key, min_s, max_s))

    def zcard(self, key):
        self._commands.append(("zcard", key))

    def zadd(self, key, mapping):
        self._commands.append(("zadd", key, mapping))

    def expire(self, key, ttl):
        self._commands.append(("expire", key, ttl))

    def execute(self):
        results = []
        for cmd in self._commands:
            name = cmd[0]
            if name == "zremrangebyscore":
                results.append(self._redis.zremrangebyscore(cmd[1], cmd[2], cmd[3]))
            elif name == "zcard":
                results.append(self._redis.zcard(cmd[1]))
            elif name == "zadd":
                self._redis.zadd(cmd[1], cmd[2])
                results.append(1)
            elif name == "expire":
                results.append(True)
        return results


def _mock_config(dev=False):
    """Create a mock config with DEV flag."""
    cfg = MagicMock()
    cfg.DEV = dev
    return cfg


# Patch targets: get_redis is a module-level name in rate_limiting.py;
# config is imported at call time from candid.controllers.
_PATCH_REDIS = "candid.controllers.helpers.rate_limiting.get_redis"
_PATCH_CONFIG = "candid.controllers.config"


class TestCheckRateLimit:
    """Tests for check_rate_limit()."""

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_first_action_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is True
        assert count == 1

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_within_limit_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(4):
            allowed, count = check_rate_limit("user1", "post_create", 5)
            assert allowed is True
        assert count == 4

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_at_limit_last_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(5):
            allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is True
        assert count == 5

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_over_limit_blocked(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(5):
            check_rate_limit("user1", "post_create", 5)

        # 6th should be blocked
        allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is False
        assert count == 5

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_different_users_independent(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(5):
            check_rate_limit("user1", "post_create", 5)

        # user2 should still be allowed
        allowed, count = check_rate_limit("user2", "post_create", 5)
        assert allowed is True
        assert count == 1

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_different_actions_independent(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(5):
            check_rate_limit("user1", "post_create", 5)

        # Same user, different action should be allowed
        allowed, count = check_rate_limit("user1", "vote", 100)
        assert allowed is True
        assert count == 1


class TestDevModeSkip:
    """Tests that dev mode skips all Redis calls."""

    @patch(_PATCH_CONFIG, _mock_config(dev=True))
    def test_dev_mode_always_allowed(self):
        """In dev mode, check_rate_limit returns (True, 0) without Redis."""
        from candid.controllers.helpers.rate_limiting import check_rate_limit
        allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is True
        assert count == 0

    @patch(_PATCH_CONFIG, _mock_config(dev=True))
    @patch(_PATCH_REDIS)
    def test_dev_mode_no_redis_call(self, mock_get_redis):
        """In dev mode, get_redis is never called."""
        from candid.controllers.helpers.rate_limiting import check_rate_limit
        check_rate_limit("user1", "post_create", 5)
        mock_get_redis.assert_not_called()


class TestCheckRateLimitFor:
    """Tests for check_rate_limit_for() convenience wrapper."""

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_uses_rate_limits_dict(self, mock_get_redis):
        """check_rate_limit_for looks up limits from RATE_LIMITS."""
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit_for
        allowed, count = check_rate_limit_for("user1", "post_create")
        assert allowed is True
        assert count == 1

    def test_invalid_action_raises_key_error(self):
        """Unknown action key raises KeyError."""
        from candid.controllers.helpers.rate_limiting import check_rate_limit_for
        with pytest.raises(KeyError):
            check_rate_limit_for("user1", "nonexistent_action")

    @patch(_PATCH_CONFIG, _mock_config(dev=False))
    @patch(_PATCH_REDIS)
    def test_login_limit_by_ip(self, mock_get_redis):
        """Login rate limit works with IP addresses."""
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit_for
        for i in range(10):
            allowed, _ = check_rate_limit_for("192.168.1.1", "login")
            assert allowed is True

        # 11th should be blocked
        allowed, _ = check_rate_limit_for("192.168.1.1", "login")
        assert allowed is False

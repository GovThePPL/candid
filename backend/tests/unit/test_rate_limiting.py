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


class TestCheckRateLimit:
    """Tests for check_rate_limit()."""

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
    def test_first_action_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is True
        assert count == 1

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
    def test_within_limit_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(4):
            allowed, count = check_rate_limit("user1", "post_create", 5)
            assert allowed is True
        assert count == 4

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
    def test_at_limit_last_allowed(self, mock_get_redis):
        fake = FakeRedis()
        mock_get_redis.return_value = fake

        from candid.controllers.helpers.rate_limiting import check_rate_limit
        for i in range(5):
            allowed, count = check_rate_limit("user1", "post_create", 5)
        assert allowed is True
        assert count == 5

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
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

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
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

    @patch("candid.controllers.helpers.rate_limiting.get_redis")
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

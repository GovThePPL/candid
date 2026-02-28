"""
Tests for AbandonmentTracker (Redis-backed).

Uses mock Redis to test without Docker dependencies.
"""

import time
from unittest.mock import AsyncMock

import pytest

from chat_server.services.abandonment import (
    AbandonmentTracker,
    ABANDONMENT_TIMEOUT,
    ABANDONMENT_KEY,
)


def _make_mock_redis():
    """Create a mock async Redis client."""
    mock = AsyncMock()
    return mock


class TestAbandonmentTracker:
    """Tests for the AbandonmentTracker class."""

    @pytest.mark.asyncio
    async def test_start_creates_timer(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscore.return_value = 12345.0
        tracker = AbandonmentTracker(redis=mock_redis)

        await tracker.start("chat-1", "user-a")

        mock_redis.zadd.assert_called_once()
        args = mock_redis.zadd.call_args
        assert args[0][0] == ABANDONMENT_KEY
        member_dict = args[0][1]
        assert "chat-1:user-a" in member_dict
        # Score should be future timestamp
        assert member_dict["chat-1:user-a"] > time.time() - 1

        # Verify has_timer works
        assert await tracker.has_timer("chat-1", "user-a") is True

    @pytest.mark.asyncio
    async def test_start_multiple_users_same_chat(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscore.return_value = 12345.0
        tracker = AbandonmentTracker(redis=mock_redis)

        await tracker.start("chat-1", "user-a")
        await tracker.start("chat-1", "user-b")

        assert mock_redis.zadd.call_count == 2

    @pytest.mark.asyncio
    async def test_cancel_removes_timer(self):
        mock_redis = _make_mock_redis()
        mock_redis.zrem.return_value = 1
        tracker = AbandonmentTracker(redis=mock_redis)

        result = await tracker.cancel("chat-1", "user-a")

        assert result is True
        mock_redis.zrem.assert_called_once_with(ABANDONMENT_KEY, "chat-1:user-a")

    @pytest.mark.asyncio
    async def test_cancel_returns_false_when_no_timer(self):
        mock_redis = _make_mock_redis()
        mock_redis.zrem.return_value = 0
        tracker = AbandonmentTracker(redis=mock_redis)

        result = await tracker.cancel("chat-1", "user-a")

        assert result is False

    @pytest.mark.asyncio
    async def test_cancel_all_for_user(self):
        mock_redis = _make_mock_redis()
        # Simulate ZSCAN returning two matching entries then done
        mock_redis.zscan.side_effect = [
            (0, [(b"chat-1:user-a", 100.0), (b"chat-2:user-a", 200.0)]),
        ]
        tracker = AbandonmentTracker(redis=mock_redis)

        cancelled = await tracker.cancel_all_for_user("user-a")

        assert set(cancelled) == {"chat-1", "chat-2"}
        assert mock_redis.zrem.call_count == 2

    @pytest.mark.asyncio
    async def test_cancel_all_for_user_returns_empty_when_no_timers(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscan.return_value = (0, [])
        tracker = AbandonmentTracker(redis=mock_redis)

        cancelled = await tracker.cancel_all_for_user("user-a")

        assert cancelled == []

    @pytest.mark.asyncio
    async def test_cancel_all_for_chat(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscan.side_effect = [
            (0, [(b"chat-1:user-a", 100.0), (b"chat-1:user-b", 200.0)]),
        ]
        tracker = AbandonmentTracker(redis=mock_redis)

        await tracker.cancel_all_for_chat("chat-1")

        assert mock_redis.zrem.call_count == 2

    @pytest.mark.asyncio
    async def test_get_expired_returns_and_removes_entries(self):
        mock_redis = _make_mock_redis()
        # Simulate Lua script returning expired entries
        mock_redis.eval.return_value = [b"chat-1:user-a", b"chat-2:user-b"]
        tracker = AbandonmentTracker(redis=mock_redis)

        expired = await tracker.get_expired()

        assert expired == [("chat-1", "user-a"), ("chat-2", "user-b")]
        mock_redis.eval.assert_called_once()
        # Verify it called eval with ABANDONMENT_KEY and a timestamp
        args = mock_redis.eval.call_args[0]
        assert ABANDONMENT_KEY in args

    @pytest.mark.asyncio
    async def test_get_expired_returns_empty_when_none(self):
        mock_redis = _make_mock_redis()
        mock_redis.eval.return_value = []
        tracker = AbandonmentTracker(redis=mock_redis)

        expired = await tracker.get_expired()

        assert expired == []

    @pytest.mark.asyncio
    async def test_get_expired_is_atomic(self):
        """Verify get_expired uses Lua script for atomicity."""
        mock_redis = _make_mock_redis()
        mock_redis.eval.return_value = [b"chat-1:user-a"]
        tracker = AbandonmentTracker(redis=mock_redis)

        await tracker.get_expired()

        # Should use eval (Lua script), not separate ZRANGEBYSCORE + ZREMRANGEBYSCORE
        mock_redis.eval.assert_called_once()
        # The Lua script should reference both ZRANGEBYSCORE and ZREMRANGEBYSCORE
        lua_script = mock_redis.eval.call_args[0][0]
        assert "ZRANGEBYSCORE" in lua_script
        assert "ZREMRANGEBYSCORE" in lua_script

    @pytest.mark.asyncio
    async def test_has_timer_returns_true(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscore.return_value = 12345.0
        tracker = AbandonmentTracker(redis=mock_redis)

        assert await tracker.has_timer("chat-1", "user-a") is True

    @pytest.mark.asyncio
    async def test_has_timer_returns_false(self):
        mock_redis = _make_mock_redis()
        mock_redis.zscore.return_value = None
        tracker = AbandonmentTracker(redis=mock_redis)

        assert await tracker.has_timer("chat-1", "user-a") is False

    def test_timeout_constant(self):
        """Verify the timeout is 2 minutes."""
        assert ABANDONMENT_TIMEOUT == 120

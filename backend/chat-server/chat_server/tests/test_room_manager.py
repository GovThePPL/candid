"""
Unit tests for room manager service.

Tests local in-memory behavior and Redis-backed cross-pod presence.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from chat_server.services.room_manager import RoomManager, UserSession, POD_ID


def _make_mock_redis():
    """Create a mock async Redis client.

    redis.asyncio's pipeline() is synchronous and returns a pipeline object.
    Pipeline methods (sadd, srem, etc.) are synchronous (they queue commands).
    Only execute() is async.
    """
    mock = AsyncMock()
    pipe = MagicMock()
    pipe.execute = AsyncMock()
    mock.pipeline = MagicMock(return_value=pipe)
    return mock


class TestUserSession:
    """Tests for UserSession dataclass."""

    def test_user_session_creation(self):
        """Test creating a UserSession."""
        session = UserSession(user_id="user123", sid="sid456")

        assert session.user_id == "user123"
        assert session.sid == "sid456"


class TestRoomManagerSessions:
    """Tests for session management."""

    @pytest.mark.asyncio
    async def test_add_session(self):
        """Test adding a session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        session = await manager.add_session(sid, user_id)

        assert session.user_id == user_id
        assert session.sid == sid

    @pytest.mark.asyncio
    async def test_add_multiple_sessions_same_user(self):
        """Test adding multiple sessions for same user."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        await manager.add_session("sid1", user_id)
        await manager.add_session("sid2", user_id)
        await manager.add_session("sid3", user_id)

        sids = manager.get_user_sids(user_id)
        assert len(sids) == 3
        assert "sid1" in sids
        assert "sid2" in sids
        assert "sid3" in sids

    @pytest.mark.asyncio
    async def test_remove_session(self):
        """Test removing a session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        await manager.add_session(sid, user_id)
        session = await manager.remove_session(sid)

        assert session is not None
        assert session.user_id == user_id
        assert manager.get_session(sid) is None

    @pytest.mark.asyncio
    async def test_remove_nonexistent_session(self):
        """Test removing a non-existent session."""
        manager = RoomManager()
        session = await manager.remove_session("nonexistent")
        assert session is None

    @pytest.mark.asyncio
    async def test_remove_last_session_clears_user(self):
        """Test that removing last session clears user from tracking."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        await manager.add_session("sid1", user_id)
        await manager.remove_session("sid1")

        assert manager.get_user_sids(user_id) == set()

    @pytest.mark.asyncio
    async def test_remove_one_of_multiple_sessions(self):
        """Test removing one session when user has multiple."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        await manager.add_session("sid1", user_id)
        await manager.add_session("sid2", user_id)

        await manager.remove_session("sid1")

        sids = manager.get_user_sids(user_id)
        assert len(sids) == 1
        assert "sid2" in sids

    @pytest.mark.asyncio
    async def test_get_session(self):
        """Test getting a session by sid."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        await manager.add_session(sid, user_id)
        session = manager.get_session(sid)

        assert session is not None
        assert session.sid == sid
        assert session.user_id == user_id

    def test_get_nonexistent_session(self):
        """Test getting a non-existent session."""
        manager = RoomManager()
        session = manager.get_session("nonexistent")
        assert session is None

    @pytest.mark.asyncio
    async def test_get_user_id(self):
        """Test getting user ID from session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        await manager.add_session(sid, user_id)

        assert manager.get_user_id(sid) == user_id

    def test_get_user_id_nonexistent(self):
        """Test getting user ID for non-existent session."""
        manager = RoomManager()
        assert manager.get_user_id("nonexistent") is None


class TestRoomManagerUserTracking:
    """Tests for user connection tracking."""

    @pytest.mark.asyncio
    async def test_is_user_connected_local_fallback(self):
        """Test local fallback when no Redis available."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        assert await manager.is_user_connected(user_id) is False

        await manager.add_session("sid1", user_id)
        assert await manager.is_user_connected(user_id) is True

    @pytest.mark.asyncio
    async def test_is_user_connected_redis(self):
        """Test Redis-backed presence check."""
        mock_redis = _make_mock_redis()
        mock_redis.scard.return_value = 2
        manager = RoomManager(redis=mock_redis)

        result = await manager.is_user_connected("user-123")

        assert result is True
        mock_redis.scard.assert_called_once_with("chat:user_sids:user-123")

    @pytest.mark.asyncio
    async def test_is_user_connected_redis_returns_false(self):
        """Test Redis returns false when no sids."""
        mock_redis = _make_mock_redis()
        mock_redis.scard.return_value = 0
        manager = RoomManager(redis=mock_redis)

        result = await manager.is_user_connected("user-123")

        assert result is False

    @pytest.mark.asyncio
    async def test_is_user_connected_after_disconnect(self):
        """Test that user is not connected after all sessions removed."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        await manager.add_session("sid1", user_id)
        await manager.add_session("sid2", user_id)

        await manager.remove_session("sid1")
        assert await manager.is_user_connected(user_id) is True

        await manager.remove_session("sid2")
        assert await manager.is_user_connected(user_id) is False

    @pytest.mark.asyncio
    async def test_get_user_sids_empty(self):
        """Test getting sids for user with no sessions."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        sids = manager.get_user_sids(user_id)
        assert sids == set()

    @pytest.mark.asyncio
    async def test_get_user_sids_returns_copy(self):
        """Test that get_user_sids returns a copy."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        await manager.add_session("sid1", user_id)
        sids1 = manager.get_user_sids(user_id)
        sids2 = manager.get_user_sids(user_id)

        assert sids1 == sids2
        assert sids1 is not sids2

        sids1.add("modified")
        assert "modified" not in manager.get_user_sids(user_id)


class TestRoomManagerRedis:
    """Tests for Redis-backed operations."""

    @pytest.mark.asyncio
    async def test_add_session_writes_to_redis(self):
        """Test that add_session tracks sid in Redis."""
        mock_redis = _make_mock_redis()
        pipe = mock_redis.pipeline.return_value
        manager = RoomManager(redis=mock_redis)

        await manager.add_session("sid-1", "user-abc")

        # Verify pipeline was used with correct Redis commands
        pipe.sadd.assert_any_call("chat:user_sids:user-abc", "sid-1")
        pipe.sadd.assert_any_call(f"chat:pod_sids:{POD_ID}", "sid-1")
        pipe.set.assert_called_once_with("chat:sid_user:sid-1", "user-abc")
        pipe.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_remove_session_cleans_redis(self):
        """Test that remove_session removes sid from Redis."""
        mock_redis = _make_mock_redis()
        pipe = mock_redis.pipeline.return_value
        manager = RoomManager(redis=mock_redis)

        await manager.add_session("sid-1", "user-abc")
        pipe.reset_mock()

        await manager.remove_session("sid-1")

        pipe.srem.assert_any_call("chat:user_sids:user-abc", "sid-1")
        pipe.srem.assert_any_call(f"chat:pod_sids:{POD_ID}", "sid-1")
        pipe.delete.assert_called_once_with("chat:sid_user:sid-1")
        pipe.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_stale_sids(self):
        """Test crash cleanup removes stale sids from Redis."""
        mock_redis = _make_mock_redis()
        pipe = mock_redis.pipeline.return_value
        # Simulate stale sids from a previous incarnation
        mock_redis.smembers.return_value = {b"stale-sid-1", b"stale-sid-2"}
        mock_redis.get.side_effect = [b"user-1", b"user-2"]

        manager = RoomManager(redis=mock_redis)
        await manager.cleanup_stale_sids()

        mock_redis.smembers.assert_called_once_with(f"chat:pod_sids:{POD_ID}")
        # Should remove each stale sid from its user set
        pipe.srem.assert_any_call("chat:user_sids:user-1", "stale-sid-1")
        pipe.srem.assert_any_call("chat:user_sids:user-2", "stale-sid-2")
        pipe.delete.assert_any_call(f"chat:pod_sids:{POD_ID}")
        pipe.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_stale_sids_noop_when_empty(self):
        """Test cleanup does nothing when no stale sids exist."""
        mock_redis = _make_mock_redis()
        mock_redis.smembers.return_value = set()

        manager = RoomManager(redis=mock_redis)
        await manager.cleanup_stale_sids()

        # Pipeline should not be created since there are no stale sids
        mock_redis.pipeline.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleanup_stale_sids_noop_without_redis(self):
        """Test cleanup does nothing when Redis is not configured."""
        manager = RoomManager()
        await manager.cleanup_stale_sids()  # Should not raise


class TestRoomNames:
    """Tests for room name generation."""

    def test_user_room(self):
        """Test user room name generation."""
        user_id = "user123"
        room = RoomManager.user_room(user_id)
        assert room == "user:user123"

    def test_chat_room(self):
        """Test chat room name generation."""
        chat_id = "chat456"
        room = RoomManager.chat_room(chat_id)
        assert room == "chat:chat456"

    def test_room_names_are_static(self):
        """Test that room name methods are static."""
        assert RoomManager.user_room("test") == "user:test"
        assert RoomManager.chat_room("test") == "chat:test"


class TestMultipleUsers:
    """Tests for multiple users scenario."""

    @pytest.mark.asyncio
    async def test_multiple_users(self):
        """Test managing multiple users."""
        manager = RoomManager()

        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())
        user3 = str(uuid.uuid4())

        await manager.add_session("u1s1", user1)
        await manager.add_session("u1s2", user1)
        await manager.add_session("u2s1", user2)
        await manager.add_session("u3s1", user3)

        assert len(manager.get_user_sids(user1)) == 2
        assert len(manager.get_user_sids(user2)) == 1
        assert len(manager.get_user_sids(user3)) == 1

        assert await manager.is_user_connected(user1)
        assert await manager.is_user_connected(user2)
        assert await manager.is_user_connected(user3)

    @pytest.mark.asyncio
    async def test_sessions_independent(self):
        """Test that sessions are independent between users."""
        manager = RoomManager()

        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        await manager.add_session("sid1", user1)
        await manager.add_session("sid2", user2)

        # Removing user1's session shouldn't affect user2
        await manager.remove_session("sid1")

        assert not await manager.is_user_connected(user1)
        assert await manager.is_user_connected(user2)

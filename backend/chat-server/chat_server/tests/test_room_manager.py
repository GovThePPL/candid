"""
Unit tests for room manager service.
"""

import uuid

import pytest

from chat_server.services.room_manager import RoomManager, UserSession


class TestUserSession:
    """Tests for UserSession dataclass."""

    def test_user_session_creation(self):
        """Test creating a UserSession."""
        session = UserSession(user_id="user123", sid="sid456")

        assert session.user_id == "user123"
        assert session.sid == "sid456"


class TestRoomManagerSessions:
    """Tests for session management."""

    def test_add_session(self):
        """Test adding a session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        session = manager.add_session(sid, user_id)

        assert session.user_id == user_id
        assert session.sid == sid

    def test_add_multiple_sessions_same_user(self):
        """Test adding multiple sessions for same user."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        manager.add_session("sid1", user_id)
        manager.add_session("sid2", user_id)
        manager.add_session("sid3", user_id)

        sids = manager.get_user_sids(user_id)
        assert len(sids) == 3
        assert "sid1" in sids
        assert "sid2" in sids
        assert "sid3" in sids

    def test_remove_session(self):
        """Test removing a session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        manager.add_session(sid, user_id)
        session = manager.remove_session(sid)

        assert session is not None
        assert session.user_id == user_id
        assert manager.get_session(sid) is None

    def test_remove_nonexistent_session(self):
        """Test removing a non-existent session."""
        manager = RoomManager()
        session = manager.remove_session("nonexistent")
        assert session is None

    def test_remove_last_session_clears_user(self):
        """Test that removing last session clears user from tracking."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        manager.add_session("sid1", user_id)
        manager.remove_session("sid1")

        assert manager.get_user_sids(user_id) == set()

    def test_remove_one_of_multiple_sessions(self):
        """Test removing one session when user has multiple."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        manager.add_session("sid1", user_id)
        manager.add_session("sid2", user_id)

        manager.remove_session("sid1")

        sids = manager.get_user_sids(user_id)
        assert len(sids) == 1
        assert "sid2" in sids

    def test_get_session(self):
        """Test getting a session by sid."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        manager.add_session(sid, user_id)
        session = manager.get_session(sid)

        assert session is not None
        assert session.sid == sid
        assert session.user_id == user_id

    def test_get_nonexistent_session(self):
        """Test getting a non-existent session."""
        manager = RoomManager()
        session = manager.get_session("nonexistent")
        assert session is None

    def test_get_user_id(self):
        """Test getting user ID from session."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())
        sid = "test-sid"

        manager.add_session(sid, user_id)

        assert manager.get_user_id(sid) == user_id

    def test_get_user_id_nonexistent(self):
        """Test getting user ID for non-existent session."""
        manager = RoomManager()
        assert manager.get_user_id("nonexistent") is None


class TestRoomManagerUserTracking:
    """Tests for user connection tracking."""

    def test_is_user_connected(self):
        """Test checking if user is connected."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        assert manager.is_user_connected(user_id) is False

        manager.add_session("sid1", user_id)
        assert manager.is_user_connected(user_id) is True

    def test_is_user_connected_after_disconnect(self):
        """Test that user is not connected after all sessions removed."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        manager.add_session("sid1", user_id)
        manager.add_session("sid2", user_id)

        manager.remove_session("sid1")
        assert manager.is_user_connected(user_id) is True

        manager.remove_session("sid2")
        assert manager.is_user_connected(user_id) is False

    def test_get_user_sids_empty(self):
        """Test getting sids for user with no sessions."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        sids = manager.get_user_sids(user_id)
        assert sids == set()

    def test_get_user_sids_returns_copy(self):
        """Test that get_user_sids returns a copy."""
        manager = RoomManager()
        user_id = str(uuid.uuid4())

        manager.add_session("sid1", user_id)
        sids1 = manager.get_user_sids(user_id)
        sids2 = manager.get_user_sids(user_id)

        # Should be equal but not the same object
        assert sids1 == sids2
        assert sids1 is not sids2

        # Modifying one shouldn't affect the other
        sids1.add("modified")
        assert "modified" not in manager.get_user_sids(user_id)


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
        # Should work without instance
        assert RoomManager.user_room("test") == "user:test"
        assert RoomManager.chat_room("test") == "chat:test"


class TestMultipleUsers:
    """Tests for multiple users scenario."""

    def test_multiple_users(self):
        """Test managing multiple users."""
        manager = RoomManager()

        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())
        user3 = str(uuid.uuid4())

        manager.add_session("u1s1", user1)
        manager.add_session("u1s2", user1)
        manager.add_session("u2s1", user2)
        manager.add_session("u3s1", user3)

        assert len(manager.get_user_sids(user1)) == 2
        assert len(manager.get_user_sids(user2)) == 1
        assert len(manager.get_user_sids(user3)) == 1

        assert manager.is_user_connected(user1)
        assert manager.is_user_connected(user2)
        assert manager.is_user_connected(user3)

    def test_sessions_independent(self):
        """Test that sessions are independent between users."""
        manager = RoomManager()

        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        manager.add_session("sid1", user1)
        manager.add_session("sid2", user2)

        # Removing user1's session shouldn't affect user2
        manager.remove_session("sid1")

        assert not manager.is_user_connected(user1)
        assert manager.is_user_connected(user2)

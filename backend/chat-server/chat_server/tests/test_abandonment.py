"""
Tests for AbandonmentTracker.

This test file can run without Docker dependencies (aiohttp, redis, etc.)
by loading the abandonment module directly from its file path rather than
through the chat_server.services package (which pulls in aiohttp).
"""

import importlib.util
import os
import time
from unittest.mock import patch

# Load the abandonment module directly to avoid services/__init__.py
_module_path = os.path.join(
    os.path.dirname(__file__), "..", "services", "abandonment.py"
)
_spec = importlib.util.spec_from_file_location("abandonment", _module_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
AbandonmentTracker = _mod.AbandonmentTracker
ABANDONMENT_TIMEOUT = _mod.ABANDONMENT_TIMEOUT


class TestAbandonmentTracker:
    """Tests for the AbandonmentTracker class."""

    def test_start_creates_timer(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        assert tracker.has_timer("chat-1", "user-a")

    def test_start_multiple_users_same_chat(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        tracker.start("chat-1", "user-b")
        assert tracker.has_timer("chat-1", "user-a")
        assert tracker.has_timer("chat-1", "user-b")

    def test_start_multiple_chats_same_user(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        tracker.start("chat-2", "user-a")
        assert tracker.has_timer("chat-1", "user-a")
        assert tracker.has_timer("chat-2", "user-a")

    def test_cancel_removes_timer(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        result = tracker.cancel("chat-1", "user-a")
        assert result is True
        assert not tracker.has_timer("chat-1", "user-a")

    def test_cancel_returns_false_when_no_timer(self):
        tracker = AbandonmentTracker()
        result = tracker.cancel("chat-1", "user-a")
        assert result is False

    def test_cancel_preserves_other_users(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        tracker.start("chat-1", "user-b")
        tracker.cancel("chat-1", "user-a")
        assert not tracker.has_timer("chat-1", "user-a")
        assert tracker.has_timer("chat-1", "user-b")

    def test_cancel_all_for_user(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        tracker.start("chat-2", "user-a")
        tracker.start("chat-1", "user-b")

        cancelled = tracker.cancel_all_for_user("user-a")
        assert set(cancelled) == {"chat-1", "chat-2"}
        assert not tracker.has_timer("chat-1", "user-a")
        assert not tracker.has_timer("chat-2", "user-a")
        # user-b's timer should remain
        assert tracker.has_timer("chat-1", "user-b")

    def test_cancel_all_for_user_returns_empty_when_no_timers(self):
        tracker = AbandonmentTracker()
        cancelled = tracker.cancel_all_for_user("user-a")
        assert cancelled == []

    def test_cancel_all_for_chat(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        tracker.start("chat-1", "user-b")
        tracker.start("chat-2", "user-a")

        tracker.cancel_all_for_chat("chat-1")
        assert not tracker.has_timer("chat-1", "user-a")
        assert not tracker.has_timer("chat-1", "user-b")
        # chat-2 should remain
        assert tracker.has_timer("chat-2", "user-a")

    def test_cancel_all_for_chat_noop_when_no_chat(self):
        tracker = AbandonmentTracker()
        # Should not raise
        tracker.cancel_all_for_chat("nonexistent")

    def test_get_expired_returns_empty_before_timeout(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        expired = tracker.get_expired()
        assert expired == []
        # Timer should still be active
        assert tracker.has_timer("chat-1", "user-a")

    def test_get_expired_returns_expired_timers(self):
        tracker = AbandonmentTracker()
        # Manually set a leave time in the past
        past_time = time.time() - ABANDONMENT_TIMEOUT - 1
        tracker._pending["chat-1"] = {"user-a": past_time}

        expired = tracker.get_expired()
        assert expired == [("chat-1", "user-a")]
        # Timer should be removed after get_expired
        assert not tracker.has_timer("chat-1", "user-a")

    def test_get_expired_only_returns_expired(self):
        tracker = AbandonmentTracker()
        past_time = time.time() - ABANDONMENT_TIMEOUT - 1
        tracker._pending["chat-1"] = {
            "user-a": past_time,  # expired
            "user-b": time.time(),  # not expired
        }

        expired = tracker.get_expired()
        assert expired == [("chat-1", "user-a")]
        assert not tracker.has_timer("chat-1", "user-a")
        assert tracker.has_timer("chat-1", "user-b")

    def test_get_expired_cleans_up_empty_chat_entries(self):
        tracker = AbandonmentTracker()
        past_time = time.time() - ABANDONMENT_TIMEOUT - 1
        tracker._pending["chat-1"] = {"user-a": past_time}

        tracker.get_expired()
        # Internal dict should not have the chat-1 key anymore
        assert "chat-1" not in tracker._pending

    def test_has_timer_returns_false_for_missing(self):
        tracker = AbandonmentTracker()
        assert not tracker.has_timer("chat-1", "user-a")

    def test_get_all_pending_returns_copy(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        pending = tracker.get_all_pending()
        assert "chat-1" in pending
        assert "user-a" in pending["chat-1"]
        # Modifying the copy should not affect the tracker
        pending["chat-1"]["user-a"] = 0
        assert tracker._pending["chat-1"]["user-a"] != 0

    def test_start_overwrites_existing_timer(self):
        tracker = AbandonmentTracker()
        tracker.start("chat-1", "user-a")
        first_time = tracker._pending["chat-1"]["user-a"]
        time.sleep(0.01)
        tracker.start("chat-1", "user-a")
        second_time = tracker._pending["chat-1"]["user-a"]
        assert second_time > first_time

    def test_timeout_constant(self):
        """Verify the timeout is 2 minutes."""
        assert ABANDONMENT_TIMEOUT == 120

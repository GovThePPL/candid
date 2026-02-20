"""
Abandonment detection for active chats.

Tracks users who have disconnected or navigated away from active chats.
If they don't return within ABANDONMENT_TIMEOUT seconds, the chat is
auto-ended by the background checker in services/__init__.py.
"""

import logging
import time

logger = logging.getLogger(__name__)

# How long to wait before auto-ending a chat after a user leaves (2 minutes)
ABANDONMENT_TIMEOUT = 120


class AbandonmentTracker:
    """Tracks users who left active chats, pending auto-end."""

    def __init__(self):
        # {chat_id: {user_id: leave_time}}
        self._pending: dict[str, dict[str, float]] = {}

    def start(self, chat_id: str, user_id: str) -> None:
        """Start an abandonment timer for a user in a chat."""
        if chat_id not in self._pending:
            self._pending[chat_id] = {}
        self._pending[chat_id][user_id] = time.time()
        logger.info(
            f"Abandonment timer started for user {user_id} in chat {chat_id}"
        )

    def cancel(self, chat_id: str, user_id: str) -> bool:
        """Cancel an abandonment timer. Returns True if a timer was active."""
        chat_timers = self._pending.get(chat_id)
        if chat_timers and user_id in chat_timers:
            del chat_timers[user_id]
            if not chat_timers:
                del self._pending[chat_id]
            logger.info(
                f"Abandonment timer cancelled for user {user_id} in chat {chat_id}"
            )
            return True
        return False

    def cancel_all_for_user(self, user_id: str) -> list[str]:
        """Cancel all abandonment timers for a user. Returns chat IDs that had timers."""
        cancelled_chats = []
        empty_chats = []
        for chat_id, chat_timers in self._pending.items():
            if user_id in chat_timers:
                del chat_timers[user_id]
                cancelled_chats.append(chat_id)
                if not chat_timers:
                    empty_chats.append(chat_id)
        for chat_id in empty_chats:
            del self._pending[chat_id]
        if cancelled_chats:
            logger.info(
                f"Abandonment timers cancelled for user {user_id} in chats: {cancelled_chats}"
            )
        return cancelled_chats

    def cancel_all_for_chat(self, chat_id: str) -> None:
        """Cancel all abandonment timers for a chat."""
        if chat_id in self._pending:
            del self._pending[chat_id]
            logger.info(f"All abandonment timers cancelled for chat {chat_id}")

    def get_expired(self) -> list[tuple[str, str]]:
        """Get all expired timers. Returns list of (chat_id, user_id) tuples."""
        now = time.time()
        expired = []
        for chat_id, chat_timers in self._pending.items():
            for user_id, leave_time in chat_timers.items():
                if now - leave_time >= ABANDONMENT_TIMEOUT:
                    expired.append((chat_id, user_id))
        # Remove expired entries
        for chat_id, user_id in expired:
            chat_timers = self._pending.get(chat_id)
            if chat_timers:
                chat_timers.pop(user_id, None)
                if not chat_timers:
                    self._pending.pop(chat_id, None)
        return expired

    def has_timer(self, chat_id: str, user_id: str) -> bool:
        """Check if a user has an active abandonment timer for a chat."""
        chat_timers = self._pending.get(chat_id)
        return bool(chat_timers and user_id in chat_timers)

    def get_all_pending(self) -> dict[str, dict[str, float]]:
        """Get a copy of all pending timers (for debugging/testing)."""
        return {
            chat_id: dict(timers)
            for chat_id, timers in self._pending.items()
        }

"""
Socket.IO room management service.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Timeout for inactive sessions (2 minutes)
SESSION_TIMEOUT_SECONDS = 120


@dataclass
class UserSession:
    """Tracks a user's WebSocket session."""

    user_id: str
    sid: str  # Socket.IO session ID
    last_activity: float = field(default_factory=time.time)  # Unix timestamp


class RoomManager:
    """Manages Socket.IO rooms and user sessions."""

    def __init__(self):
        # sid -> UserSession
        self._sessions: dict[str, UserSession] = {}
        # user_id -> set of sids (user can have multiple connections)
        self._user_sids: dict[str, set[str]] = {}

    def add_session(self, sid: str, user_id: str) -> UserSession:
        """Register a new user session."""
        session = UserSession(user_id=user_id, sid=sid)
        self._sessions[sid] = session

        if user_id not in self._user_sids:
            self._user_sids[user_id] = set()
        self._user_sids[user_id].add(sid)

        logger.info(f"Added session {sid} for user {user_id}")
        return session

    def remove_session(self, sid: str) -> Optional[UserSession]:
        """Remove a user session."""
        session = self._sessions.pop(sid, None)
        if session:
            user_sids = self._user_sids.get(session.user_id)
            if user_sids:
                user_sids.discard(sid)
                if not user_sids:
                    del self._user_sids[session.user_id]
            logger.info(f"Removed session {sid} for user {session.user_id}")
        return session

    def get_session(self, sid: str) -> Optional[UserSession]:
        """Get session by socket ID."""
        return self._sessions.get(sid)

    def get_user_id(self, sid: str) -> Optional[str]:
        """Get user ID for a socket session."""
        session = self._sessions.get(sid)
        return session.user_id if session else None

    def get_user_sids(self, user_id: str) -> set[str]:
        """Get all socket IDs for a user."""
        return self._user_sids.get(user_id, set()).copy()

    def is_user_connected(self, user_id: str) -> bool:
        """Check if a user has any active connections."""
        return bool(self._user_sids.get(user_id))

    def update_activity(self, sid: str) -> None:
        """Update the last activity timestamp for a session."""
        session = self._sessions.get(sid)
        if session:
            session.last_activity = time.time()

    def get_timed_out_sessions(self) -> list[UserSession]:
        """Get all sessions that have timed out due to inactivity."""
        now = time.time()
        timed_out = []
        for session in self._sessions.values():
            if now - session.last_activity > SESSION_TIMEOUT_SECONDS:
                timed_out.append(session)
        return timed_out

    def get_all_sessions(self) -> list[UserSession]:
        """Get all active sessions."""
        return list(self._sessions.values())

    @staticmethod
    def user_room(user_id: str) -> str:
        """Get the personal room name for a user."""
        return f"user:{user_id}"

    @staticmethod
    def chat_room(chat_id: str) -> str:
        """Get the room name for a chat."""
        return f"chat:{chat_id}"

"""
Socket.IO room management service.

Local in-memory state tracks sessions on this pod. Redis provides cross-pod
presence queries so any pod can check if a user is connected globally.
"""

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Timeout for inactive sessions (2 minutes)
SESSION_TIMEOUT_SECONDS = 120

# Pod identifier — K8s sets HOSTNAME to the pod name
POD_ID = os.environ.get("HOSTNAME", "default")


@dataclass
class UserSession:
    """Tracks a user's WebSocket session."""

    user_id: str
    sid: str  # Socket.IO session ID
    last_activity: float = field(default_factory=time.time)  # Unix timestamp


class RoomManager:
    """Manages Socket.IO rooms and user sessions.

    Local state (_sessions, _user_sids) tracks this pod's connections.
    Redis tracks global presence across all pods.
    """

    def __init__(self, redis=None):
        # sid -> UserSession
        self._sessions: dict[str, UserSession] = {}
        # user_id -> set of sids (user can have multiple connections)
        self._user_sids: dict[str, set[str]] = {}
        # Async Redis client for cross-pod presence
        self._redis = redis

    async def cleanup_stale_sids(self) -> None:
        """Remove stale sids from a previous pod incarnation.

        On startup, any sids registered under this pod's ID in Redis are
        leftover from a crash. Remove them from their user sets and clear
        the pod set.
        """
        if not self._redis:
            return

        pod_key = f"chat:pod_sids:{POD_ID}"
        stale_sids = await self._redis.smembers(pod_key)
        if not stale_sids:
            return

        logger.info(f"Cleaning up {len(stale_sids)} stale sids from previous incarnation of {POD_ID}")
        pipe = self._redis.pipeline()
        for sid_bytes in stale_sids:
            sid = sid_bytes.decode() if isinstance(sid_bytes, bytes) else sid_bytes
            # We don't know the user_id, so we stored it as sid -> user_id mapping
            user_id = await self._redis.get(f"chat:sid_user:{sid}")
            if user_id:
                user_id = user_id.decode() if isinstance(user_id, bytes) else user_id
                pipe.srem(f"chat:user_sids:{user_id}", sid)
                pipe.delete(f"chat:sid_user:{sid}")
        pipe.delete(pod_key)
        await pipe.execute()
        logger.info(f"Stale sid cleanup complete for pod {POD_ID}")

    async def add_session(self, sid: str, user_id: str) -> UserSession:
        """Register a new user session."""
        session = UserSession(user_id=user_id, sid=sid)
        self._sessions[sid] = session

        if user_id not in self._user_sids:
            self._user_sids[user_id] = set()
        self._user_sids[user_id].add(sid)

        # Track in Redis for cross-pod presence
        if self._redis:
            pipe = self._redis.pipeline()
            pipe.sadd(f"chat:user_sids:{user_id}", sid)
            pipe.sadd(f"chat:pod_sids:{POD_ID}", sid)
            pipe.set(f"chat:sid_user:{sid}", user_id)
            await pipe.execute()

        logger.info(f"Added session {sid} for user {user_id}")
        return session

    async def remove_session(self, sid: str) -> Optional[UserSession]:
        """Remove a user session."""
        session = self._sessions.pop(sid, None)
        if session:
            user_sids = self._user_sids.get(session.user_id)
            if user_sids:
                user_sids.discard(sid)
                if not user_sids:
                    del self._user_sids[session.user_id]

            # Remove from Redis
            if self._redis:
                pipe = self._redis.pipeline()
                pipe.srem(f"chat:user_sids:{session.user_id}", sid)
                pipe.srem(f"chat:pod_sids:{POD_ID}", sid)
                pipe.delete(f"chat:sid_user:{sid}")
                await pipe.execute()

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
        """Get all LOCAL socket IDs for a user (this pod only)."""
        return self._user_sids.get(user_id, set()).copy()

    async def is_user_connected(self, user_id: str) -> bool:
        """Check if a user has any active connections across all pods."""
        if self._redis:
            count = await self._redis.scard(f"chat:user_sids:{user_id}")
            return count > 0
        # Fallback to local-only check when Redis is unavailable
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

    @staticmethod
    def post_room(post_id: str) -> str:
        """Get the room name for a discuss post."""
        return f"post:{post_id}"

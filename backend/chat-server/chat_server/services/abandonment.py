"""
Abandonment detection for active chats.

Tracks users who have disconnected or navigated away from active chats.
If they don't return within ABANDONMENT_TIMEOUT seconds, the chat is
auto-ended by the background checker in services/__init__.py.

Uses a Redis sorted set for cross-pod consistency. Score = expiry timestamp,
member = "{chat_id}:{user_id}".
"""

import logging
import time

logger = logging.getLogger(__name__)

# How long to wait before auto-ending a chat after a user leaves (2 minutes)
ABANDONMENT_TIMEOUT = 120

# Redis key for the abandonment sorted set
ABANDONMENT_KEY = "chat:abandonment"


class AbandonmentTracker:
    """Tracks users who left active chats, pending auto-end.

    Backed by a Redis sorted set so any pod can start/cancel/claim timers.
    """

    def __init__(self, redis=None):
        self._redis = redis

    async def start(self, chat_id: str, user_id: str) -> None:
        """Start an abandonment timer for a user in a chat."""
        member = f"{chat_id}:{user_id}"
        expiry = time.time() + ABANDONMENT_TIMEOUT
        await self._redis.zadd(ABANDONMENT_KEY, {member: expiry})
        logger.info(
            f"Abandonment timer started for user {user_id} in chat {chat_id}"
        )

    async def cancel(self, chat_id: str, user_id: str) -> bool:
        """Cancel an abandonment timer. Returns True if a timer was active."""
        member = f"{chat_id}:{user_id}"
        removed = await self._redis.zrem(ABANDONMENT_KEY, member)
        if removed:
            logger.info(
                f"Abandonment timer cancelled for user {user_id} in chat {chat_id}"
            )
        return removed > 0

    async def cancel_all_for_user(self, user_id: str) -> list[str]:
        """Cancel all abandonment timers for a user. Returns chat IDs that had timers."""
        suffix = f":{user_id}"
        cancelled_chats = []
        cursor = 0
        while True:
            cursor, results = await self._redis.zscan(
                ABANDONMENT_KEY, cursor, match=f"*{suffix}"
            )
            for member, _score in results:
                member_str = member.decode() if isinstance(member, bytes) else member
                chat_id = member_str.rsplit(":", 1)[0]
                await self._redis.zrem(ABANDONMENT_KEY, member_str)
                cancelled_chats.append(chat_id)
            if cursor == 0:
                break
        if cancelled_chats:
            logger.info(
                f"Abandonment timers cancelled for user {user_id} in chats: {cancelled_chats}"
            )
        return cancelled_chats

    async def cancel_all_for_chat(self, chat_id: str) -> None:
        """Cancel all abandonment timers for a chat."""
        prefix = f"{chat_id}:"
        cursor = 0
        while True:
            cursor, results = await self._redis.zscan(
                ABANDONMENT_KEY, cursor, match=f"{prefix}*"
            )
            for member, _score in results:
                member_str = member.decode() if isinstance(member, bytes) else member
                await self._redis.zrem(ABANDONMENT_KEY, member_str)
            if cursor == 0:
                break
        logger.info(f"All abandonment timers cancelled for chat {chat_id}")

    async def get_expired(self) -> list[tuple[str, str]]:
        """Atomically claim all expired timers.

        Uses a Redis transaction (MULTI/EXEC) to fetch and remove expired
        entries in one atomic operation, preventing duplicate processing
        across pods.

        Returns list of (chat_id, user_id) tuples.
        """
        now = time.time()

        # Use a Lua script for true atomicity (MULTI doesn't help with
        # read-then-delete since another pod could read between commands)
        lua_script = """
        local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        if #expired > 0 then
            redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        end
        return expired
        """
        raw = await self._redis.eval(lua_script, 1, ABANDONMENT_KEY, str(now))

        expired = []
        for member in (raw or []):
            member_str = member.decode() if isinstance(member, bytes) else member
            # member format: "{chat_id}:{user_id}"
            chat_id, user_id = member_str.rsplit(":", 1)
            expired.append((chat_id, user_id))
        return expired

    async def has_timer(self, chat_id: str, user_id: str) -> bool:
        """Check if a user has an active abandonment timer for a chat."""
        member = f"{chat_id}:{user_id}"
        score = await self._redis.zscore(ABANDONMENT_KEY, member)
        return score is not None

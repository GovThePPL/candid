"""
Emoji reaction handlers for chat messages.
"""

import logging
import time
from collections import defaultdict
from datetime import datetime
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)

VALID_EMOJIS = {"agree", "appreciate", "grateful", "considering", "respect"}

# Rate limiting: max 30 reaction events per minute per user
_RATE_LIMIT_MAX = 30
_RATE_LIMIT_WINDOW = 60  # seconds
_rate_limit_buckets: dict[str, list[float]] = defaultdict(list)


def _is_rate_limited(user_id: str) -> bool:
    """Check if user has exceeded reaction rate limit."""
    now = time.monotonic()
    bucket = _rate_limit_buckets[user_id]
    # Prune old entries
    _rate_limit_buckets[user_id] = bucket = [
        t for t in bucket if now - t < _RATE_LIMIT_WINDOW
    ]
    if len(bucket) >= _RATE_LIMIT_MAX:
        return True
    bucket.append(now)
    return False


def register_reaction_handlers(sio: socketio.AsyncServer) -> None:
    """Register reaction-related event handlers."""

    @sio.event
    async def reaction(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle adding/removing a reaction on a message.

        Expected data: {"chatId": "UUID", "messageId": "UUID", "emoji": "agree"|null}
        """
        room_manager = get_room_manager()
        user_id = room_manager.get_user_id(sid)

        if not user_id:
            return {
                "status": "error",
                "code": "NOT_AUTHENTICATED",
                "message": "Not authenticated",
            }

        chat_id = data.get("chatId")
        message_id = data.get("messageId")
        emoji = data.get("emoji")

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        if not message_id:
            return {
                "status": "error",
                "code": "MISSING_MESSAGE_ID",
                "message": "Missing messageId",
            }

        # Validate emoji (must be one of the allowed set or null/empty for removal)
        if emoji is not None and emoji != "" and emoji not in VALID_EMOJIS:
            return {
                "status": "error",
                "code": "INVALID_EMOJI",
                "message": f"Invalid emoji. Must be one of: {', '.join(sorted(VALID_EMOJIS))}",
            }

        # Rate limit
        if _is_rate_limited(user_id):
            return {
                "status": "error",
                "code": "RATE_LIMITED",
                "message": "Too many reactions. Please slow down.",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Process the reaction
        timestamp = datetime.utcnow().isoformat()

        if not emoji:
            # Remove reaction
            await redis_store.remove_reaction(chat_id, message_id, user_id)
            broadcast_emoji = None
        else:
            # Add/replace reaction
            await redis_store.add_reaction(chat_id, message_id, user_id, emoji)
            broadcast_emoji = emoji

        # Broadcast to chat room
        chat_room = room_manager.chat_room(chat_id)
        await sio.emit(
            "reaction",
            {
                "chatId": chat_id,
                "messageId": message_id,
                "userId": user_id,
                "emoji": broadcast_emoji,
                "timestamp": timestamp,
            },
            room=chat_room,
        )

        logger.debug(
            f"Reaction {'removed' if not emoji else emoji} on message {message_id} "
            f"in chat {chat_id} by user {user_id}"
        )

        return {"status": "ok"}

"""
Typing indicator handlers.
"""

import logging
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)


def register_typing_handlers(sio: socketio.AsyncServer) -> None:
    """Register typing indicator event handlers."""

    @sio.event
    async def typing(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle typing indicator updates.

        Expected data: {"chatId": "UUID", "isTyping": true|false}

        Broadcasts to chat room (excluding sender):
        {"chatId": "UUID", "userId": "UUID", "isTyping": true|false}
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
        is_typing = data.get("isTyping", False)

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Broadcast typing status to other participants in the chat room
        chat_room = room_manager.chat_room(chat_id)
        await sio.emit(
            "typing",
            {
                "chatId": chat_id,
                "userId": user_id,
                "isTyping": is_typing,
            },
            room=chat_room,
            skip_sid=sid,  # Don't send back to the sender
        )

        return {"status": "ok"}

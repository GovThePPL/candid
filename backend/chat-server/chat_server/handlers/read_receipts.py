"""
Read receipt handling for chat.
"""

import logging
from typing import Any

import socketio

from ..services import get_room_manager

logger = logging.getLogger(__name__)


def register_read_receipt_handlers(sio: socketio.AsyncServer) -> None:
    """Register read receipt event handlers."""

    @sio.event
    async def mark_read(sid: str, data: dict) -> dict[str, Any]:
        """
        Mark messages as read up to a certain message ID.

        Expected data: {"chatId": "UUID", "messageId": "UUID"}

        Broadcasts to chat room: {
            "chatId": "UUID",
            "userId": "UUID",
            "messageId": "UUID"
        }
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

        # Broadcast read receipt to chat room
        chat_room = room_manager.chat_room(chat_id)
        await sio.emit(
            "read_receipt",
            {
                "chatId": chat_id,
                "userId": user_id,
                "messageId": message_id,
            },
            room=chat_room,
        )

        logger.debug(f"User {user_id} marked messages read up to {message_id} in chat {chat_id}")

        return {"status": "ok"}

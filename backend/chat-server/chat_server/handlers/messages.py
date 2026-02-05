"""
Message handling for chat.
"""

import logging
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)


def register_message_handlers(sio: socketio.AsyncServer) -> None:
    """Register message-related event handlers."""

    @sio.event
    async def message(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle sending a message to a chat.

        Expected data: {"chatId": "UUID", "content": "message text", "messageType": "text"}

        Broadcasts to chat room: {
            "id": "message UUID",
            "chatLogId": "chat UUID",
            "sender": "user UUID",
            "type": "text",
            "content": "message text",
            "sendTime": "ISO8601"
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

        # Update activity timestamp
        room_manager.update_activity(sid)

        chat_id = data.get("chatId")
        content = data.get("content")
        message_type = data.get("messageType", "text")

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        if not content:
            return {
                "status": "error",
                "code": "MISSING_CONTENT",
                "message": "Missing content",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Store message in Redis
        msg = await redis_store.add_message(
            chat_id=chat_id,
            sender_id=user_id,
            content=content,
            message_type=message_type,
        )

        # Broadcast to chat room
        chat_room = room_manager.chat_room(chat_id)
        await sio.emit(
            "message",
            {
                "id": msg.id,
                "chatLogId": chat_id,
                "sender": msg.sender_id,
                "type": msg.type,
                "content": msg.content,
                "sendTime": msg.timestamp,
            },
            room=chat_room,
        )

        logger.debug(f"Message {msg.id} sent to chat {chat_id} by user {user_id}")

        return {"status": "sent", "messageId": msg.id}

    @sio.event
    async def get_messages(sid: str, data: dict) -> dict[str, Any]:
        """
        Get message history for a chat.

        Expected data: {"chatId": "UUID", "start": 0, "end": -1}

        Returns: {"status": "ok", "messages": [...]}
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

        start = data.get("start", 0)
        end = data.get("end", -1)

        messages = await redis_store.get_messages(chat_id, start, end)

        return {
            "status": "ok",
            "messages": [
                {
                    "id": m.id,
                    "chatLogId": chat_id,
                    "sender": m.sender_id,
                    "type": m.type,
                    "content": m.content,
                    "sendTime": m.timestamp,
                }
                for m in messages
            ],
        }

"""
Chat lifecycle handlers (start, end, status).
"""

import logging
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager, get_chat_exporter

logger = logging.getLogger(__name__)


def register_lifecycle_handlers(sio: socketio.AsyncServer) -> None:
    """Register chat lifecycle event handlers."""

    @sio.event
    async def start_chat(sid: str, data: dict) -> dict[str, Any]:
        """
        Start a chat after a chat request is accepted.
        Called by the REST API or directly after accepting a request.

        Expected data: {"chatRequestId": "UUID"}

        Returns: {"status": "started", "chatId": "UUID"}
        """
        room_manager = get_room_manager()
        user_id = room_manager.get_user_id(sid)

        if not user_id:
            return {
                "status": "error",
                "code": "NOT_AUTHENTICATED",
                "message": "Not authenticated",
            }

        chat_request_id = data.get("chatRequestId")
        if not chat_request_id:
            return {
                "status": "error",
                "code": "MISSING_REQUEST_ID",
                "message": "Missing chatRequestId",
            }

        chat_exporter = get_chat_exporter()
        redis_store = get_redis_store()

        # Create chat_log in PostgreSQL
        chat_id = await chat_exporter.create_chat_log(chat_request_id)
        if not chat_id:
            return {
                "status": "error",
                "code": "CREATE_FAILED",
                "message": "Failed to create chat",
            }

        # Get participants from PostgreSQL
        participants = await chat_exporter.get_chat_participants(chat_id)
        if not participants:
            return {
                "status": "error",
                "code": "PARTICIPANTS_NOT_FOUND",
                "message": "Could not find chat participants",
            }

        # Create chat session in Redis
        await redis_store.create_chat(chat_id, participants)

        # Join both participants to the chat room
        chat_room = room_manager.chat_room(chat_id)
        for participant_id in participants:
            for participant_sid in room_manager.get_user_sids(participant_id):
                await sio.enter_room(participant_sid, chat_room)

        # Notify all participants that chat has started
        await sio.emit(
            "status",
            {
                "chatId": chat_id,
                "status": "active",
                "participants": participants,
            },
            room=chat_room,
        )

        logger.info(f"Chat {chat_id} started with participants {participants}")

        return {
            "status": "started",
            "chatId": chat_id,
            "participants": participants,
        }

    @sio.event
    async def exit_chat(sid: str, data: dict) -> dict[str, Any]:
        """
        Exit a chat (unilateral user exit).

        Expected data: {"chatId": "UUID"}

        Broadcasts to chat room:
        - To other user: {"chatId": "...", "status": "user_left"}
        - To both: {"chatId": "...", "status": "ended"}
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
        chat_exporter = get_chat_exporter()

        # Verify user is a participant
        metadata = await redis_store.get_chat_metadata(chat_id)
        if not metadata or user_id not in metadata.participant_ids:
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Get export data from Redis
        export_data = await redis_store.get_chat_export_data(chat_id)

        # Add who ended the chat
        export_data["endedByUserId"] = user_id

        # Export to PostgreSQL
        success = await chat_exporter.export_chat(
            chat_id=chat_id,
            export_data=export_data,
            end_type="user_exit",
        )

        if not success:
            return {
                "status": "error",
                "code": "EXPORT_FAILED",
                "message": "Failed to export chat",
            }

        # Notify other user that this user left
        chat_room = room_manager.chat_room(chat_id)
        other_user_id = next(
            (uid for uid in metadata.participant_ids if uid != user_id), None
        )

        if other_user_id:
            other_user_room = room_manager.user_room(other_user_id)
            await sio.emit(
                "status",
                {
                    "chatId": chat_id,
                    "status": "user_left",
                    "userId": user_id,
                },
                room=other_user_room,
            )

        # Notify everyone that chat ended
        await sio.emit(
            "status",
            {
                "chatId": chat_id,
                "status": "ended",
                "endType": "user_exit",
            },
            room=chat_room,
        )

        # Remove all users from chat room
        for participant_id in metadata.participant_ids:
            for participant_sid in room_manager.get_user_sids(participant_id):
                await sio.leave_room(participant_sid, chat_room)

        # Delete Redis data
        await redis_store.delete_chat(chat_id)

        logger.info(f"Chat {chat_id} ended by user {user_id} (user_exit)")

        return {"status": "ended", "chatId": chat_id}

    @sio.event
    async def notify_chat_request(sid: str, data: dict) -> dict[str, Any]:
        """
        Notify a user about a new chat request.
        Called by the REST API when a chat request is created.

        Expected data: {
            "userId": "UUID",
            "requestId": "UUID",
            "initiator": {"id": "UUID", "displayName": "..."},
            "position": {"id": "UUID", "statement": "..."},
            "createdTime": "ISO8601"
        }
        """
        room_manager = get_room_manager()
        sender_user_id = room_manager.get_user_id(sid)

        if not sender_user_id:
            return {
                "status": "error",
                "code": "NOT_AUTHENTICATED",
                "message": "Not authenticated",
            }

        target_user_id = data.get("userId")
        if not target_user_id:
            return {
                "status": "error",
                "code": "MISSING_USER_ID",
                "message": "Missing userId",
            }

        # Send notification to target user's personal room
        user_room = room_manager.user_room(target_user_id)
        await sio.emit(
            "chat_request",
            {
                "requestId": data.get("requestId"),
                "initiator": data.get("initiator"),
                "position": data.get("position"),
                "createdTime": data.get("createdTime"),
            },
            room=user_room,
        )

        logger.info(f"Chat request notification sent to user {target_user_id}")

        return {"status": "notified"}

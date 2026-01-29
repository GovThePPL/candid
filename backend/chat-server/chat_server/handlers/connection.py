"""
Connection and authentication handlers.
"""

import logging
from typing import Any

import socketio

from ..auth import validate_token
from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)


def register_connection_handlers(sio: socketio.AsyncServer) -> None:
    """Register connection-related event handlers."""

    @sio.event
    async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
        """Handle new socket connection."""
        logger.info(f"New connection: {sid}")
        # Connection is accepted, but user must authenticate via 'authenticate' event
        return True

    @sio.event
    async def disconnect(sid: str) -> None:
        """Handle socket disconnection."""
        room_manager = get_room_manager()
        session = room_manager.remove_session(sid)

        if session:
            logger.info(f"User {session.user_id} disconnected (sid: {sid})")
        else:
            logger.info(f"Unauthenticated session disconnected: {sid}")

    @sio.event
    async def authenticate(sid: str, data: dict) -> dict[str, Any]:
        """
        Authenticate a socket connection with a JWT token.

        Expected data: {"token": "JWT_TOKEN_HERE"}

        Returns: {"status": "authenticated", "userId": "...", "activeChats": [...]}
        or {"status": "error", "message": "..."}
        """
        token = data.get("token") if isinstance(data, dict) else None

        if not token:
            logger.warning(f"Authentication failed for {sid}: no token provided")
            return {"status": "error", "code": "NO_TOKEN", "message": "No token provided"}

        user_id = validate_token(token)
        if not user_id:
            logger.warning(f"Authentication failed for {sid}: invalid token")
            return {
                "status": "error",
                "code": "INVALID_TOKEN",
                "message": "Invalid or expired token",
            }

        # Register session
        room_manager = get_room_manager()
        room_manager.add_session(sid, user_id)

        # Join user's personal room for notifications
        await sio.enter_room(sid, room_manager.user_room(user_id))

        # Get active chats and join those rooms
        redis_store = get_redis_store()
        active_chats = await redis_store.get_user_active_chats(user_id)

        for chat_id in active_chats:
            await sio.enter_room(sid, room_manager.chat_room(chat_id))

        logger.info(
            f"User {user_id} authenticated (sid: {sid}), active chats: {active_chats}"
        )

        return {
            "status": "authenticated",
            "userId": user_id,
            "activeChats": active_chats,
        }

    @sio.event
    async def join_chat(sid: str, data: dict) -> dict[str, Any]:
        """
        Join a chat room (used when accepting a chat request).

        Expected data: {"chatId": "UUID"}
        """
        room_manager = get_room_manager()
        user_id = room_manager.get_user_id(sid)

        if not user_id:
            return {"status": "error", "code": "NOT_AUTHENTICATED", "message": "Not authenticated"}

        chat_id = data.get("chatId")
        if not chat_id:
            return {"status": "error", "code": "MISSING_CHAT_ID", "message": "Missing chatId"}

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Join the chat room
        await sio.enter_room(sid, room_manager.chat_room(chat_id))

        # Get chat history
        messages = await redis_store.get_messages(chat_id)
        positions = await redis_store.get_all_agreed_positions(chat_id)

        logger.info(f"User {user_id} joined chat {chat_id}")

        return {
            "status": "joined",
            "chatId": chat_id,
            "messages": [m.to_dict() for m in messages],
            "agreedPositions": [p.to_dict() for p in positions],
        }

    @sio.event
    async def ping(sid: str, data: dict = None) -> dict[str, str]:
        """Heartbeat handler."""
        return {"type": "pong"}

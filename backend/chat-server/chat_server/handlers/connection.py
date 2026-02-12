"""
Connection and authentication handlers.
"""

import logging
from typing import Any

import socketio
from socketio.exceptions import ConnectionRefusedError

from ..auth import validate_token
from ..services import get_redis_store, get_room_manager, get_chat_exporter

logger = logging.getLogger(__name__)


def register_connection_handlers(sio: socketio.AsyncServer) -> None:
    """Register connection-related event handlers."""

    @sio.event
    async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
        """
        Authenticate and accept a socket connection at the handshake level.

        The client must pass {"token": "JWT"} in the Socket.IO `auth` option.
        Connections without a valid token are rejected immediately via
        ConnectionRefusedError — no unauthenticated sockets ever exist.
        """
        # --- Validate token ---
        token = auth.get("token") if isinstance(auth, dict) else None
        if not token:
            logger.warning(f"Connection rejected for {sid}: no token provided")
            raise ConnectionRefusedError("authentication required")

        keycloak_id = validate_token(token)
        if not keycloak_id:
            logger.warning(f"Connection rejected for {sid}: invalid token")
            raise ConnectionRefusedError("invalid or expired token")

        # Resolve Keycloak subject → Candid user ID
        chat_exporter = get_chat_exporter()
        user_id = await chat_exporter.resolve_keycloak_id(keycloak_id)
        if not user_id:
            logger.warning(
                f"Connection rejected for {sid}: keycloak_id {keycloak_id} not in users table"
            )
            raise ConnectionRefusedError("user not found")

        # --- Session setup ---
        room_manager = get_room_manager()
        room_manager.add_session(sid, user_id)

        # Join user's personal room for notifications
        await sio.enter_room(sid, room_manager.user_room(user_id))

        # Rejoin active chats
        redis_store = get_redis_store()
        active_chats = await redis_store.get_user_active_chats(user_id)
        for chat_id in active_chats:
            await sio.enter_room(sid, room_manager.chat_room(chat_id))

        logger.info(
            f"User {user_id} connected and authenticated (sid: {sid}), "
            f"active chats: {active_chats}"
        )

        # Send session data to client (connect handler can't return data)
        await sio.emit("authenticated", {
            "userId": user_id,
            "activeChats": active_chats,
        }, to=sid)

        # Catch-up: deliver any pending chat requests the user may have missed
        try:
            pending_requests = await chat_exporter.get_pending_chat_requests(user_id)
            for card in pending_requests:
                await sio.emit("chat_request_received", card, to=sid)
            if pending_requests:
                logger.info(
                    f"Delivered {len(pending_requests)} pending chat requests to user {user_id}"
                )
        except Exception as e:
            logger.error(f"Failed to deliver pending chat requests to user {user_id}: {e}")

        return True

    @sio.event
    async def disconnect(sid: str) -> None:
        """Handle socket disconnection."""
        room_manager = get_room_manager()
        session = room_manager.remove_session(sid)

        if session:
            logger.info(f"User {session.user_id} disconnected (sid: {sid})")
        else:
            logger.info(f"Session disconnected: {sid}")

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

        # Update activity on join
        room_manager.update_activity(sid)

        # Get chat history
        messages = await redis_store.get_messages(chat_id)
        positions = await redis_store.get_all_agreed_positions(chat_id)

        # Check if other participant is connected
        metadata = await redis_store.get_chat_metadata(chat_id)
        other_user_connected = False
        if metadata:
            for participant_id in metadata.participant_ids:
                if participant_id != user_id and room_manager.is_user_connected(participant_id):
                    other_user_connected = True
                    break

        logger.info(f"User {user_id} joined chat {chat_id}, other user connected: {other_user_connected}, returning {len(messages)} messages")

        return {
            "status": "joined",
            "chatId": chat_id,
            "messages": [m.to_dict() for m in messages],
            "agreedPositions": [p.to_dict() for p in positions],
            "otherUserConnected": other_user_connected,
        }

    @sio.event
    async def ping(sid: str, data: dict = None) -> dict[str, str]:
        """Heartbeat handler - also updates activity timestamp."""
        room_manager = get_room_manager()
        room_manager.update_activity(sid)
        return {"type": "pong"}

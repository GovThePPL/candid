"""
Connection and authentication handlers.
"""

import logging
from typing import Any

import socketio
from socketio.exceptions import ConnectionRefusedError

from ..auth import validate_token
from ..services import get_redis_store, get_room_manager, get_chat_exporter, get_abandonment_tracker

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
        await room_manager.add_session(sid, user_id)

        # Join user's personal room for notifications
        await sio.enter_room(sid, room_manager.user_room(user_id))

        # Rejoin active chats
        redis_store = get_redis_store()
        active_chats = await redis_store.get_user_active_chats(user_id)
        for chat_id in active_chats:
            await sio.enter_room(sid, room_manager.chat_room(chat_id))

        # Cancel any pending abandonment timers for this user (they reconnected)
        abandonment_tracker = get_abandonment_tracker()
        cancelled_chats = await abandonment_tracker.cancel_all_for_user(user_id)

        # Notify other participants that this user reconnected
        for cancelled_chat_id in cancelled_chats:
            metadata = await redis_store.get_chat_metadata(cancelled_chat_id)
            if metadata:
                for participant_id in metadata.participant_ids:
                    if participant_id != user_id:
                        other_room = room_manager.user_room(participant_id)
                        await sio.emit(
                            "partner_reconnected",
                            {"chatId": cancelled_chat_id, "userId": user_id},
                            room=other_room,
                        )

        # Set in-app presence so the REST API sees this user as online
        await redis_store.update_presence(user_id)

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
        session = await room_manager.remove_session(sid)

        if session:
            user_id = session.user_id
            logger.info(f"User {user_id} disconnected (sid: {sid})")

            # Only start abandonment timers if user has no other active sessions
            if not await room_manager.is_user_connected(user_id):
                redis_store = get_redis_store()
                abandonment_tracker = get_abandonment_tracker()
                active_chats = await redis_store.get_user_active_chats(user_id)

                for chat_id in active_chats:
                    await abandonment_tracker.start(chat_id, user_id)

                    # Notify the other participant
                    metadata = await redis_store.get_chat_metadata(chat_id)
                    if metadata:
                        for participant_id in metadata.participant_ids:
                            if participant_id != user_id:
                                # Only notify if other user doesn't also have a timer
                                if not await abandonment_tracker.has_timer(chat_id, participant_id):
                                    other_room = room_manager.user_room(participant_id)
                                    await sio.emit(
                                        "partner_disconnected",
                                        {"chatId": chat_id, "userId": user_id},
                                        room=other_room,
                                    )
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

        # Cancel abandonment timer if user is returning to the chat
        abandonment_tracker = get_abandonment_tracker()
        was_abandoning = await abandonment_tracker.cancel(chat_id, user_id)
        if was_abandoning:
            # Notify the other participant that user returned
            metadata_for_notify = await redis_store.get_chat_metadata(chat_id)
            if metadata_for_notify:
                for participant_id in metadata_for_notify.participant_ids:
                    if participant_id != user_id:
                        other_room = room_manager.user_room(participant_id)
                        await sio.emit(
                            "partner_reconnected",
                            {"chatId": chat_id, "userId": user_id},
                            room=other_room,
                        )

        # Get chat history
        messages = await redis_store.get_messages(chat_id)
        positions = await redis_store.get_all_agreed_positions(chat_id)
        definitions = await redis_store.get_all_definition_requests(chat_id)
        explanations = await redis_store.get_all_explain_requests(chat_id)
        reactions = await redis_store.get_reactions(chat_id)

        # Check if other participant is connected
        metadata = await redis_store.get_chat_metadata(chat_id)
        other_user_connected = False
        if metadata:
            for participant_id in metadata.participant_ids:
                if participant_id != user_id and await room_manager.is_user_connected(participant_id):
                    other_user_connected = True
                    break

        logger.info(f"User {user_id} joined chat {chat_id}, other user connected: {other_user_connected}, returning {len(messages)} messages")

        return {
            "status": "joined",
            "chatId": chat_id,
            "messages": [m.to_dict() for m in messages],
            "agreedPositions": [p.to_dict() for p in positions],
            "definitions": [d.to_dict() for d in definitions],
            "explanations": [e.to_dict() for e in explanations],
            "reactions": reactions,
            "otherUserConnected": other_user_connected,
        }

    @sio.event
    async def leave_chat(sid: str, data: dict) -> None:
        """
        Handle user navigating away from the chat screen.

        This is a safety net emitted from the frontend's useEffect cleanup
        when the chat screen unmounts. Starts an abandonment timer.

        Expected data: {"chatId": "UUID"}
        """
        room_manager = get_room_manager()
        user_id = room_manager.get_user_id(sid)

        if not user_id:
            return

        chat_id = data.get("chatId") if isinstance(data, dict) else None
        if not chat_id:
            return

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return

        # Leave the chat Socket.IO room
        await sio.leave_room(sid, room_manager.chat_room(chat_id))

        # Start abandonment timer
        abandonment_tracker = get_abandonment_tracker()
        await abandonment_tracker.start(chat_id, user_id)

        # Notify the other participant
        metadata = await redis_store.get_chat_metadata(chat_id)
        if metadata:
            for participant_id in metadata.participant_ids:
                if participant_id != user_id:
                    if not await abandonment_tracker.has_timer(chat_id, participant_id):
                        other_room = room_manager.user_room(participant_id)
                        await sio.emit(
                            "partner_disconnected",
                            {"chatId": chat_id, "userId": user_id},
                            room=other_room,
                        )

        logger.info(f"User {user_id} left chat {chat_id} screen")

    @sio.event
    async def ping(sid: str, data: dict = None) -> dict[str, str]:
        """Heartbeat handler - also updates activity timestamp and Redis presence."""
        room_manager = get_room_manager()
        room_manager.update_activity(sid)

        # Refresh in-app presence so the REST API sees this user as online
        user_id = room_manager.get_user_id(sid)
        if user_id:
            redis_store = get_redis_store()
            await redis_store.update_presence(user_id)

        return {"type": "pong"}

"""
Service layer for the chat server.
"""

import asyncio
import logging
from aiohttp import web

from .redis_store import RedisStore
from .chat_export import ChatExporter
from .room_manager import RoomManager, SESSION_TIMEOUT_SECONDS
from .pubsub import PubSubService

logger = logging.getLogger(__name__)

# Global service instances
redis_store: RedisStore = None
chat_exporter: ChatExporter = None
room_manager: RoomManager = None
pubsub_service: PubSubService = None
_sio = None  # Socket.IO server reference
_timeout_check_task = None  # Background task for checking timed-out sessions

# How often to check for timed-out sessions (30 seconds)
TIMEOUT_CHECK_INTERVAL = 30


async def initialize_services(app: web.Application) -> None:
    """Initialize all services on application startup."""
    global redis_store, chat_exporter, room_manager, pubsub_service, _sio, _timeout_check_task

    logger.info("Initializing services...")

    # Get Socket.IO server from app
    _sio = app.get("sio")

    # Initialize Redis store
    redis_store = RedisStore()
    await redis_store.connect()

    # Initialize chat exporter
    chat_exporter = ChatExporter()
    await chat_exporter.connect()

    # Initialize room manager
    room_manager = RoomManager()

    # Initialize pub/sub service and start listener
    pubsub_service = PubSubService()
    await pubsub_service.connect()
    await pubsub_service.start_listener(
        on_chat_accepted=_handle_chat_accepted,
        on_chat_request_response=_handle_chat_request_response,
    )

    # Start background task for checking timed-out sessions
    _timeout_check_task = asyncio.create_task(_check_timed_out_sessions())

    # Store services in app for access
    app["redis_store"] = redis_store
    app["chat_exporter"] = chat_exporter
    app["room_manager"] = room_manager
    app["pubsub_service"] = pubsub_service

    # Register cleanup on shutdown
    app.on_cleanup.append(cleanup_services)

    logger.info("Services initialized successfully")


async def cleanup_services(app: web.Application) -> None:
    """Cleanup services on application shutdown."""
    global redis_store, chat_exporter, pubsub_service, _timeout_check_task

    logger.info("Cleaning up services...")

    # Cancel timeout check task
    if _timeout_check_task:
        _timeout_check_task.cancel()
        try:
            await _timeout_check_task
        except asyncio.CancelledError:
            pass

    if pubsub_service:
        await pubsub_service.close()
    if redis_store:
        await redis_store.close()
    if chat_exporter:
        await chat_exporter.close()

    logger.info("Services cleaned up")


async def _check_timed_out_sessions() -> None:
    """Background task to check for and disconnect timed-out sessions."""
    logger.info(f"Starting session timeout checker (interval: {TIMEOUT_CHECK_INTERVAL}s, timeout: {SESSION_TIMEOUT_SECONDS}s)")

    while True:
        try:
            await asyncio.sleep(TIMEOUT_CHECK_INTERVAL)

            if not room_manager or not _sio:
                continue

            timed_out = room_manager.get_timed_out_sessions()

            for session in timed_out:
                logger.warning(
                    f"Session {session.sid} for user {session.user_id} timed out, disconnecting"
                )

                # Notify the client before disconnecting
                try:
                    await _sio.emit(
                        "session_timeout",
                        {"message": "Connection timed out due to inactivity"},
                        to=session.sid,
                    )
                except Exception as e:
                    logger.debug(f"Failed to send timeout notification: {e}")

                # Disconnect the session
                try:
                    await _sio.disconnect(session.sid)
                except Exception as e:
                    logger.error(f"Failed to disconnect timed out session {session.sid}: {e}")

        except asyncio.CancelledError:
            logger.info("Session timeout checker cancelled")
            break
        except Exception as e:
            logger.error(f"Error in session timeout checker: {e}")


async def _handle_chat_accepted(data: dict) -> None:
    """
    Handle chat_accepted event from REST API via pub/sub.

    This sets up the chat in Redis and notifies both users.
    """
    chat_log_id = data.get("chatLogId")
    initiator_id = data.get("initiatorUserId")
    responder_id = data.get("responderUserId")
    position_statement = data.get("positionStatement", "")

    if not all([chat_log_id, initiator_id, responder_id]):
        logger.error(f"Invalid chat_accepted event data: {data}")
        return

    logger.info(
        f"Handling chat_accepted: chat_log={chat_log_id}, "
        f"initiator={initiator_id}, responder={responder_id}"
    )

    # Create chat session in Redis
    participants = [initiator_id, responder_id]
    await redis_store.create_chat(chat_log_id, participants)

    # Join both users to the chat room (if they're connected)
    chat_room = room_manager.chat_room(chat_log_id)

    for user_id in participants:
        for sid in room_manager.get_user_sids(user_id):
            if _sio:
                await _sio.enter_room(sid, chat_room)

    # Notify both users about the new chat
    if _sio:
        # Notify initiator (their request was accepted)
        initiator_room = room_manager.user_room(initiator_id)
        await _sio.emit(
            "chat_started",
            {
                "chatId": chat_log_id,
                "otherUserId": responder_id,
                "positionStatement": position_statement,
                "role": "initiator",
            },
            room=initiator_room,
        )

        # Notify responder (they accepted, now entering chat)
        responder_room = room_manager.user_room(responder_id)
        await _sio.emit(
            "chat_started",
            {
                "chatId": chat_log_id,
                "otherUserId": initiator_id,
                "positionStatement": position_statement,
                "role": "responder",
            },
            room=responder_room,
        )

    logger.info(f"Chat {chat_log_id} setup complete, users notified")


async def _handle_chat_request_response(data: dict) -> None:
    """
    Handle chat_request_response event from REST API via pub/sub.

    This notifies the initiator whether their chat request was
    accepted or dismissed.
    """
    request_id = data.get("requestId")
    response = data.get("response")
    initiator_user_id = data.get("initiatorUserId")
    chat_log_id = data.get("chatLogId")

    if not all([request_id, response, initiator_user_id]):
        logger.error(f"Invalid chat_request_response event data: {data}")
        return

    logger.info(
        f"Handling chat_request_response: request={request_id}, "
        f"response={response}, initiator={initiator_user_id}"
    )

    # Determine the event name based on response
    if response == "accepted":
        event_name = "chat_request_accepted"
        event_data = {
            "requestId": request_id,
            "chatLogId": chat_log_id,
        }
    else:
        event_name = "chat_request_declined"
        event_data = {
            "requestId": request_id,
        }

    # Emit to initiator's user room
    if _sio:
        initiator_room = room_manager.user_room(initiator_user_id)
        await _sio.emit(event_name, event_data, room=initiator_room)
        logger.info(f"Emitted {event_name} to user {initiator_user_id}")


def get_redis_store() -> RedisStore:
    """Get the Redis store instance."""
    if redis_store is None:
        raise RuntimeError("Redis store not initialized")
    return redis_store


def get_chat_exporter() -> ChatExporter:
    """Get the chat exporter instance."""
    if chat_exporter is None:
        raise RuntimeError("Chat exporter not initialized")
    return chat_exporter


def get_room_manager() -> RoomManager:
    """Get the room manager instance."""
    if room_manager is None:
        raise RuntimeError("Room manager not initialized")
    return room_manager


def get_pubsub_service() -> PubSubService:
    """Get the pub/sub service instance."""
    if pubsub_service is None:
        raise RuntimeError("Pub/sub service not initialized")
    return pubsub_service

"""
Service layer for the chat server.
"""

import logging
from aiohttp import web

from .redis_store import RedisStore
from .chat_export import ChatExporter
from .room_manager import RoomManager
from .pubsub import PubSubService

logger = logging.getLogger(__name__)

# Global service instances
redis_store: RedisStore = None
chat_exporter: ChatExporter = None
room_manager: RoomManager = None
pubsub_service: PubSubService = None
_sio = None  # Socket.IO server reference


async def initialize_services(app: web.Application) -> None:
    """Initialize all services on application startup."""
    global redis_store, chat_exporter, room_manager, pubsub_service, _sio

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
    await pubsub_service.start_listener(on_chat_accepted=_handle_chat_accepted)

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
    global redis_store, chat_exporter, pubsub_service

    logger.info("Cleaning up services...")

    if pubsub_service:
        await pubsub_service.close()
    if redis_store:
        await redis_store.close()
    if chat_exporter:
        await chat_exporter.close()

    logger.info("Services cleaned up")


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

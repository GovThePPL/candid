"""
Service layer for the chat server.
"""

import asyncio
import logging
from typing import Optional

import aiohttp
from aiohttp import web

from .redis_store import RedisStore
from .chat_export import ChatExporter
from .room_manager import RoomManager, SESSION_TIMEOUT_SECONDS
from .pubsub import PubSubService
from .abandonment import AbandonmentTracker

logger = logging.getLogger(__name__)

# Global service instances
redis_store: RedisStore = None
chat_exporter: ChatExporter = None
room_manager: RoomManager = None
pubsub_service: PubSubService = None
abandonment_tracker: AbandonmentTracker = None
_nlp_session: Optional[aiohttp.ClientSession] = None
_sio = None  # Socket.IO server reference
_timeout_check_task = None  # Background task for checking timed-out sessions
_abandonment_check_task = None  # Background task for checking abandoned chats

# How often to check for timed-out sessions and abandoned chats (30 seconds)
TIMEOUT_CHECK_INTERVAL = 30


async def initialize_services(app: web.Application) -> None:
    """Initialize all services on application startup."""
    global redis_store, chat_exporter, room_manager, pubsub_service, abandonment_tracker, _nlp_session, _sio, _timeout_check_task, _abandonment_check_task

    logger.info("Initializing services...")

    # Get Socket.IO server from app
    _sio = app.get("sio")

    # Initialize Redis store
    redis_store = RedisStore()
    await redis_store.connect()

    # Initialize chat exporter
    chat_exporter = ChatExporter()
    await chat_exporter.connect()

    # Initialize room manager with Redis for cross-pod presence
    room_manager = RoomManager(redis=redis_store._redis)
    await room_manager.cleanup_stale_sids()

    # Initialize abandonment tracker with Redis for cross-pod consistency
    abandonment_tracker = AbandonmentTracker(redis=redis_store._redis)

    # Initialize shared HTTP session for NLP service calls
    _nlp_session = aiohttp.ClientSession()

    # Initialize pub/sub service and start listener
    pubsub_service = PubSubService()
    await pubsub_service.connect()
    await pubsub_service.start_listener(
        on_chat_accepted=_handle_chat_accepted,
        on_chat_request_response=_handle_chat_request_response,
        on_chat_request_received=_handle_chat_request_received,
        on_new_comment=_handle_new_comment,
        on_vote_update=_handle_vote_update,
        on_notification=_handle_notification,
    )

    # Start background task for checking timed-out sessions
    _timeout_check_task = asyncio.create_task(_check_timed_out_sessions())

    # Start background task for checking abandoned chats
    _abandonment_check_task = asyncio.create_task(_check_abandoned_chats())

    # Store services in app for access
    app["redis_store"] = redis_store
    app["chat_exporter"] = chat_exporter
    app["room_manager"] = room_manager
    app["pubsub_service"] = pubsub_service
    app["abandonment_tracker"] = abandonment_tracker

    # Register cleanup on shutdown
    app.on_cleanup.append(cleanup_services)

    logger.info("Services initialized successfully")


async def cleanup_services(app: web.Application) -> None:
    """Cleanup services on application shutdown."""
    global redis_store, chat_exporter, pubsub_service, _nlp_session, _timeout_check_task, _abandonment_check_task

    logger.info("Cleaning up services...")

    # Cancel timeout check task
    if _timeout_check_task:
        _timeout_check_task.cancel()
        try:
            await _timeout_check_task
        except asyncio.CancelledError:
            pass

    # Cancel abandonment check task
    if _abandonment_check_task:
        _abandonment_check_task.cancel()
        try:
            await _abandonment_check_task
        except asyncio.CancelledError:
            pass

    if _nlp_session:
        await _nlp_session.close()
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


async def _check_abandoned_chats() -> None:
    """Background task to check for and auto-end abandoned chats."""
    logger.info("Starting abandoned chat checker (interval: %ds)", TIMEOUT_CHECK_INTERVAL)

    while True:
        try:
            await asyncio.sleep(TIMEOUT_CHECK_INTERVAL)

            if not abandonment_tracker or not redis_store or not chat_exporter or not _sio:
                continue

            expired = await abandonment_tracker.get_expired()

            for chat_id, user_id in expired:
                logger.warning(
                    f"Chat {chat_id} abandoned by user {user_id}, auto-ending"
                )

                try:
                    # Verify chat still exists in Redis (might have been ended normally)
                    metadata = await redis_store.get_chat_metadata(chat_id)
                    if not metadata:
                        logger.debug(f"Chat {chat_id} already cleaned up, skipping")
                        await abandonment_tracker.cancel_all_for_chat(chat_id)
                        continue

                    # Get export data
                    export_data = await redis_store.get_chat_export_data(chat_id)
                    export_data["endedByUserId"] = user_id
                    export_data["abandonedByUserId"] = user_id

                    # Export to PostgreSQL
                    success = await chat_exporter.export_chat(
                        chat_id=chat_id,
                        export_data=export_data,
                        end_type="abandoned",
                    )

                    if not success:
                        logger.error(f"Failed to export abandoned chat {chat_id}")
                        continue

                    # Notify remaining participants (local sids only — only one
                    # pod claims each expired entry via atomic get_expired)
                    status_data = {
                        "chatId": chat_id,
                        "status": "ended",
                        "endType": "abandoned",
                        "abandonedByUserId": user_id,
                    }
                    notified_sids = set()
                    # Emit to chat room members on this pod
                    chat_room = room_manager.chat_room(chat_id)
                    for participant_id in metadata.participant_ids:
                        for sid in room_manager.get_user_sids(participant_id):
                            await _sio.emit("status", status_data, to=sid)
                            notified_sids.add(sid)

                    # Remove participants from chat room
                    for participant_id in metadata.participant_ids:
                        for participant_sid in room_manager.get_user_sids(participant_id):
                            await _sio.leave_room(participant_sid, chat_room)

                    # Cancel any other timers for this chat
                    await abandonment_tracker.cancel_all_for_chat(chat_id)

                    # Delete Redis data
                    await redis_store.delete_chat(chat_id)

                    logger.info(f"Chat {chat_id} auto-ended (abandoned by user {user_id})")

                except Exception as e:
                    logger.error(f"Error auto-ending abandoned chat {chat_id}: {e}")

        except asyncio.CancelledError:
            logger.info("Abandoned chat checker cancelled")
            break
        except Exception as e:
            logger.error(f"Error in abandoned chat checker: {e}")


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

    # Notify both users about the new chat (local sids only — each pod
    # runs this handler via pub/sub, so room-based emit would duplicate)
    if _sio:
        # Notify initiator (their request was accepted)
        for sid in room_manager.get_user_sids(initiator_id):
            await _sio.emit(
                "chat_started",
                {
                    "chatId": chat_log_id,
                    "otherUserId": responder_id,
                    "positionStatement": position_statement,
                    "role": "initiator",
                },
                to=sid,
            )

        # Notify responder (they accepted, now entering chat)
        for sid in room_manager.get_user_sids(responder_id):
            await _sio.emit(
                "chat_started",
                {
                    "chatId": chat_log_id,
                    "otherUserId": initiator_id,
                    "positionStatement": position_statement,
                    "role": "responder",
                },
                to=sid,
            )

    logger.info(f"Chat {chat_log_id} setup complete, users notified")


async def _handle_chat_request_received(data: dict) -> None:
    """
    Handle chat_request_received event from REST API via pub/sub.

    This delivers the chat request card to the recipient in real-time.
    """
    recipient_user_id = data.get("recipientUserId")
    card = data.get("card")

    if not all([recipient_user_id, card]):
        logger.error(f"Invalid chat_request_received event data: {data}")
        return

    logger.info(f"Handling chat_request_received for user {recipient_user_id}")

    # Emit to recipient's local sids only (pub/sub runs on all pods)
    if _sio:
        for sid in room_manager.get_user_sids(recipient_user_id):
            await _sio.emit("chat_request_received", card, to=sid)
        logger.info(f"Emitted chat_request_received to user {recipient_user_id}")


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

    # Emit to initiator's local sids only (pub/sub runs on all pods)
    if _sio:
        for sid in room_manager.get_user_sids(initiator_user_id):
            await _sio.emit(event_name, event_data, to=sid)
        logger.info(f"Emitted {event_name} to user {initiator_user_id}")


async def _handle_new_comment(data: dict) -> None:
    """
    Handle new_comment event from REST API via pub/sub.

    Broadcasts the new comment to all clients in the post room.
    """
    post_id = data.get("postId")
    comment = data.get("comment")

    if not all([post_id, comment]):
        logger.error(f"Invalid new_comment event data: {data}")
        return

    logger.info(f"Handling new_comment for post {post_id}")

    # Emit to local sids in the post room only (pub/sub runs on all pods)
    if _sio:
        post_room = room_manager.post_room(post_id)
        for sid, _ in _sio.manager.get_participants('/', post_room):
            await _sio.emit("new_comment", comment, to=sid)
        logger.debug(f"Emitted new_comment to room {post_room}")


async def _handle_vote_update(data: dict) -> None:
    """
    Handle vote_update event from REST API via pub/sub.

    Broadcasts updated vote counts to all clients in the post room.
    """
    post_id = data.get("postId")
    comment_id = data.get("commentId")
    counts = data.get("counts")

    if not all([post_id, comment_id, counts]):
        logger.error(f"Invalid vote_update event data: {data}")
        return

    logger.info(f"Handling vote_update for comment {comment_id} in post {post_id}")

    # Emit to local sids in the post room only (pub/sub runs on all pods)
    if _sio:
        post_room = room_manager.post_room(post_id)
        for sid, _ in _sio.manager.get_participants('/', post_room):
            await _sio.emit("vote_update", {
                "commentId": comment_id,
                **counts,
            }, to=sid)
        logger.debug(f"Emitted vote_update to room {post_room}")


async def _handle_notification(data: dict) -> None:
    """
    Handle notification event from REST API via pub/sub.

    Delivers the notification to the recipient's personal user room.
    """
    user_id = data.get("userId")
    notification = data.get("notification")

    if not all([user_id, notification]):
        logger.error(f"Invalid notification event data: {data}")
        return

    logger.info(f"Handling notification for user {user_id}")

    # Emit to local sids only (pub/sub runs on all pods)
    if _sio:
        for sid in room_manager.get_user_sids(user_id):
            await _sio.emit("notification", notification, to=sid)
        logger.debug(f"Emitted notification to user {user_id}")


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


def get_abandonment_tracker() -> AbandonmentTracker:
    """Get the abandonment tracker instance."""
    if abandonment_tracker is None:
        raise RuntimeError("Abandonment tracker not initialized")
    return abandonment_tracker


def get_nlp_session() -> aiohttp.ClientSession:
    """Get the shared NLP HTTP session."""
    if _nlp_session is None:
        raise RuntimeError("NLP session not initialized")
    return _nlp_session

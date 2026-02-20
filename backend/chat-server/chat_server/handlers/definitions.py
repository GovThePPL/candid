"""
Definition request handlers for chat.

Definitions follow a request-response negotiation flow:
1. User 1 requests a definition for a term
2. User 2 responds with their definition
3. User 1 accepts OR provides a counter-definition
"""

import logging
from datetime import datetime
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)


def register_definition_handlers(sio: socketio.AsyncServer) -> None:
    """Register definition event handlers."""

    @sio.event
    async def definition(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle definition request/response events.

        Dispatches on data['action']:
          - 'request': User requests a definition for a term
          - 'define': Other user responds with a definition
          - 'accept': Requester accepts the definition
          - 'counter_define': Requester provides their own definition
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
        action = data.get("action")

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        valid_actions = ("request", "define", "accept", "counter_define")
        if action not in valid_actions:
            return {
                "status": "error",
                "code": "INVALID_ACTION",
                "message": f"Invalid action. Must be one of: {', '.join(valid_actions)}",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        if action == "request":
            return await _handle_request(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "define":
            return await _handle_define(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "accept":
            return await _handle_accept(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "counter_define":
            return await _handle_counter_define(sio, redis_store, room_manager, chat_id, user_id, data)


async def _handle_request(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle a definition request (User 1 sends just the term)."""
    term = (data.get("term") or "").strip()

    if not term:
        return {
            "status": "error",
            "code": "MISSING_TERM",
            "message": "Term is required",
        }

    if len(term) > 100:
        return {
            "status": "error",
            "code": "TERM_TOO_LONG",
            "message": "Term must be 100 characters or less",
        }

    req = await redis_store.add_definition_request(
        chat_id=chat_id,
        requester_id=user_id,
        term=term,
    )

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "definition",
        {
            "chatId": chat_id,
            "action": "request",
            "request": req.to_dict(),
            "requesterId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} requested definition for '{term}' in chat {chat_id}: {req.id}"
    )

    return {"status": "requested", "requestId": req.id}


async def _handle_define(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle a definition response (User 2 defines the term)."""
    request_id = data.get("requestId")
    definition_text = (data.get("definition") or "").strip()

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    if not definition_text:
        return {
            "status": "error",
            "code": "MISSING_DEFINITION",
            "message": "Definition is required",
        }

    if len(definition_text) > 500:
        return {
            "status": "error",
            "code": "DEFINITION_TOO_LONG",
            "message": "Definition must be 500 characters or less",
        }

    req = await redis_store.get_definition_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Definition request not found",
        }

    if req.status != "pending":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot define: request status is '{req.status}', expected 'pending'",
        }

    if user_id == req.requester_id:
        return {
            "status": "error",
            "code": "CANNOT_DEFINE_OWN_REQUEST",
            "message": "Cannot define your own request",
        }

    # Update the request
    req.definer_id = user_id
    req.definition = definition_text
    req.defined_at = datetime.utcnow().isoformat()
    req.status = "defined"

    await redis_store.update_definition_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "definition",
        {
            "chatId": chat_id,
            "action": "define",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "definerId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} defined '{req.term}' in chat {chat_id}: {req.id}"
    )

    return {"status": "defined", "requestId": req.id}


async def _handle_accept(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle acceptance of a definition (User 1 accepts User 2's definition)."""
    request_id = data.get("requestId")

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    req = await redis_store.get_definition_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Definition request not found",
        }

    if req.status != "defined":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot accept: request status is '{req.status}', expected 'defined'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "CANNOT_ACCEPT_NOT_REQUESTER",
            "message": "Only the requester can accept a definition",
        }

    # Update the request
    req.status = "accepted"

    await redis_store.update_definition_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "definition",
        {
            "chatId": chat_id,
            "action": "accept",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "accepterId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} accepted definition for '{req.term}' in chat {chat_id}: {req.id}"
    )

    return {"status": "accepted", "requestId": req.id}


async def _handle_counter_define(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle a counter-definition (User 1 provides their own definition)."""
    request_id = data.get("requestId")
    definition_text = (data.get("definition") or "").strip()

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    if not definition_text:
        return {
            "status": "error",
            "code": "MISSING_DEFINITION",
            "message": "Definition is required",
        }

    if len(definition_text) > 500:
        return {
            "status": "error",
            "code": "DEFINITION_TOO_LONG",
            "message": "Definition must be 500 characters or less",
        }

    req = await redis_store.get_definition_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Definition request not found",
        }

    if req.status != "defined":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot counter-define: request status is '{req.status}', expected 'defined'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "CANNOT_ACCEPT_NOT_REQUESTER",
            "message": "Only the requester can counter-define",
        }

    # Update the request
    req.counter_definer_id = user_id
    req.counter_definition = definition_text
    req.counter_defined_at = datetime.utcnow().isoformat()
    req.status = "both_defined"

    await redis_store.update_definition_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "definition",
        {
            "chatId": chat_id,
            "action": "counter_define",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "counterDefinerId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} counter-defined '{req.term}' in chat {chat_id}: {req.id}"
    )

    return {"status": "both_defined", "requestId": req.id}

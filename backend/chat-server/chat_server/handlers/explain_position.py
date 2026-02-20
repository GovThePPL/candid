"""
Explain My Position handlers for chat.

Explanation follows a negotiation flow:
1. User A requests User B to explain User A's position
2. User B writes an explanation
3. User A evaluates good faith:
   - If good faith: User A can accept or correct the explanation
   - If bad faith (reject): User B can try again (back to pending)
"""

import logging
from datetime import datetime
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager

logger = logging.getLogger(__name__)


def register_explain_position_handlers(sio: socketio.AsyncServer) -> None:
    """Register explain position event handlers."""

    @sio.event
    async def explain_position(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle explain position events.

        Dispatches on data['action']:
          - 'request': User A asks User B to explain their position
          - 'explain': User B provides an explanation
          - 'good_faith': User A confirms good faith attempt
          - 'reject': User A rejects (bad faith), User B can retry
          - 'accept': User A accepts the explanation
          - 'correct': User A provides a corrected explanation
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

        valid_actions = ("request", "explain", "good_faith", "reject", "accept", "correct")
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
        elif action == "explain":
            return await _handle_explain(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "good_faith":
            return await _handle_good_faith(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "reject":
            return await _handle_reject(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "accept":
            return await _handle_accept(sio, redis_store, room_manager, chat_id, user_id, data)
        elif action == "correct":
            return await _handle_correct(sio, redis_store, room_manager, chat_id, user_id, data)


async def _handle_request(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User A requesting an explanation of their position."""
    position = (data.get("position") or "").strip()

    if not position:
        return {
            "status": "error",
            "code": "MISSING_POSITION",
            "message": "Position is required",
        }

    if len(position) > 200:
        return {
            "status": "error",
            "code": "POSITION_TOO_LONG",
            "message": "Position must be 200 characters or less",
        }

    req = await redis_store.add_explain_request(
        chat_id=chat_id,
        requester_id=user_id,
        position=position,
    )

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
        {
            "chatId": chat_id,
            "action": "request",
            "request": req.to_dict(),
            "requesterId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} requested explanation of position in chat {chat_id}: {req.id}"
    )

    return {"status": "requested", "requestId": req.id}


async def _handle_explain(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User B providing an explanation."""
    request_id = data.get("requestId")
    explanation = (data.get("explanation") or "").strip()

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    if not explanation:
        return {
            "status": "error",
            "code": "MISSING_EXPLANATION",
            "message": "Explanation is required",
        }

    if len(explanation) > 500:
        return {
            "status": "error",
            "code": "EXPLANATION_TOO_LONG",
            "message": "Explanation must be 500 characters or less",
        }

    req = await redis_store.get_explain_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Explain request not found",
        }

    if req.status != "pending":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot explain: request status is '{req.status}', expected 'pending'",
        }

    if user_id == req.requester_id:
        return {
            "status": "error",
            "code": "CANNOT_EXPLAIN_OWN_REQUEST",
            "message": "Cannot explain your own request",
        }

    # Update the request
    req.explainer_id = user_id
    req.explanation = explanation
    req.explained_at = datetime.utcnow().isoformat()
    req.status = "explained"

    await redis_store.update_explain_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
        {
            "chatId": chat_id,
            "action": "explain",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "explainerId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} explained position in chat {chat_id}: {req.id}"
    )

    return {"status": "explained", "requestId": req.id}


async def _handle_good_faith(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User A confirming the explanation was good faith."""
    request_id = data.get("requestId")

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    req = await redis_store.get_explain_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Explain request not found",
        }

    if req.status != "explained":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot confirm good faith: request status is '{req.status}', expected 'explained'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "NOT_REQUESTER",
            "message": "Only the requester can confirm good faith",
        }

    # Update the request
    req.good_faith = True
    req.status = "good_faith"

    await redis_store.update_explain_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
        {
            "chatId": chat_id,
            "action": "good_faith",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "confirmerId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} confirmed good faith explanation in chat {chat_id}: {req.id}"
    )

    return {"status": "good_faith", "requestId": req.id}


async def _handle_reject(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User A rejecting (bad faith) — User B can retry."""
    request_id = data.get("requestId")

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    req = await redis_store.get_explain_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Explain request not found",
        }

    if req.status != "explained":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot reject: request status is '{req.status}', expected 'explained'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "NOT_REQUESTER",
            "message": "Only the requester can reject an explanation",
        }

    # Reset to pending — clear explainer fields so they can retry
    req.status = "pending"
    req.explainer_id = None
    req.explanation = None
    req.explained_at = None
    req.good_faith = None

    await redis_store.update_explain_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
        {
            "chatId": chat_id,
            "action": "reject",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "rejecterId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} rejected explanation in chat {chat_id}: {req.id}"
    )

    return {"status": "rejected", "requestId": req.id}


async def _handle_accept(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User A accepting the explanation."""
    request_id = data.get("requestId")

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    req = await redis_store.get_explain_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Explain request not found",
        }

    if req.status != "good_faith":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot accept: request status is '{req.status}', expected 'good_faith'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "NOT_REQUESTER",
            "message": "Only the requester can accept an explanation",
        }

    # Update the request
    req.status = "completed"

    await redis_store.update_explain_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
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
        f"User {user_id} accepted explanation in chat {chat_id}: {req.id}"
    )

    return {"status": "completed", "requestId": req.id}


async def _handle_correct(sio, redis_store, room_manager, chat_id, user_id, data):
    """Handle User A providing a corrected explanation."""
    request_id = data.get("requestId")
    correction = (data.get("correction") or "").strip()

    if not request_id:
        return {
            "status": "error",
            "code": "MISSING_REQUEST_ID",
            "message": "Missing requestId",
        }

    if not correction:
        return {
            "status": "error",
            "code": "MISSING_CORRECTION",
            "message": "Correction is required",
        }

    if len(correction) > 500:
        return {
            "status": "error",
            "code": "CORRECTION_TOO_LONG",
            "message": "Correction must be 500 characters or less",
        }

    req = await redis_store.get_explain_request(chat_id, request_id)
    if not req:
        return {
            "status": "error",
            "code": "REQUEST_NOT_FOUND",
            "message": "Explain request not found",
        }

    if req.status != "good_faith":
        return {
            "status": "error",
            "code": "INVALID_STATUS",
            "message": f"Cannot correct: request status is '{req.status}', expected 'good_faith'",
        }

    if user_id != req.requester_id:
        return {
            "status": "error",
            "code": "NOT_REQUESTER",
            "message": "Only the requester can correct an explanation",
        }

    # Update the request
    req.correction = correction
    req.corrected_at = datetime.utcnow().isoformat()
    req.status = "corrected"

    await redis_store.update_explain_request(chat_id, req)

    # Broadcast to chat room
    chat_room = room_manager.chat_room(chat_id)
    await sio.emit(
        "explain_position",
        {
            "chatId": chat_id,
            "action": "correct",
            "request": req.to_dict(),
            "requesterId": req.requester_id,
            "correcterId": user_id,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} corrected explanation in chat {chat_id}: {req.id}"
    )

    return {"status": "corrected", "requestId": req.id}

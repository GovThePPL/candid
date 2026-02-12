"""
Agreed position and closure handlers.
"""

import logging
from typing import Any

import socketio

from ..services import get_redis_store, get_room_manager, get_chat_exporter

logger = logging.getLogger(__name__)


def register_agreed_position_handlers(sio: socketio.AsyncServer) -> None:
    """Register agreed position event handlers."""

    @sio.event
    async def agreed_position(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle agreed position actions (propose, accept, reject, modify).

        Expected data: {
            "chatId": "UUID",
            "action": "propose|accept|reject|modify",
            "proposalId": "UUID" (required for accept/reject/modify),
            "content": "text" (required for propose/modify),
            "isClosure": true|false (optional, for propose)
        }

        Broadcasts to chat room: {
            "chatId": "UUID",
            "action": "propose|accept|reject|modify",
            "proposal": {...},
            "proposerId": "UUID",
            "isClosure": true|false
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

        chat_id = data.get("chatId")
        action = data.get("action")
        proposal_id = data.get("proposalId")
        content = data.get("content")
        is_closure = data.get("isClosure", False)

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        if action not in ("propose", "accept", "reject", "modify"):
            return {
                "status": "error",
                "code": "INVALID_ACTION",
                "message": "Invalid action. Must be propose, accept, reject, or modify",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        chat_room = room_manager.chat_room(chat_id)

        if action == "propose":
            return await _handle_propose(
                sio, redis_store, chat_id, chat_room, user_id, content, is_closure
            )
        elif action == "accept":
            return await _handle_accept(
                sio, redis_store, chat_id, chat_room, user_id, proposal_id
            )
        elif action == "reject":
            return await _handle_reject(
                sio, redis_store, chat_id, chat_room, user_id, proposal_id
            )
        elif action == "modify":
            return await _handle_modify(
                sio, redis_store, chat_id, chat_room, user_id, proposal_id, content
            )


async def _handle_propose(
    sio: socketio.AsyncServer,
    redis_store,
    chat_id: str,
    chat_room: str,
    user_id: str,
    content: str,
    is_closure: bool,
) -> dict[str, Any]:
    """Handle proposing a new agreed position."""
    if not content:
        return {
            "status": "error",
            "code": "MISSING_CONTENT",
            "message": "Content is required for propose action",
        }

    # Validate proposal length
    if len(content) > 1000:
        return {
            "status": "error",
            "code": "CONTENT_TOO_LONG",
            "message": "Proposal must be 1000 characters or less",
        }

    # Create the proposal
    position = await redis_store.add_agreed_position(
        chat_id=chat_id,
        proposer_id=user_id,
        content=content,
        is_closure=is_closure,
    )

    # If this is a closure, also set the closure proposal
    if is_closure:
        await redis_store.set_closure_proposal(chat_id, user_id, content)

    # Broadcast to chat room
    await sio.emit(
        "agreed_position",
        {
            "chatId": chat_id,
            "action": "propose",
            "proposal": position.to_dict(),
            "proposerId": user_id,
            "isClosure": is_closure,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} proposed {'closure' if is_closure else 'position'} "
        f"in chat {chat_id}: {position.id}"
    )

    return {"status": "proposed", "proposalId": position.id}


async def _handle_accept(
    sio: socketio.AsyncServer,
    redis_store,
    chat_id: str,
    chat_room: str,
    user_id: str,
    proposal_id: str,
) -> dict[str, Any]:
    """Handle accepting an agreed position proposal."""
    if not proposal_id:
        return {
            "status": "error",
            "code": "MISSING_PROPOSAL_ID",
            "message": "proposalId is required for accept action",
        }

    # Get the proposal
    position = await redis_store.get_agreed_position(chat_id, proposal_id)
    if not position:
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_FOUND",
            "message": "Proposal not found",
        }

    if position.status != "pending":
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_PENDING",
            "message": "Proposal is no longer pending",
        }

    # Can't accept your own proposal
    if position.proposer_id == user_id:
        return {
            "status": "error",
            "code": "CANNOT_ACCEPT_OWN",
            "message": "Cannot accept your own proposal",
        }

    # Update status to accepted
    await redis_store.update_agreed_position_status(chat_id, proposal_id, "accepted")
    position.status = "accepted"

    # Broadcast acceptance
    await sio.emit(
        "agreed_position",
        {
            "chatId": chat_id,
            "action": "accept",
            "proposal": position.to_dict(),
            "accepterId": user_id,
            "isClosure": position.is_closure,
        },
        room=chat_room,
    )

    logger.info(f"User {user_id} accepted proposal {proposal_id} in chat {chat_id}")

    # If this was a closure, end the chat
    if position.is_closure:
        return await _end_chat_with_closure(
            sio, redis_store, chat_id, chat_room, position.content
        )

    return {"status": "accepted", "proposalId": proposal_id}


async def _handle_reject(
    sio: socketio.AsyncServer,
    redis_store,
    chat_id: str,
    chat_room: str,
    user_id: str,
    proposal_id: str,
) -> dict[str, Any]:
    """Handle rejecting an agreed position proposal."""
    if not proposal_id:
        return {
            "status": "error",
            "code": "MISSING_PROPOSAL_ID",
            "message": "proposalId is required for reject action",
        }

    # Get the proposal
    position = await redis_store.get_agreed_position(chat_id, proposal_id)
    if not position:
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_FOUND",
            "message": "Proposal not found",
        }

    if position.status != "pending":
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_PENDING",
            "message": "Proposal is no longer pending",
        }

    # Can't reject your own proposal
    if position.proposer_id == user_id:
        return {
            "status": "error",
            "code": "CANNOT_REJECT_OWN",
            "message": "Cannot reject your own proposal",
        }

    # Update status to rejected
    await redis_store.update_agreed_position_status(chat_id, proposal_id, "rejected")
    position.status = "rejected"

    # Clear closure proposal if this was a closure
    if position.is_closure:
        await redis_store.clear_closure_proposal(chat_id)

    # Broadcast rejection
    await sio.emit(
        "agreed_position",
        {
            "chatId": chat_id,
            "action": "reject",
            "proposal": position.to_dict(),
            "rejecterId": user_id,
            "isClosure": position.is_closure,
        },
        room=chat_room,
    )

    logger.info(f"User {user_id} rejected proposal {proposal_id} in chat {chat_id}")

    return {"status": "rejected", "proposalId": proposal_id}


async def _handle_modify(
    sio: socketio.AsyncServer,
    redis_store,
    chat_id: str,
    chat_room: str,
    user_id: str,
    proposal_id: str,
    content: str,
) -> dict[str, Any]:
    """Handle modifying an agreed position proposal (counter-proposal)."""
    if not proposal_id:
        return {
            "status": "error",
            "code": "MISSING_PROPOSAL_ID",
            "message": "proposalId is required for modify action",
        }

    if not content:
        return {
            "status": "error",
            "code": "MISSING_CONTENT",
            "message": "content is required for modify action",
        }

    # Validate proposal length
    if len(content) > 1000:
        return {
            "status": "error",
            "code": "CONTENT_TOO_LONG",
            "message": "Proposal must be 1000 characters or less",
        }

    # Get the original proposal
    original = await redis_store.get_agreed_position(chat_id, proposal_id)
    if not original:
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_FOUND",
            "message": "Proposal not found",
        }

    if original.status != "pending":
        return {
            "status": "error",
            "code": "PROPOSAL_NOT_PENDING",
            "message": "Proposal is no longer pending",
        }

    # Can't modify your own proposal
    if original.proposer_id == user_id:
        return {
            "status": "error",
            "code": "CANNOT_MODIFY_OWN",
            "message": "Cannot modify your own proposal",
        }

    # Mark original as modified
    await redis_store.update_agreed_position_status(chat_id, proposal_id, "modified")

    # Create new proposal as modification
    new_position = await redis_store.add_agreed_position(
        chat_id=chat_id,
        proposer_id=user_id,
        content=content,
        is_closure=original.is_closure,
        parent_id=proposal_id,
    )

    # If this is a closure, update the closure proposal
    if original.is_closure:
        await redis_store.set_closure_proposal(chat_id, user_id, content)

    # Broadcast modification
    await sio.emit(
        "agreed_position",
        {
            "chatId": chat_id,
            "action": "modify",
            "originalProposalId": proposal_id,
            "proposal": new_position.to_dict(),
            "proposerId": user_id,
            "isClosure": original.is_closure,
        },
        room=chat_room,
    )

    logger.info(
        f"User {user_id} modified proposal {proposal_id} -> {new_position.id} in chat {chat_id}"
    )

    return {"status": "modified", "proposalId": new_position.id}


async def _end_chat_with_closure(
    sio: socketio.AsyncServer,
    redis_store,
    chat_id: str,
    chat_room: str,
    closure_content: str,
) -> dict[str, Any]:
    """End a chat with an agreed closure."""
    from ..services import get_room_manager, get_chat_exporter

    room_manager = get_room_manager()
    chat_exporter = get_chat_exporter()

    # Get metadata
    metadata = await redis_store.get_chat_metadata(chat_id)

    # Get export data
    export_data = await redis_store.get_chat_export_data(chat_id)

    # Export to PostgreSQL
    success = await chat_exporter.export_chat(
        chat_id=chat_id,
        export_data=export_data,
        end_type="agreed_closure",
    )

    if not success:
        return {
            "status": "error",
            "code": "EXPORT_FAILED",
            "message": "Failed to export chat",
        }

    # Notify everyone that chat ended with agreed closure
    await sio.emit(
        "status",
        {
            "chatId": chat_id,
            "status": "ended",
            "endType": "agreed_closure",
            "agreedClosure": closure_content,
        },
        room=chat_room,
    )

    # Remove all users from chat room
    if metadata:
        for participant_id in metadata.participant_ids:
            for participant_sid in room_manager.get_user_sids(participant_id):
                await sio.leave_room(participant_sid, chat_room)

    # Delete Redis data
    await redis_store.delete_chat(chat_id)

    logger.info(f"Chat {chat_id} ended with agreed closure")

    return {"status": "ended", "chatId": chat_id, "endType": "agreed_closure"}

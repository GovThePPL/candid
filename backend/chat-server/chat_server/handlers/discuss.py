"""
Socket.IO event handlers for discuss forum rooms.

Clients join/leave post rooms to receive real-time comment and vote events.
"""

import logging
import socketio

from ..services import get_room_manager

logger = logging.getLogger(__name__)


def register_discuss_handlers(sio: socketio.AsyncServer) -> None:
    """Register discuss forum Socket.IO event handlers."""

    @sio.event
    async def join_post(sid, data):
        """Join a post room to receive real-time updates."""
        room_mgr = get_room_manager()
        session = room_mgr.get_session(sid)
        if not session:
            return {"status": "error", "message": "Not authenticated"}

        post_id = data.get("postId") if data else None
        if not post_id:
            return {"status": "error", "message": "postId is required"}

        room = room_mgr.post_room(post_id)
        await sio.enter_room(sid, room)
        logger.info(f"User {session.user_id} joined post room {room}")
        return {"status": "joined", "postId": post_id}

    @sio.event
    async def leave_post(sid, data):
        """Leave a post room."""
        room_mgr = get_room_manager()
        session = room_mgr.get_session(sid)
        if not session:
            return {"status": "error", "message": "Not authenticated"}

        post_id = data.get("postId") if data else None
        if not post_id:
            return {"status": "error", "message": "postId is required"}

        room = room_mgr.post_room(post_id)
        await sio.leave_room(sid, room)
        logger.info(f"User {session.user_id} left post room {room}")
        return {"status": "left", "postId": post_id}

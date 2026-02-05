"""
Socket.IO event handlers.
"""

import socketio

from .connection import register_connection_handlers
from .messages import register_message_handlers
from .typing import register_typing_handlers
from .agreed_positions import register_agreed_position_handlers
from .chat_lifecycle import register_lifecycle_handlers
from .read_receipts import register_read_receipt_handlers


def register_handlers(sio: socketio.AsyncServer) -> None:
    """Register all Socket.IO event handlers."""
    register_connection_handlers(sio)
    register_message_handlers(sio)
    register_typing_handlers(sio)
    register_agreed_position_handlers(sio)
    register_lifecycle_handlers(sio)
    register_read_receipt_handlers(sio)

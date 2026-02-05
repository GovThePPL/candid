"""
Helper functions for publishing chat events to Redis pub/sub.

These events are consumed by the chat WebSocket server.
"""

import json
import redis
from .config import Config

# Channel name (must match chat server)
CHAT_EVENTS_CHANNEL = "chat:events"


def publish_chat_request_response(
    request_id: str,
    response: str,
    initiator_user_id: str,
    chat_log_id: str = None,
) -> bool:
    """
    Publish a chat_request_response event to notify the initiator.

    This should be called after a chat request is accepted or dismissed.

    Args:
        request_id: The chat_request ID
        response: 'accepted' or 'dismissed'
        initiator_user_id: User who initiated the chat request
        chat_log_id: The chat_log ID if accepted (None if dismissed)

    Returns:
        True if published successfully, False otherwise
    """
    try:
        redis_url = Config.REDIS_URL
        r = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": response,
            "initiatorUserId": initiator_user_id,
        }

        if chat_log_id:
            event["chatLogId"] = chat_log_id

        r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        r.close()

        return True

    except Exception as e:
        print(f"Error publishing chat_request_response event: {e}")
        return False


def publish_chat_accepted(
    chat_log_id: str,
    chat_request_id: str,
    initiator_user_id: str,
    responder_user_id: str,
    position_statement: str,
) -> bool:
    """
    Publish a chat_accepted event to notify the chat server.

    This should be called after a chat request is accepted and
    the chat_log has been created in PostgreSQL.

    Args:
        chat_log_id: The newly created chat_log ID
        chat_request_id: The chat_request ID that was accepted
        initiator_user_id: User who initiated the chat request
        responder_user_id: User who accepted the chat request
        position_statement: The position statement being discussed

    Returns:
        True if published successfully, False otherwise
    """
    try:
        # Get Redis URL from config
        redis_url = Config.REDIS_URL

        r = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

        event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": chat_request_id,
            "initiatorUserId": initiator_user_id,
            "responderUserId": responder_user_id,
            "positionStatement": position_statement,
        }

        r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        r.close()

        return True

    except Exception as e:
        print(f"Error publishing chat_accepted event: {e}")
        return False

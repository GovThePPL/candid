"""
Helper functions for publishing chat events to Redis pub/sub.

These events are consumed by the chat WebSocket server.
"""

import json
import logging
from .redis_pool import get_redis

logger = logging.getLogger(__name__)

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
        r = get_redis()

        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": response,
            "initiatorUserId": initiator_user_id,
        }

        if chat_log_id:
            event["chatLogId"] = chat_log_id

        num_subscribers = r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        if num_subscribers == 0:
            logger.warning(
                "chat_request_response published to 0 subscribers "
                "(no chat server pods listening) — request=%s, response=%s, initiator=%s",
                request_id, response, initiator_user_id,
            )
        else:
            logger.info(
                "chat_request_response published to %d subscriber(s) — request=%s, response=%s",
                num_subscribers, request_id, response,
            )

        return True

    except Exception as e:
        logger.error("Error publishing chat_request_response event: %s", e)
        return False


def publish_chat_request_received(
    recipient_user_id: str,
    card_data: dict,
) -> bool:
    """
    Publish a chat_request_received event to notify the recipient in real-time.

    This should be called after a chat request is created, for swiping/in_app
    delivery contexts where the recipient is online.

    Args:
        recipient_user_id: User who owns the position (recipient of the request)
        card_data: The chat request card data (same shape as _chat_request_to_card output)

    Returns:
        True if published successfully, False otherwise
    """
    try:
        r = get_redis()

        event = {
            "event": "chat_request_received",
            "recipientUserId": recipient_user_id,
            "card": card_data,
        }

        num_subscribers = r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        if num_subscribers == 0:
            logger.warning(
                "chat_request_received published to 0 subscribers — recipient=%s",
                recipient_user_id,
            )
        else:
            logger.info(
                "chat_request_received published to %d subscriber(s) — recipient=%s",
                num_subscribers, recipient_user_id,
            )

        return True

    except Exception as e:
        logger.error("Error publishing chat_request_received event: %s", e)
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
        r = get_redis()

        event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": chat_request_id,
            "initiatorUserId": initiator_user_id,
            "responderUserId": responder_user_id,
            "positionStatement": position_statement,
        }

        num_subscribers = r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        if num_subscribers == 0:
            logger.warning(
                "chat_accepted published to 0 subscribers "
                "(no chat server pods listening) — chat=%s, initiator=%s, responder=%s",
                chat_log_id, initiator_user_id, responder_user_id,
            )
        else:
            logger.info(
                "chat_accepted published to %d subscriber(s) — chat=%s",
                num_subscribers, chat_log_id,
            )

        return True

    except Exception as e:
        logger.error("Error publishing chat_accepted event: %s", e)
        return False

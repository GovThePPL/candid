"""
Redis pub/sub service for inter-service communication.

The REST API publishes events when chat requests are accepted,
and this service handles setting up the chat and notifying users.
"""

import asyncio
import json
import logging
from typing import Optional

import redis.asyncio as redis

from ..config import config

logger = logging.getLogger(__name__)

# Channel names
CHAT_EVENTS_CHANNEL = "chat:events"


class PubSubService:
    """Handles Redis pub/sub for chat events from the REST API."""

    def __init__(self):
        self._redis: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self) -> None:
        """Connect to Redis and start listening for events."""
        logger.info(f"Connecting to Redis pub/sub at {config.REDIS_URL}")
        self._redis = redis.from_url(
            config.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(CHAT_EVENTS_CHANNEL)
        logger.info(f"Subscribed to channel: {CHAT_EVENTS_CHANNEL}")

    async def start_listener(self, on_chat_accepted, on_chat_request_response=None, on_chat_request_received=None) -> None:
        """Start the background listener task."""
        self._listener_task = asyncio.create_task(
            self._listen(on_chat_accepted, on_chat_request_response, on_chat_request_received)
        )
        logger.info("Started pub/sub listener task")

    async def _listen(self, on_chat_accepted, on_chat_request_response=None, on_chat_request_received=None) -> None:
        """Listen for messages and dispatch to handlers.

        Auto-reconnects with exponential backoff on connection failures.
        """
        backoff = 1  # seconds
        max_backoff = 60
        while True:
            try:
                async for message in self._pubsub.listen():
                    backoff = 1  # Reset on successful message
                    if message["type"] != "message":
                        continue

                    try:
                        data = json.loads(message["data"])
                        event_type = data.get("event")

                        if event_type == "chat_accepted":
                            await on_chat_accepted(data)
                        elif event_type == "chat_request_response":
                            if on_chat_request_response:
                                await on_chat_request_response(data)
                        elif event_type == "chat_request_received":
                            if on_chat_request_received:
                                await on_chat_request_received(data)
                        else:
                            logger.warning(f"Unknown event type: {event_type}")

                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON in pub/sub message: {message['data']}")
                    except Exception as e:
                        logger.error(f"Error handling pub/sub message: {e}")

            except asyncio.CancelledError:
                logger.info("Pub/sub listener cancelled")
                return
            except Exception as e:
                logger.error(f"Pub/sub listener error, reconnecting in {backoff}s: {e}")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
                try:
                    await self._reconnect()
                except Exception as re:
                    logger.error(f"Pub/sub reconnect failed: {re}")

    async def _reconnect(self) -> None:
        """Re-establish pub/sub subscription after a connection failure."""
        try:
            if self._pubsub:
                await self._pubsub.close()
            if self._redis:
                await self._redis.close()
        except Exception:
            pass

        self._redis = redis.from_url(
            config.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(CHAT_EVENTS_CHANNEL)
        logger.info("Pub/sub reconnected successfully")

    async def close(self) -> None:
        """Close the pub/sub connection."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        if self._pubsub:
            await self._pubsub.unsubscribe(CHAT_EVENTS_CHANNEL)
            await self._pubsub.close()

        if self._redis:
            await self._redis.close()

        logger.info("Pub/sub connection closed")


# Utility function for REST API to publish events
async def publish_chat_accepted(
    redis_url: str,
    chat_log_id: str,
    chat_request_id: str,
    initiator_user_id: str,
    responder_user_id: str,
    position_statement: str,
) -> None:
    """
    Publish a chat_accepted event to notify the chat server.

    This function is meant to be called by the REST API after
    a chat request is accepted.

    Args:
        redis_url: Redis connection URL
        chat_log_id: The newly created chat_log ID
        chat_request_id: The chat_request ID that was accepted
        initiator_user_id: User who initiated the chat request
        responder_user_id: User who accepted the chat request
        position_statement: The position statement being discussed
    """
    r = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    try:
        event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": chat_request_id,
            "initiatorUserId": initiator_user_id,
            "responderUserId": responder_user_id,
            "positionStatement": position_statement,
        }
        await r.publish(CHAT_EVENTS_CHANNEL, json.dumps(event))
        logger.info(f"Published chat_accepted event for chat_log {chat_log_id}")
    finally:
        await r.aclose()

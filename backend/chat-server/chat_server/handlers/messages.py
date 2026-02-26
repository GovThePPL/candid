"""
Message handling for chat.
"""

import logging
import time
from typing import Any, Optional

import aiohttp
import socketio

from ..config import config
from ..services import get_redis_store, get_room_manager, get_nlp_session
from ..services.quote_validator import parse_quotes, validate_quotes

logger = logging.getLogger(__name__)

# Rate limit: max messages per user within the sliding window
_MSG_RATE_LIMIT = 30
_MSG_RATE_WINDOW = 60  # seconds


async def _check_message_rate(redis_client, user_id: str) -> bool:
    """Check per-user message rate limit using a Redis sorted set sliding window.

    Returns True if allowed, False if rate-limited.
    """
    key = f"rate:chat_msg:{user_id}"
    now = time.time()
    cutoff = now - _MSG_RATE_WINDOW

    async with redis_client.pipeline(transaction=False) as pipe:
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, _MSG_RATE_WINDOW + 10)
        results = await pipe.execute()

    count = results[1]  # count before adding current
    if count >= _MSG_RATE_LIMIT:
        # Over limit — remove the optimistic add
        await redis_client.zrem(key, str(now))
        return False
    return True


async def _check_toxicity(text: str) -> Optional[float]:
    """Check text toxicity via the NLP service.

    Returns the toxicity_score float, or None on connection error (fail open).
    Uses a shared aiohttp.ClientSession to reuse TCP connections.
    """
    try:
        session = get_nlp_session()
        async with session.post(
            f"{config.NLP_SERVICE_URL}/toxicity-check",
            json={"text": text, "threshold": config.TOXICITY_THRESHOLD},
            timeout=aiohttp.ClientTimeout(total=config.NLP_SERVICE_TIMEOUT),
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data.get("toxicity_score")
            logger.warning("NLP toxicity check returned status %d", resp.status)
            return None
    except (aiohttp.ClientError, TimeoutError) as e:
        logger.debug("NLP toxicity check unavailable: %s", e)
        return None


def _flatten_definitions(requests: list) -> list[dict]:
    """
    Flatten resolved definition requests into individual definition dicts.

    - 'accepted' requests produce 1 entry (the definer's definition)
    - 'both_defined' requests produce 2 entries (definer's first, then counter-definer's)
    - 'pending' and 'defined' requests are not yet resolved, so they produce 0 entries

    Each entry is a dict with keys: id, term, definition, definerId.
    """
    flat = []
    for req in requests:
        # Support both dataclass objects and dicts
        if isinstance(req, dict):
            status = req.get("status", "")
            req_id = req.get("id", "")
            term = req.get("term", "")
            definition = req.get("definition")
            definer_id = req.get("definerId", req.get("definer_id"))
            counter_definition = req.get("counterDefinition", req.get("counter_definition"))
            counter_definer_id = req.get("counterDefinerId", req.get("counter_definer_id"))
        else:
            status = getattr(req, "status", "")
            req_id = getattr(req, "id", "")
            term = getattr(req, "term", "")
            definition = getattr(req, "definition", None)
            definer_id = getattr(req, "definer_id", None)
            counter_definition = getattr(req, "counter_definition", None)
            counter_definer_id = getattr(req, "counter_definer_id", None)

        if status == "accepted":
            flat.append({
                "id": req_id,
                "term": term,
                "definition": definition,
                "definerId": definer_id,
            })
        elif status == "both_defined":
            flat.append({
                "id": req_id,
                "term": term,
                "definition": definition,
                "definerId": definer_id,
            })
            flat.append({
                "id": f"{req_id}-counter",
                "term": term,
                "definition": counter_definition,
                "definerId": counter_definer_id,
            })
    return flat


def register_message_handlers(sio: socketio.AsyncServer) -> None:
    """Register message-related event handlers."""

    @sio.event
    async def message(sid: str, data: dict) -> dict[str, Any]:
        """
        Handle sending a message to a chat.

        Expected data: {"chatId": "UUID", "content": "message text", "messageType": "text"}

        Broadcasts to chat room: {
            "id": "message UUID",
            "chatLogId": "chat UUID",
            "sender": "user UUID",
            "type": "text",
            "content": "message text",
            "sendTime": "ISO8601"
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

        # Update activity timestamp
        room_manager.update_activity(sid)

        # Per-user message rate limiting
        redis_store = get_redis_store()
        if not await _check_message_rate(redis_store._redis, user_id):
            return {
                "status": "error",
                "code": "RATE_LIMITED",
                "message": "Too many messages. Please wait before sending more.",
            }

        chat_id = data.get("chatId")
        content = data.get("content")
        message_type = data.get("messageType", "text")

        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        if not content:
            return {
                "status": "error",
                "code": "MISSING_CONTENT",
                "message": "Missing content",
            }

        # Validate message type
        if message_type not in ("text", "system"):
            return {
                "status": "error",
                "code": "INVALID_TYPE",
                "message": "Invalid message type",
            }

        # Validate message length
        if len(content) > 5000:
            return {
                "status": "error",
                "code": "MESSAGE_TOO_LONG",
                "message": "Message must be 5000 characters or less",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        # Validate quote references if the message contains any
        quotes = parse_quotes(content)
        if quotes:
            # Check if any M-reference has a character range (needs full message load)
            has_m_range = any(
                q['prefix'] == 'M' and q['start'] is not None
                for q in quotes
            )
            has_m_ref = any(q['prefix'] == 'M' for q in quotes)

            if has_m_range:
                # Need full messages for range validation
                all_messages = await redis_store.get_messages(chat_id)
                text_messages = [
                    m for m in all_messages
                    if getattr(m, 'type', 'text') in ('text', 'system')
                ]
                text_message_count = len(text_messages)
            elif has_m_ref:
                # Count-based validation only (O(1) via LLEN)
                text_messages = []
                text_message_count = await redis_store.get_message_count(chat_id)
            else:
                text_messages = []
                text_message_count = 0

            # Get accepted agreed positions for S-references
            has_s_ref = any(q['prefix'] == 'S' for q in quotes)
            if has_s_ref:
                positions = await redis_store.get_all_agreed_positions(chat_id)
                accepted_positions = [
                    p for p in positions
                    if getattr(p, 'status', '') == 'accepted'
                ]
            else:
                accepted_positions = []

            # Get definitions for D-references (flatten requests into individual defs)
            has_d_ref = any(q['prefix'] == 'D' for q in quotes)
            if has_d_ref:
                definition_requests = await redis_store.get_all_definition_requests(chat_id)
                definitions = _flatten_definitions(definition_requests)
            else:
                definitions = []

            valid, error_code = validate_quotes(
                content, text_messages, accepted_positions, definitions,
                message_count=text_message_count,
            )
            if not valid:
                return {
                    "status": "error",
                    "code": error_code,
                    "message": f"Invalid quote reference: {error_code}",
                }

        # Server-side toxicity check (synchronous, fail-open)
        toxicity_score = None
        was_sent_anyway = None
        if message_type == "text":
            toxicity_score = await _check_toxicity(content)
            if data.get("wasFlaggedToxic"):
                was_sent_anyway = True

        # Store message in Redis
        msg = await redis_store.add_message(
            chat_id=chat_id,
            sender_id=user_id,
            content=content,
            message_type=message_type,
            toxicity_score=toxicity_score,
            was_sent_anyway=was_sent_anyway,
        )

        # Broadcast to chat room
        chat_room = room_manager.chat_room(chat_id)
        broadcast_payload = {
            "id": msg.id,
            "chatLogId": chat_id,
            "sender": msg.sender_id,
            "type": msg.type,
            "content": msg.content,
            "sendTime": msg.timestamp,
        }
        if msg.toxicity_score is not None:
            broadcast_payload["toxicityScore"] = msg.toxicity_score
        await sio.emit(
            "message",
            broadcast_payload,
            room=chat_room,
        )

        logger.debug(f"Message {msg.id} sent to chat {chat_id} by user {user_id}")

        return {"status": "sent", "messageId": msg.id}

    @sio.event
    async def get_messages(sid: str, data: dict) -> dict[str, Any]:
        """
        Get message history for a chat.

        Expected data: {"chatId": "UUID", "start": 0, "end": -1}

        Returns: {"status": "ok", "messages": [...]}
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
        if not chat_id:
            return {
                "status": "error",
                "code": "MISSING_CHAT_ID",
                "message": "Missing chatId",
            }

        redis_store = get_redis_store()

        # Verify user is a participant
        if not await redis_store.is_chat_participant(chat_id, user_id):
            return {
                "status": "error",
                "code": "NOT_PARTICIPANT",
                "message": "Not a participant in this chat",
            }

        start = data.get("start", 0)
        end = data.get("end", -1)

        messages = await redis_store.get_messages(chat_id, start, end)

        return {
            "status": "ok",
            "messages": [
                {
                    "id": m.id,
                    "chatLogId": chat_id,
                    "sender": m.sender_id,
                    "type": m.type,
                    "content": m.content,
                    "sendTime": m.timestamp,
                }
                for m in messages
            ],
        }

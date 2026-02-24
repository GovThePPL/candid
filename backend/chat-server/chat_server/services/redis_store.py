"""
Redis storage service for active chat data.
"""

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import redis.asyncio as redis

from ..config import config

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """A chat message stored in Redis."""

    id: str
    sender_id: str
    type: str  # 'text', 'agreed_position_proposal', 'agreed_closure_proposal', 'system'
    content: str
    target_id: Optional[str]  # For position references
    timestamp: str
    toxicity_score: Optional[float] = None
    was_sent_anyway: Optional[bool] = None

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "senderId": self.sender_id,
            "type": self.type,
            "content": self.content,
            "targetId": self.target_id,
            "timestamp": self.timestamp,
        }
        if self.toxicity_score is not None:
            d["toxicityScore"] = self.toxicity_score
        if self.was_sent_anyway is not None:
            d["wasSentAnyway"] = self.was_sent_anyway
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "ChatMessage":
        return cls(
            id=data["id"],
            sender_id=data.get("senderId", data.get("sender_id")),
            type=data["type"],
            content=data["content"],
            target_id=data.get("targetId", data.get("target_id")),
            timestamp=data["timestamp"],
            toxicity_score=data.get("toxicityScore", data.get("toxicity_score")),
            was_sent_anyway=data.get("wasSentAnyway", data.get("was_sent_anyway")),
        )


@dataclass
class AgreedPosition:
    """An agreed position proposal stored in Redis."""

    id: str
    proposer_id: str
    content: str
    parent_id: Optional[str]  # For modifications
    status: str  # 'pending', 'accepted', 'rejected', 'modified'
    is_closure: bool
    timestamp: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "proposerId": self.proposer_id,
            "content": self.content,
            "parentId": self.parent_id,
            "status": self.status,
            "isClosure": self.is_closure,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AgreedPosition":
        return cls(
            id=data["id"],
            proposer_id=data.get("proposerId", data.get("proposer_id")),
            content=data["content"],
            parent_id=data.get("parentId", data.get("parent_id")),
            status=data["status"],
            is_closure=data.get("isClosure", data.get("is_closure")),
            timestamp=data["timestamp"],
        )


@dataclass
class ClosureProposal:
    """A closure proposal stored in Redis."""

    id: str
    proposer_id: str
    content: str
    timestamp: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "proposerId": self.proposer_id,
            "content": self.content,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ClosureProposal":
        return cls(
            id=data["id"],
            proposer_id=data.get("proposerId", data.get("proposer_id")),
            content=data["content"],
            timestamp=data["timestamp"],
        )


@dataclass
class ChatMetadata:
    """Metadata for an active chat."""

    chat_id: str
    participant_ids: list[str]
    start_time: str

    def to_dict(self) -> dict:
        return {
            "chatId": self.chat_id,
            "participantIds": self.participant_ids,
            "startTime": self.start_time,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ChatMetadata":
        return cls(
            chat_id=data.get("chatId", data.get("chat_id")),
            participant_ids=data.get("participantIds", data.get("participant_ids")),
            start_time=data.get("startTime", data.get("start_time")),
        )


@dataclass
class DefinitionRequest:
    """A definition request with request-response negotiation flow."""

    id: str
    requester_id: str
    term: str
    status: str  # 'pending', 'defined', 'accepted', 'both_defined'
    timestamp: str
    definer_id: Optional[str] = None
    definition: Optional[str] = None
    defined_at: Optional[str] = None
    counter_definer_id: Optional[str] = None
    counter_definition: Optional[str] = None
    counter_defined_at: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "requesterId": self.requester_id,
            "term": self.term,
            "status": self.status,
            "timestamp": self.timestamp,
            "definerId": self.definer_id,
            "definition": self.definition,
            "definedAt": self.defined_at,
            "counterDefinerId": self.counter_definer_id,
            "counterDefinition": self.counter_definition,
            "counterDefinedAt": self.counter_defined_at,
        }
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "DefinitionRequest":
        return cls(
            id=data["id"],
            requester_id=data.get("requesterId", data.get("requester_id")),
            term=data["term"],
            status=data["status"],
            timestamp=data["timestamp"],
            definer_id=data.get("definerId", data.get("definer_id")),
            definition=data.get("definition"),
            defined_at=data.get("definedAt", data.get("defined_at")),
            counter_definer_id=data.get("counterDefinerId", data.get("counter_definer_id")),
            counter_definition=data.get("counterDefinition", data.get("counter_definition")),
            counter_defined_at=data.get("counterDefinedAt", data.get("counter_defined_at")),
        )


@dataclass
class ExplainRequest:
    """An explain-my-position request with negotiation flow."""

    id: str
    requester_id: str          # User A (position holder)
    position: str              # Free text describing position to explain
    status: str                # 'pending','explained','good_faith','completed','corrected'
    timestamp: str
    explainer_id: Optional[str] = None      # User B
    explanation: Optional[str] = None
    explained_at: Optional[str] = None
    good_faith: Optional[bool] = None       # True once User A confirms
    correction: Optional[str] = None        # User A's corrected version
    corrected_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "requesterId": self.requester_id,
            "position": self.position,
            "status": self.status,
            "timestamp": self.timestamp,
            "explainerId": self.explainer_id,
            "explanation": self.explanation,
            "explainedAt": self.explained_at,
            "goodFaith": self.good_faith,
            "correction": self.correction,
            "correctedAt": self.corrected_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ExplainRequest":
        return cls(
            id=data["id"],
            requester_id=data.get("requesterId", data.get("requester_id")),
            position=data["position"],
            status=data["status"],
            timestamp=data["timestamp"],
            explainer_id=data.get("explainerId", data.get("explainer_id")),
            explanation=data.get("explanation"),
            explained_at=data.get("explainedAt", data.get("explained_at")),
            good_faith=data.get("goodFaith", data.get("good_faith")),
            correction=data.get("correction"),
            corrected_at=data.get("correctedAt", data.get("corrected_at")),
        )


class RedisStore:
    """Redis storage for active chat data."""

    def __init__(self):
        self._redis: Optional[redis.Redis] = None

    async def connect(self) -> None:
        """Connect to Redis."""
        logger.info(f"Connecting to Redis at {config.REDIS_URL}")
        self._redis = redis.from_url(
            config.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        # Test connection
        await self._redis.ping()
        logger.info("Connected to Redis")

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            logger.info("Redis connection closed")

    def _messages_key(self, chat_id: str) -> str:
        return config.CHAT_MESSAGES_KEY.format(chat_id=chat_id)

    def _positions_key(self, chat_id: str) -> str:
        return config.CHAT_POSITIONS_KEY.format(chat_id=chat_id)

    def _closure_key(self, chat_id: str) -> str:
        return config.CHAT_CLOSURE_KEY.format(chat_id=chat_id)

    def _definitions_key(self, chat_id: str) -> str:
        return config.CHAT_DEFINITIONS_KEY.format(chat_id=chat_id)

    def _explanations_key(self, chat_id: str) -> str:
        return config.CHAT_EXPLANATIONS_KEY.format(chat_id=chat_id)

    def _metadata_key(self, chat_id: str) -> str:
        return config.CHAT_METADATA_KEY.format(chat_id=chat_id)

    def _user_chats_key(self, user_id: str) -> str:
        return config.USER_ACTIVE_CHATS_KEY.format(user_id=user_id)

    # ===== Presence =====

    async def update_presence(self, user_id: str) -> None:
        """Set/refresh the in-app presence key for a user (60s TTL).

        Called on connect and on every keepalive ping so the REST API's
        presence checks see the user as online even outside the card queue.
        """
        await self._redis.setex(f"presence:in_app:{user_id}", 60, "1")

    # ===== Chat Metadata =====

    async def create_chat(
        self, chat_id: str, participant_ids: list[str]
    ) -> ChatMetadata:
        """Create a new chat session in Redis."""
        metadata = ChatMetadata(
            chat_id=chat_id,
            participant_ids=participant_ids,
            start_time=datetime.utcnow().isoformat(),
        )

        # Pipeline: store metadata + set TTL + add to each user's active chats
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(
                self._metadata_key(chat_id),
                mapping={
                    "chatId": metadata.chat_id,
                    "participantIds": json.dumps(metadata.participant_ids),
                    "startTime": metadata.start_time,
                },
            )
            pipe.expire(self._metadata_key(chat_id), config.REDIS_MESSAGE_TTL)
            for user_id in participant_ids:
                pipe.sadd(self._user_chats_key(user_id), chat_id)
            await pipe.execute()

        logger.info(f"Created chat {chat_id} with participants {participant_ids}")
        return metadata

    async def get_chat_metadata(self, chat_id: str) -> Optional[ChatMetadata]:
        """Get chat metadata."""
        data = await self._redis.hgetall(self._metadata_key(chat_id))
        if not data:
            return None

        return ChatMetadata(
            chat_id=data.get("chatId", data.get("chat_id")),
            participant_ids=json.loads(data.get("participantIds", data.get("participant_ids"))),
            start_time=data.get("startTime", data.get("start_time")),
        )

    async def get_user_active_chats(self, user_id: str) -> list[str]:
        """Get list of active chat IDs for a user."""
        return list(await self._redis.smembers(self._user_chats_key(user_id)))

    async def is_chat_participant(self, chat_id: str, user_id: str) -> bool:
        """Check if a user is a participant in a chat."""
        metadata = await self.get_chat_metadata(chat_id)
        if not metadata:
            return False
        return user_id in metadata.participant_ids

    # ===== Messages =====

    async def add_message(
        self,
        chat_id: str,
        sender_id: str,
        content: str,
        message_type: str = "text",
        target_id: Optional[str] = None,
        toxicity_score: Optional[float] = None,
        was_sent_anyway: Optional[bool] = None,
    ) -> ChatMessage:
        """Add a message to a chat."""
        message = ChatMessage(
            id=str(uuid.uuid4()),
            sender_id=sender_id,
            type=message_type,
            content=content,
            target_id=target_id,
            timestamp=datetime.utcnow().isoformat(),
            toxicity_score=toxicity_score,
            was_sent_anyway=was_sent_anyway,
        )

        key = self._messages_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.rpush(key, json.dumps(message.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

        return message

    async def get_messages(
        self, chat_id: str, start: int = 0, end: int = -1
    ) -> list[ChatMessage]:
        """Get messages from a chat."""
        messages_json = await self._redis.lrange(
            self._messages_key(chat_id), start, end
        )
        return [ChatMessage.from_dict(json.loads(m)) for m in messages_json]

    # ===== Agreed Positions =====

    async def add_agreed_position(
        self,
        chat_id: str,
        proposer_id: str,
        content: str,
        is_closure: bool = False,
        parent_id: Optional[str] = None,
    ) -> AgreedPosition:
        """Add an agreed position proposal."""
        position = AgreedPosition(
            id=str(uuid.uuid4()),
            proposer_id=proposer_id,
            content=content,
            parent_id=parent_id,
            status="pending",
            is_closure=is_closure,
            timestamp=datetime.utcnow().isoformat(),
        )

        key = self._positions_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, position.id, json.dumps(position.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

        return position

    async def get_agreed_position(
        self, chat_id: str, position_id: str
    ) -> Optional[AgreedPosition]:
        """Get a specific agreed position."""
        data = await self._redis.hget(self._positions_key(chat_id), position_id)
        if not data:
            return None
        return AgreedPosition.from_dict(json.loads(data))

    async def get_all_agreed_positions(self, chat_id: str) -> list[AgreedPosition]:
        """Get all agreed positions for a chat."""
        positions_data = await self._redis.hgetall(self._positions_key(chat_id))
        return [
            AgreedPosition.from_dict(json.loads(data))
            for data in positions_data.values()
        ]

    async def update_agreed_position_status(
        self, chat_id: str, position_id: str, status: str
    ) -> Optional[AgreedPosition]:
        """Update the status of an agreed position."""
        position = await self.get_agreed_position(chat_id, position_id)
        if not position:
            return None

        position.status = status

        await self._redis.hset(
            self._positions_key(chat_id),
            position_id,
            json.dumps(position.to_dict()),
        )

        return position

    # ===== Closure Proposal =====

    async def set_closure_proposal(
        self, chat_id: str, proposer_id: str, content: str
    ) -> ClosureProposal:
        """Set a closure proposal (only one can be pending at a time)."""
        proposal = ClosureProposal(
            id=str(uuid.uuid4()),
            proposer_id=proposer_id,
            content=content,
            timestamp=datetime.utcnow().isoformat(),
        )

        await self._redis.set(
            self._closure_key(chat_id),
            json.dumps(proposal.to_dict()),
            ex=config.REDIS_MESSAGE_TTL,
        )

        return proposal

    async def get_closure_proposal(self, chat_id: str) -> Optional[ClosureProposal]:
        """Get the pending closure proposal."""
        data = await self._redis.get(self._closure_key(chat_id))
        if not data:
            return None
        return ClosureProposal.from_dict(json.loads(data))

    async def clear_closure_proposal(self, chat_id: str) -> None:
        """Clear the pending closure proposal."""
        await self._redis.delete(self._closure_key(chat_id))

    # ===== Definition Requests =====

    async def add_definition_request(
        self,
        chat_id: str,
        requester_id: str,
        term: str,
    ) -> DefinitionRequest:
        """Create a pending definition request."""
        req = DefinitionRequest(
            id=str(uuid.uuid4()),
            requester_id=requester_id,
            term=term,
            status="pending",
            timestamp=datetime.utcnow().isoformat(),
        )

        key = self._definitions_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, req.id, json.dumps(req.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

        return req

    async def get_definition_request(
        self, chat_id: str, request_id: str
    ) -> Optional[DefinitionRequest]:
        """Get a specific definition request."""
        data = await self._redis.hget(self._definitions_key(chat_id), request_id)
        if not data:
            return None
        return DefinitionRequest.from_dict(json.loads(data))

    async def update_definition_request(
        self, chat_id: str, req: DefinitionRequest
    ) -> None:
        """Persist an updated definition request to Redis."""
        key = self._definitions_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, req.id, json.dumps(req.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

    async def get_all_definition_requests(self, chat_id: str) -> list[DefinitionRequest]:
        """Get all definition requests for a chat."""
        definitions_data = await self._redis.hgetall(self._definitions_key(chat_id))
        return [
            DefinitionRequest.from_dict(json.loads(data))
            for data in definitions_data.values()
        ]

    # ===== Explain Requests =====

    async def add_explain_request(
        self,
        chat_id: str,
        requester_id: str,
        position: str,
    ) -> ExplainRequest:
        """Create a pending explain request."""
        req = ExplainRequest(
            id=str(uuid.uuid4()),
            requester_id=requester_id,
            position=position,
            status="pending",
            timestamp=datetime.utcnow().isoformat(),
        )

        key = self._explanations_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, req.id, json.dumps(req.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

        return req

    async def get_explain_request(
        self, chat_id: str, request_id: str
    ) -> Optional[ExplainRequest]:
        """Get a specific explain request."""
        data = await self._redis.hget(self._explanations_key(chat_id), request_id)
        if not data:
            return None
        return ExplainRequest.from_dict(json.loads(data))

    async def update_explain_request(
        self, chat_id: str, req: ExplainRequest
    ) -> None:
        """Persist an updated explain request to Redis."""
        key = self._explanations_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(key, req.id, json.dumps(req.to_dict()))
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

    async def get_all_explain_requests(self, chat_id: str) -> list[ExplainRequest]:
        """Get all explain requests for a chat."""
        explanations_data = await self._redis.hgetall(self._explanations_key(chat_id))
        return [
            ExplainRequest.from_dict(json.loads(data))
            for data in explanations_data.values()
        ]

    # ===== Reactions =====

    def _reactions_key(self, chat_id: str) -> str:
        return f"chat:{chat_id}:reactions"

    async def add_reaction(
        self, chat_id: str, message_id: str, user_id: str, emoji: str
    ) -> None:
        """Set a user's reaction on a message (replaces any previous)."""
        key = self._reactions_key(chat_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.hset(
                key,
                f"{message_id}:{user_id}",
                json.dumps({"emoji": emoji, "timestamp": datetime.utcnow().isoformat()}),
            )
            pipe.expire(key, config.REDIS_MESSAGE_TTL)
            await pipe.execute()

    async def remove_reaction(
        self, chat_id: str, message_id: str, user_id: str
    ) -> None:
        """Remove a user's reaction from a message."""
        await self._redis.hdel(
            self._reactions_key(chat_id), f"{message_id}:{user_id}"
        )

    async def get_reactions(self, chat_id: str) -> dict[str, list[dict]]:
        """Get all reactions for a chat, grouped by message ID."""
        raw = await self._redis.hgetall(self._reactions_key(chat_id))
        grouped: dict[str, list[dict]] = {}
        for field, value in raw.items():
            field_str = field if isinstance(field, str) else field.decode()
            msg_id, user_id = field_str.rsplit(":", 1)
            data = json.loads(value)
            grouped.setdefault(msg_id, []).append(
                {"userId": user_id, "emoji": data["emoji"], "timestamp": data["timestamp"]}
            )
        return grouped

    # ===== Chat Export / Cleanup =====

    async def get_message_count(self, chat_id: str) -> int:
        """Get the number of messages in a chat (O(1) via LLEN)."""
        return await self._redis.llen(self._messages_key(chat_id))

    async def get_chat_export_data(self, chat_id: str) -> dict[str, Any]:
        """Get all chat data for export to PostgreSQL.

        Uses a Redis pipeline to fetch all keys in a single round-trip.
        """
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.lrange(self._messages_key(chat_id), 0, -1)
            pipe.hgetall(self._positions_key(chat_id))
            pipe.hgetall(self._definitions_key(chat_id))
            pipe.hgetall(self._explanations_key(chat_id))
            pipe.hgetall(self._metadata_key(chat_id))
            pipe.get(self._closure_key(chat_id))
            pipe.hgetall(self._reactions_key(chat_id))
            results = await pipe.execute()

        messages_json, positions_data, definitions_data, explanations_data, \
            metadata_data, closure_data, reactions_raw = results

        messages = [ChatMessage.from_dict(json.loads(m)) for m in messages_json]
        positions = [AgreedPosition.from_dict(json.loads(d)) for d in positions_data.values()]
        definitions = [DefinitionRequest.from_dict(json.loads(d)) for d in definitions_data.values()]
        explanations = [ExplainRequest.from_dict(json.loads(d)) for d in explanations_data.values()]

        metadata = None
        if metadata_data:
            metadata = ChatMetadata(
                chat_id=metadata_data.get("chatId", metadata_data.get("chat_id")),
                participant_ids=json.loads(metadata_data.get("participantIds", metadata_data.get("participant_ids", "[]"))),
                start_time=metadata_data.get("startTime", metadata_data.get("start_time")),
            )

        closure = None
        if closure_data:
            closure = ClosureProposal.from_dict(json.loads(closure_data))

        # Parse reactions
        grouped: dict[str, list[dict]] = {}
        for field, value in reactions_raw.items():
            field_str = field if isinstance(field, str) else field.decode()
            msg_id, user_id = field_str.rsplit(":", 1)
            data = json.loads(value)
            grouped.setdefault(msg_id, []).append(
                {"userId": user_id, "emoji": data["emoji"], "timestamp": data["timestamp"]}
            )

        return {
            "messages": [m.to_dict() for m in messages],
            "agreedPositions": [p.to_dict() for p in positions],
            "definitions": [d.to_dict() for d in definitions],
            "explanations": [e.to_dict() for e in explanations],
            "agreedClosure": closure.to_dict() if closure else None,
            "metadata": metadata.to_dict() if metadata else None,
            "reactions": grouped,
            "exportTime": datetime.utcnow().isoformat(),
        }

    async def delete_chat(self, chat_id: str) -> None:
        """Delete all Redis data for a chat after export."""
        metadata = await self.get_chat_metadata(chat_id)

        # Pipeline: delete all chat keys + remove from users' active chats
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.delete(
                self._messages_key(chat_id),
                self._positions_key(chat_id),
                self._closure_key(chat_id),
                self._definitions_key(chat_id),
                self._explanations_key(chat_id),
                self._metadata_key(chat_id),
                self._reactions_key(chat_id),
            )
            if metadata:
                for user_id in metadata.participant_ids:
                    pipe.srem(self._user_chats_key(user_id), chat_id)
            await pipe.execute()

        logger.info(f"Deleted chat {chat_id} from Redis")

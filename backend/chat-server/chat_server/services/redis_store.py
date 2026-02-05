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

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "senderId": self.sender_id,
            "type": self.type,
            "content": self.content,
            "targetId": self.target_id,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ChatMessage":
        return cls(
            id=data["id"],
            sender_id=data.get("senderId", data.get("sender_id")),
            type=data["type"],
            content=data["content"],
            target_id=data.get("targetId", data.get("target_id")),
            timestamp=data["timestamp"],
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

    def _metadata_key(self, chat_id: str) -> str:
        return config.CHAT_METADATA_KEY.format(chat_id=chat_id)

    def _user_chats_key(self, user_id: str) -> str:
        return config.USER_ACTIVE_CHATS_KEY.format(user_id=user_id)

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

        # Store metadata
        await self._redis.hset(
            self._metadata_key(chat_id),
            mapping={
                "chatId": metadata.chat_id,
                "participantIds": json.dumps(metadata.participant_ids),
                "startTime": metadata.start_time,
            },
        )

        # Set TTL
        await self._redis.expire(
            self._metadata_key(chat_id), config.REDIS_MESSAGE_TTL
        )

        # Add chat to each user's active chats
        for user_id in participant_ids:
            await self._redis.sadd(self._user_chats_key(user_id), chat_id)

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
    ) -> ChatMessage:
        """Add a message to a chat."""
        message = ChatMessage(
            id=str(uuid.uuid4()),
            sender_id=sender_id,
            type=message_type,
            content=content,
            target_id=target_id,
            timestamp=datetime.utcnow().isoformat(),
        )

        await self._redis.rpush(
            self._messages_key(chat_id),
            json.dumps(message.to_dict()),
        )

        # Refresh TTL
        await self._redis.expire(
            self._messages_key(chat_id), config.REDIS_MESSAGE_TTL
        )

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

        await self._redis.hset(
            self._positions_key(chat_id),
            position.id,
            json.dumps(position.to_dict()),
        )

        # Refresh TTL
        await self._redis.expire(
            self._positions_key(chat_id), config.REDIS_MESSAGE_TTL
        )

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

    # ===== Chat Export / Cleanup =====

    async def get_chat_export_data(self, chat_id: str) -> dict[str, Any]:
        """Get all chat data for export to PostgreSQL."""
        messages = await self.get_messages(chat_id)
        positions = await self.get_all_agreed_positions(chat_id)
        metadata = await self.get_chat_metadata(chat_id)
        closure = await self.get_closure_proposal(chat_id)

        return {
            "messages": [m.to_dict() for m in messages],
            "agreedPositions": [p.to_dict() for p in positions],
            "agreedClosure": closure.to_dict() if closure else None,
            "metadata": metadata.to_dict() if metadata else None,
            "exportTime": datetime.utcnow().isoformat(),
        }

    async def delete_chat(self, chat_id: str) -> None:
        """Delete all Redis data for a chat after export."""
        metadata = await self.get_chat_metadata(chat_id)

        # Delete all chat keys
        await self._redis.delete(
            self._messages_key(chat_id),
            self._positions_key(chat_id),
            self._closure_key(chat_id),
            self._metadata_key(chat_id),
        )

        # Remove chat from users' active chats
        if metadata:
            for user_id in metadata.participant_ids:
                await self._redis.srem(self._user_chats_key(user_id), chat_id)

        logger.info(f"Deleted chat {chat_id} from Redis")

"""
Unit tests for Redis store service.
"""

import json
import uuid

import pytest

from chat_server.services.redis_store import (
    RedisStore,
    ChatMessage,
    AgreedPosition,
    ClosureProposal,
    ChatMetadata,
)
from chat_server.config import config


class TestRedisStoreConnection:
    """Tests for Redis connection management."""

    @pytest.mark.asyncio
    async def test_connect_and_close(self):
        """Test connecting and closing Redis connection."""
        store = RedisStore()
        await store.connect()
        assert store._redis is not None
        await store.close()


class TestChatMetadata:
    """Tests for chat metadata operations."""

    @pytest.mark.asyncio
    async def test_create_chat(self, redis_client):
        """Test creating a chat."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        metadata = await store.create_chat(chat_id, [user1, user2])

        assert metadata.chat_id == chat_id
        assert user1 in metadata.participant_ids
        assert user2 in metadata.participant_ids
        assert metadata.start_time is not None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_chat_metadata(self, redis_client):
        """Test retrieving chat metadata."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        await store.create_chat(chat_id, [user1, user2])
        metadata = await store.get_chat_metadata(chat_id)

        assert metadata is not None
        assert metadata.chat_id == chat_id
        assert len(metadata.participant_ids) == 2

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_nonexistent_chat_metadata(self, redis_client):
        """Test retrieving metadata for non-existent chat."""
        store = RedisStore()
        store._redis = redis_client

        metadata = await store.get_chat_metadata("nonexistent")
        assert metadata is None

    @pytest.mark.asyncio
    async def test_get_user_active_chats(self, redis_client):
        """Test getting user's active chats."""
        store = RedisStore()
        store._redis = redis_client

        user_id = str(uuid.uuid4())
        chat1 = str(uuid.uuid4())
        chat2 = str(uuid.uuid4())

        await store.create_chat(chat1, [user_id, str(uuid.uuid4())])
        await store.create_chat(chat2, [user_id, str(uuid.uuid4())])

        active_chats = await store.get_user_active_chats(user_id)

        assert chat1 in active_chats
        assert chat2 in active_chats

        # Cleanup
        await store.delete_chat(chat1)
        await store.delete_chat(chat2)

    @pytest.mark.asyncio
    async def test_is_chat_participant(self, redis_client):
        """Test checking chat participation."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())
        user3 = str(uuid.uuid4())

        await store.create_chat(chat_id, [user1, user2])

        assert await store.is_chat_participant(chat_id, user1) is True
        assert await store.is_chat_participant(chat_id, user2) is True
        assert await store.is_chat_participant(chat_id, user3) is False

        # Cleanup
        await store.delete_chat(chat_id)


class TestMessages:
    """Tests for message operations."""

    @pytest.mark.asyncio
    async def test_add_message(self, redis_client):
        """Test adding a message."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        message = await store.add_message(chat_id, user_id, "Hello!")

        assert message.sender_id == user_id
        assert message.content == "Hello!"
        assert message.type == "text"
        assert message.id is not None
        assert message.timestamp is not None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_add_message_with_type(self, redis_client):
        """Test adding a message with custom type."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        message = await store.add_message(
            chat_id, user_id, "System message", message_type="system"
        )

        assert message.type == "system"

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_messages(self, redis_client):
        """Test retrieving messages."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        await store.add_message(chat_id, user_id, "Message 1")
        await store.add_message(chat_id, user_id, "Message 2")
        await store.add_message(chat_id, user_id, "Message 3")

        messages = await store.get_messages(chat_id)

        assert len(messages) == 3
        assert messages[0].content == "Message 1"
        assert messages[1].content == "Message 2"
        assert messages[2].content == "Message 3"

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_messages_with_range(self, redis_client):
        """Test retrieving messages with range."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        for i in range(10):
            await store.add_message(chat_id, user_id, f"Message {i}")

        messages = await store.get_messages(chat_id, start=3, end=6)

        assert len(messages) == 4
        assert messages[0].content == "Message 3"
        assert messages[-1].content == "Message 6"

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_messages_empty(self, redis_client):
        """Test retrieving messages from empty chat."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        await store.create_chat(chat_id, [str(uuid.uuid4()), str(uuid.uuid4())])

        messages = await store.get_messages(chat_id)
        assert messages == []

        # Cleanup
        await store.delete_chat(chat_id)


class TestAgreedPositions:
    """Tests for agreed position operations."""

    @pytest.mark.asyncio
    async def test_add_agreed_position(self, redis_client):
        """Test adding an agreed position."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        position = await store.add_agreed_position(
            chat_id, user_id, "We agree on this"
        )

        assert position.proposer_id == user_id
        assert position.content == "We agree on this"
        assert position.status == "pending"
        assert position.is_closure is False
        assert position.parent_id is None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_add_agreed_position_with_closure(self, redis_client):
        """Test adding a closure position."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        position = await store.add_agreed_position(
            chat_id, user_id, "Final agreement", is_closure=True
        )

        assert position.is_closure is True

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_add_agreed_position_with_parent(self, redis_client):
        """Test adding a modified position with parent."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        original = await store.add_agreed_position(chat_id, user_id, "Original")
        modified = await store.add_agreed_position(
            chat_id, user_id, "Modified", parent_id=original.id
        )

        assert modified.parent_id == original.id

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_agreed_position(self, redis_client):
        """Test retrieving a specific agreed position."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        created = await store.add_agreed_position(chat_id, user_id, "Test position")
        retrieved = await store.get_agreed_position(chat_id, created.id)

        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.content == "Test position"

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_nonexistent_agreed_position(self, redis_client):
        """Test retrieving non-existent position."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        await store.create_chat(chat_id, [str(uuid.uuid4()), str(uuid.uuid4())])

        position = await store.get_agreed_position(chat_id, "nonexistent")
        assert position is None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_all_agreed_positions(self, redis_client):
        """Test retrieving all agreed positions."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        await store.add_agreed_position(chat_id, user_id, "Position 1")
        await store.add_agreed_position(chat_id, user_id, "Position 2")
        await store.add_agreed_position(chat_id, user_id, "Position 3")

        positions = await store.get_all_agreed_positions(chat_id)
        assert len(positions) == 3

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_update_agreed_position_status(self, redis_client):
        """Test updating position status."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        position = await store.add_agreed_position(chat_id, user_id, "Test")
        assert position.status == "pending"

        updated = await store.update_agreed_position_status(
            chat_id, position.id, "accepted"
        )
        assert updated.status == "accepted"

        # Verify in storage
        retrieved = await store.get_agreed_position(chat_id, position.id)
        assert retrieved.status == "accepted"

        # Cleanup
        await store.delete_chat(chat_id)


class TestClosureProposals:
    """Tests for closure proposal operations."""

    @pytest.mark.asyncio
    async def test_set_closure_proposal(self, redis_client):
        """Test setting a closure proposal."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        closure = await store.set_closure_proposal(chat_id, user_id, "Final statement")

        assert closure.proposer_id == user_id
        assert closure.content == "Final statement"
        assert closure.id is not None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_closure_proposal(self, redis_client):
        """Test retrieving closure proposal."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        await store.set_closure_proposal(chat_id, user_id, "Final statement")
        closure = await store.get_closure_proposal(chat_id)

        assert closure is not None
        assert closure.content == "Final statement"

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_get_nonexistent_closure_proposal(self, redis_client):
        """Test retrieving non-existent closure."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        await store.create_chat(chat_id, [str(uuid.uuid4()), str(uuid.uuid4())])

        closure = await store.get_closure_proposal(chat_id)
        assert closure is None

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_clear_closure_proposal(self, redis_client):
        """Test clearing closure proposal."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        await store.create_chat(chat_id, [user_id, str(uuid.uuid4())])

        await store.set_closure_proposal(chat_id, user_id, "Final statement")
        await store.clear_closure_proposal(chat_id)

        closure = await store.get_closure_proposal(chat_id)
        assert closure is None

        # Cleanup
        await store.delete_chat(chat_id)


class TestChatExport:
    """Tests for chat export operations."""

    @pytest.mark.asyncio
    async def test_get_chat_export_data(self, redis_client):
        """Test getting complete chat export data."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        await store.create_chat(chat_id, [user1, user2])

        # Add messages
        await store.add_message(chat_id, user1, "Hello")
        await store.add_message(chat_id, user2, "Hi there")

        # Add agreed position
        await store.add_agreed_position(chat_id, user1, "We agree")

        # Add closure
        await store.set_closure_proposal(chat_id, user1, "Final")

        export = await store.get_chat_export_data(chat_id)

        assert "messages" in export
        assert len(export["messages"]) == 2
        assert "agreedPositions" in export
        assert len(export["agreedPositions"]) == 1
        assert "agreedClosure" in export
        assert export["agreedClosure"]["content"] == "Final"
        assert "metadata" in export
        assert "exportTime" in export

        # Cleanup
        await store.delete_chat(chat_id)

    @pytest.mark.asyncio
    async def test_delete_chat(self, redis_client):
        """Test deleting chat data."""
        store = RedisStore()
        store._redis = redis_client

        chat_id = str(uuid.uuid4())
        user1 = str(uuid.uuid4())
        user2 = str(uuid.uuid4())

        await store.create_chat(chat_id, [user1, user2])
        await store.add_message(chat_id, user1, "Test")
        await store.add_agreed_position(chat_id, user1, "Agreement")
        await store.set_closure_proposal(chat_id, user1, "Final")

        # Delete
        await store.delete_chat(chat_id)

        # Verify all data is gone
        assert await store.get_chat_metadata(chat_id) is None
        assert await store.get_messages(chat_id) == []
        assert await store.get_all_agreed_positions(chat_id) == []
        assert await store.get_closure_proposal(chat_id) is None
        assert chat_id not in await store.get_user_active_chats(user1)
        assert chat_id not in await store.get_user_active_chats(user2)


class TestDataClasses:
    """Tests for data class serialization."""

    def test_chat_message_to_dict(self):
        """Test ChatMessage serialization uses camelCase keys."""
        msg = ChatMessage(
            id="123",
            sender_id="user1",
            type="text",
            content="Hello",
            target_id=None,
            timestamp="2024-01-01T00:00:00",
        )

        d = msg.to_dict()
        assert d["id"] == "123"
        assert d["senderId"] == "user1"
        assert d["content"] == "Hello"
        assert d["targetId"] is None
        assert "sender_id" not in d
        assert "target_id" not in d

    def test_chat_message_from_dict_camel(self):
        """Test ChatMessage deserialization from camelCase."""
        d = {
            "id": "123",
            "senderId": "user1",
            "type": "text",
            "content": "Hello",
            "targetId": None,
            "timestamp": "2024-01-01T00:00:00",
        }

        msg = ChatMessage.from_dict(d)
        assert msg.id == "123"
        assert msg.sender_id == "user1"
        assert msg.content == "Hello"

    def test_chat_message_from_dict_snake_fallback(self):
        """Test ChatMessage deserialization falls back to snake_case."""
        d = {
            "id": "123",
            "sender_id": "user1",
            "type": "text",
            "content": "Hello",
            "target_id": None,
            "timestamp": "2024-01-01T00:00:00",
        }

        msg = ChatMessage.from_dict(d)
        assert msg.id == "123"
        assert msg.sender_id == "user1"

    def test_agreed_position_to_dict(self):
        """Test AgreedPosition serialization uses camelCase keys."""
        pos = AgreedPosition(
            id="123",
            proposer_id="user1",
            content="Agreement",
            parent_id=None,
            status="pending",
            is_closure=False,
            timestamp="2024-01-01T00:00:00",
        )

        d = pos.to_dict()
        assert d["id"] == "123"
        assert d["proposerId"] == "user1"
        assert d["parentId"] is None
        assert d["isClosure"] is False
        assert d["status"] == "pending"
        assert "proposer_id" not in d
        assert "parent_id" not in d
        assert "is_closure" not in d

    def test_closure_proposal_to_dict(self):
        """Test ClosureProposal serialization uses camelCase keys."""
        closure = ClosureProposal(
            id="123",
            proposer_id="user1",
            content="Final",
            timestamp="2024-01-01T00:00:00",
        )

        d = closure.to_dict()
        assert d["content"] == "Final"
        assert d["proposerId"] == "user1"
        assert "proposer_id" not in d

    def test_chat_metadata_to_dict(self):
        """Test ChatMetadata serialization uses camelCase keys."""
        meta = ChatMetadata(
            chat_id="chat-123",
            participant_ids=["u1", "u2"],
            start_time="2024-01-01T00:00:00",
        )

        d = meta.to_dict()
        assert d["chatId"] == "chat-123"
        assert d["participantIds"] == ["u1", "u2"]
        assert d["startTime"] == "2024-01-01T00:00:00"
        assert "chat_id" not in d
        assert "participant_ids" not in d
        assert "start_time" not in d

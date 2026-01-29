"""
Tests for message handling.
"""

import asyncio
import json

import pytest
import socketio

from .conftest import EventCollector


class TestSendMessage:
    """Tests for sending messages."""

    @pytest.mark.asyncio
    async def test_message_not_authenticated(self, connected_client, chat_id):
        """Test sending message without authentication."""
        response = await connected_client.call(
            "message", {"chatId": chat_id, "content": "Hello"}
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_message_missing_chat_id(self, authenticated_client):
        """Test sending message without chatId."""
        client, _ = authenticated_client
        response = await client.call("message", {"content": "Hello"})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_message_missing_content(self, authenticated_client, chat_id):
        """Test sending message without content."""
        client, _ = authenticated_client
        response = await client.call("message", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CONTENT"

    @pytest.mark.asyncio
    async def test_message_empty_content(self, authenticated_client, chat_id):
        """Test sending message with empty content."""
        client, _ = authenticated_client
        response = await client.call("message", {"chatId": chat_id, "content": ""})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CONTENT"

    @pytest.mark.asyncio
    async def test_message_not_participant(self, authenticated_client, chat_id):
        """Test sending message to chat user is not in."""
        client, _ = authenticated_client
        response = await client.call(
            "message", {"chatId": chat_id, "content": "Hello"}
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"

    @pytest.mark.asyncio
    async def test_message_send_success(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test successfully sending a message."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "message", {"chatId": setup_chat, "content": "Hello, World!"}
        )

        assert response["status"] == "sent"
        assert "messageId" in response

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_message_stored_in_redis(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that sent messages are stored in Redis."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        await client.call(
            "message", {"chatId": setup_chat, "content": "Stored message"}
        )

        # Check Redis
        messages = await redis_client.lrange(f"chat:{setup_chat}:messages", 0, -1)
        assert len(messages) == 1

        msg = json.loads(messages[0])
        assert msg["content"] == "Stored message"
        assert msg["sender_id"] == user1_id
        assert msg["type"] == "text"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_message_with_custom_type(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test sending message with custom message type."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        await client.call(
            "message",
            {"chatId": setup_chat, "content": "System message", "messageType": "system"},
        )

        messages = await redis_client.lrange(f"chat:{setup_chat}:messages", 0, -1)
        msg = json.loads(messages[0])
        assert msg["type"] == "system"

        await client.disconnect()


class TestMessageBroadcast:
    """Tests for message broadcasting to room participants."""

    @pytest.mark.asyncio
    async def test_message_broadcast_to_other_user(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that messages are broadcast to other participants."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_messages = []

        @client2.on("message")
        async def on_message(data):
            received_messages.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        await client1.call(
            "message", {"chatId": setup_chat, "content": "Hello from user 1!"}
        )

        await asyncio.sleep(0.2)

        assert len(received_messages) >= 1
        msg = received_messages[-1]
        assert msg["content"] == "Hello from user 1!"
        assert msg["sender"] == user1_id
        assert msg["chatLogId"] == setup_chat
        assert "id" in msg
        assert "sendTime" in msg

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_message_sender_also_receives(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test that the sender also receives their own message broadcast."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_messages = []

        @client.on("message")
        async def on_message(data):
            received_messages.append(data)

        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        await client.call(
            "message", {"chatId": setup_chat, "content": "My own message"}
        )

        await asyncio.sleep(0.2)

        assert len(received_messages) >= 1
        assert received_messages[-1]["content"] == "My own message"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_message_not_broadcast_to_non_participants(
        self,
        test_server,
        user1_id,
        user1_token,
        user3_id,
        user3_token,
        setup_chat,
    ):
        """Test that messages are not broadcast to users not in the chat."""
        client1 = socketio.AsyncClient()
        client3 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_by_client3 = []

        @client3.on("message")
        async def on_message(data):
            received_by_client3.append(data)

        await client1.connect(url)
        await client3.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client3.call("authenticate", {"token": user3_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        # client3 does not join the chat

        await client1.call(
            "message", {"chatId": setup_chat, "content": "Private message"}
        )

        await asyncio.sleep(0.2)

        assert len(received_by_client3) == 0

        await client1.disconnect()
        await client3.disconnect()


class TestGetMessages:
    """Tests for retrieving message history."""

    @pytest.mark.asyncio
    async def test_get_messages_not_authenticated(self, connected_client, chat_id):
        """Test getting messages without authentication."""
        response = await connected_client.call("get_messages", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_get_messages_missing_chat_id(self, authenticated_client):
        """Test getting messages without chatId."""
        client, _ = authenticated_client
        response = await client.call("get_messages", {})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_get_messages_not_participant(self, authenticated_client, chat_id):
        """Test getting messages from chat user is not in."""
        client, _ = authenticated_client
        response = await client.call("get_messages", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"

    @pytest.mark.asyncio
    async def test_get_messages_empty(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test getting messages from empty chat."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        response = await client.call("get_messages", {"chatId": setup_chat})

        assert response["status"] == "ok"
        assert response["messages"] == []

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_get_messages_returns_all(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test getting all messages from chat."""
        # Add messages directly to Redis
        for i in range(5):
            msg = {
                "id": f"msg-{i}",
                "sender_id": user1_id,
                "type": "text",
                "content": f"Message {i}",
                "target_id": None,
                "timestamp": "2024-01-01T00:00:00",
            }
            await redis_client.rpush(f"chat:{setup_chat}:messages", json.dumps(msg))

        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        response = await client.call("get_messages", {"chatId": setup_chat})

        assert response["status"] == "ok"
        assert len(response["messages"]) == 5
        for i, msg in enumerate(response["messages"]):
            assert msg["content"] == f"Message {i}"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_get_messages_with_range(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test getting messages with start/end range."""
        # Add messages
        for i in range(10):
            msg = {
                "id": f"msg-{i}",
                "sender_id": user1_id,
                "type": "text",
                "content": f"Message {i}",
                "target_id": None,
                "timestamp": "2024-01-01T00:00:00",
            }
            await redis_client.rpush(f"chat:{setup_chat}:messages", json.dumps(msg))

        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        response = await client.call(
            "get_messages", {"chatId": setup_chat, "start": 2, "end": 5}
        )

        assert response["status"] == "ok"
        assert len(response["messages"]) == 4  # indices 2, 3, 4, 5
        assert response["messages"][0]["content"] == "Message 2"
        assert response["messages"][-1]["content"] == "Message 5"

        await client.disconnect()

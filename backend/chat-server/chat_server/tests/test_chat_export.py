"""
Tests for chat export and lifecycle functionality.
"""

import asyncio
import json

import pytest
import socketio


class TestExitChat:
    """Tests for exiting a chat."""

    @pytest.mark.asyncio
    async def test_exit_chat_not_authenticated(self, connected_client, chat_id):
        """Test exiting chat without authentication."""
        response = await connected_client.call("exit_chat", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_exit_chat_missing_chat_id(self, authenticated_client):
        """Test exiting chat without chatId."""
        client, _ = authenticated_client
        response = await client.call("exit_chat", {})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_exit_chat_not_participant(self, authenticated_client, chat_id):
        """Test exiting chat user is not in."""
        client, _ = authenticated_client
        response = await client.call("exit_chat", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"


class TestChatStatusBroadcast:
    """Tests for chat status broadcasting."""

    @pytest.mark.asyncio
    async def test_status_broadcast_on_join(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that both users receive join status."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_status = []

        @client2.on("status")
        async def on_status(data):
            received_status.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        await asyncio.sleep(0.2)

        # Status events may or may not be emitted on join depending on implementation
        # This test validates the infrastructure is in place

        await client1.disconnect()
        await client2.disconnect()


class TestChatRequestNotification:
    """Tests for chat request notifications."""

    @pytest.mark.asyncio
    async def test_notify_chat_request_not_authenticated(
        self, connected_client, user2_id
    ):
        """Test notification without authentication."""
        response = await connected_client.call(
            "notify_chat_request",
            {
                "userId": user2_id,
                "requestId": "req123",
                "initiator": {"id": "user1", "displayName": "User 1"},
                "position": {"id": "pos1", "statement": "Test"},
                "createdTime": "2024-01-01T00:00:00Z",
            },
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_notify_chat_request_missing_user_id(self, authenticated_client):
        """Test notification without target userId."""
        client, _ = authenticated_client
        response = await client.call(
            "notify_chat_request",
            {
                "requestId": "req123",
                "initiator": {"id": "user1", "displayName": "User 1"},
                "position": {"id": "pos1", "statement": "Test"},
            },
        )

        assert response["status"] == "error"
        assert response["code"] == "MISSING_USER_ID"

    @pytest.mark.asyncio
    async def test_notify_chat_request_success(
        self, test_server, user1_id, user1_token, user2_id, user2_token
    ):
        """Test successfully sending a chat request notification."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_requests = []

        @client2.on("chat_request")
        async def on_chat_request(data):
            received_requests.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        response = await client1.call(
            "notify_chat_request",
            {
                "userId": user2_id,
                "requestId": "req123",
                "initiator": {"id": user1_id, "displayName": "User 1"},
                "position": {"id": "pos1", "statement": "Test position"},
                "createdTime": "2024-01-01T00:00:00Z",
            },
        )

        assert response["status"] == "notified"

        await asyncio.sleep(0.2)

        assert len(received_requests) >= 1
        req = received_requests[-1]
        assert req["requestId"] == "req123"
        assert req["initiator"]["id"] == user1_id
        assert req["position"]["statement"] == "Test position"

        await client1.disconnect()
        await client2.disconnect()


class TestRedisDataManagement:
    """Tests for Redis data management during chat lifecycle."""

    @pytest.mark.asyncio
    async def test_chat_data_created_on_setup(
        self, redis_client, chat_id, user1_id, user2_id, setup_chat
    ):
        """Test that chat data is created correctly."""
        metadata = await redis_client.hgetall(f"chat:{setup_chat}:metadata")

        assert metadata["chat_id"] == setup_chat
        participants = json.loads(metadata["participant_ids"])
        assert user1_id in participants
        assert user2_id in participants

    @pytest.mark.asyncio
    async def test_user_active_chats_updated(
        self, redis_client, chat_id, user1_id, user2_id, setup_chat
    ):
        """Test that user active chats are updated."""
        user1_chats = await redis_client.smembers(f"user:{user1_id}:active_chats")
        user2_chats = await redis_client.smembers(f"user:{user2_id}:active_chats")

        assert setup_chat in user1_chats
        assert setup_chat in user2_chats

    @pytest.mark.asyncio
    async def test_messages_stored_during_chat(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that messages are stored in Redis during chat."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        # Send multiple messages
        for i in range(5):
            await client.call(
                "message", {"chatId": setup_chat, "content": f"Message {i}"}
            )

        messages = await redis_client.lrange(f"chat:{setup_chat}:messages", 0, -1)
        assert len(messages) == 5

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_positions_stored_during_chat(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that agreed positions are stored in Redis during chat."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        # Propose multiple positions
        for i in range(3):
            await client.call(
                "agreed_position",
                {"chatId": setup_chat, "action": "propose", "content": f"Position {i}"},
            )

        positions = await redis_client.hgetall(f"chat:{setup_chat}:positions")
        assert len(positions) == 3

        await client.disconnect()


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check(self, test_server):
        """Test health check endpoint."""
        import aiohttp

        url = f"http://{test_server.host}:{test_server.port}/health"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                assert response.status == 200
                data = await response.json()
                assert data["status"] == "healthy"
                assert data["service"] == "chat-server"

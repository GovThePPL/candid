"""
Tests for connection and authentication handlers.
"""

import asyncio
import uuid

import pytest
import socketio

from .conftest import (
    create_test_token,
    create_invalid_token,
    create_wrong_secret_token,
)


class TestConnection:
    """Tests for basic Socket.IO connection."""

    @pytest.mark.asyncio
    async def test_connect_succeeds(self, test_server):
        """Test that connection is accepted."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)

        assert client.connected
        await client.disconnect()

    @pytest.mark.asyncio
    async def test_multiple_connections(self, test_server):
        """Test that multiple clients can connect simultaneously."""
        clients = []
        url = f"http://{test_server.host}:{test_server.port}"

        for _ in range(5):
            client = socketio.AsyncClient()
            await client.connect(url)
            clients.append(client)

        for client in clients:
            assert client.connected

        for client in clients:
            await client.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect(self, connected_client):
        """Test client disconnection."""
        assert connected_client.connected
        await connected_client.disconnect()
        assert not connected_client.connected


class TestAuthentication:
    """Tests for JWT authentication."""

    @pytest.mark.asyncio
    async def test_authenticate_success(self, connected_client, user1_id, user1_token):
        """Test successful authentication with valid token."""
        response = await connected_client.call("authenticate", {"token": user1_token})

        assert response["status"] == "authenticated"
        assert response["userId"] == user1_id
        assert isinstance(response["activeChats"], list)

    @pytest.mark.asyncio
    async def test_authenticate_no_token(self, connected_client):
        """Test authentication without token."""
        response = await connected_client.call("authenticate", {})

        assert response["status"] == "error"
        assert response["code"] == "NO_TOKEN"

    @pytest.mark.asyncio
    async def test_authenticate_empty_token(self, connected_client):
        """Test authentication with empty token."""
        response = await connected_client.call("authenticate", {"token": ""})

        assert response["status"] == "error"
        assert response["code"] == "NO_TOKEN"

    @pytest.mark.asyncio
    async def test_authenticate_invalid_token(self, connected_client):
        """Test authentication with invalid token format."""
        response = await connected_client.call(
            "authenticate", {"token": create_invalid_token()}
        )

        assert response["status"] == "error"
        assert response["code"] == "INVALID_TOKEN"

    @pytest.mark.asyncio
    async def test_authenticate_wrong_secret(self, connected_client, user1_id):
        """Test authentication with token signed by wrong secret."""
        token = create_wrong_secret_token(user1_id)
        response = await connected_client.call("authenticate", {"token": token})

        assert response["status"] == "error"
        assert response["code"] == "INVALID_TOKEN"

    @pytest.mark.asyncio
    async def test_authenticate_expired_token(self, connected_client, user1_id):
        """Test authentication with expired token."""
        token = create_test_token(user1_id, expired=True)
        response = await connected_client.call("authenticate", {"token": token})

        assert response["status"] == "error"
        assert response["code"] == "INVALID_TOKEN"

    @pytest.mark.asyncio
    async def test_authenticate_returns_active_chats(
        self, connected_client, user1_id, user1_token, setup_chat
    ):
        """Test that authentication returns user's active chats."""
        response = await connected_client.call("authenticate", {"token": user1_token})

        assert response["status"] == "authenticated"
        assert setup_chat in response["activeChats"]

    @pytest.mark.asyncio
    async def test_multiple_authentications(self, connected_client, user1_token):
        """Test that a client can re-authenticate."""
        response1 = await connected_client.call("authenticate", {"token": user1_token})
        response2 = await connected_client.call("authenticate", {"token": user1_token})

        assert response1["status"] == "authenticated"
        assert response2["status"] == "authenticated"


class TestPingPong:
    """Tests for heartbeat mechanism."""

    @pytest.mark.asyncio
    async def test_ping_pong(self, connected_client):
        """Test ping/pong heartbeat."""
        response = await connected_client.call("ping", {})

        assert response["type"] == "pong"

    @pytest.mark.asyncio
    async def test_ping_with_data(self, connected_client):
        """Test ping with arbitrary data."""
        response = await connected_client.call("ping", {"extra": "data"})

        assert response["type"] == "pong"


class TestJoinChat:
    """Tests for joining chat rooms."""

    @pytest.mark.asyncio
    async def test_join_chat_not_authenticated(self, connected_client, chat_id):
        """Test joining chat without authentication."""
        response = await connected_client.call("join_chat", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_join_chat_missing_chat_id(self, authenticated_client):
        """Test joining chat without chatId."""
        client, _ = authenticated_client
        response = await client.call("join_chat", {})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_join_chat_not_participant(self, authenticated_client, chat_id):
        """Test joining chat user is not a participant of."""
        client, _ = authenticated_client
        response = await client.call("join_chat", {"chatId": chat_id})

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"

    @pytest.mark.asyncio
    async def test_join_chat_success(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test successfully joining a chat."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        response = await client.call("join_chat", {"chatId": setup_chat})

        assert response["status"] == "joined"
        assert response["chatId"] == setup_chat
        assert isinstance(response["messages"], list)
        assert isinstance(response["agreedPositions"], list)

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_join_chat_returns_message_history(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that joining chat returns message history."""
        import json

        # Add some messages to the chat
        for i in range(3):
            msg = {
                "id": str(uuid.uuid4()),
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

        response = await client.call("join_chat", {"chatId": setup_chat})

        assert len(response["messages"]) == 3
        assert response["messages"][0]["content"] == "Message 0"

        await client.disconnect()

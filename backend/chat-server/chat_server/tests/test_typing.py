"""
Tests for typing indicator handling.
"""

import asyncio

import pytest
import socketio


class TestTypingIndicator:
    """Tests for typing indicator events."""

    @pytest.mark.asyncio
    async def test_typing_not_authenticated(self, connected_client, chat_id):
        """Test sending typing indicator without authentication."""
        response = await connected_client.call(
            "typing", {"chatId": chat_id, "isTyping": True}
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_typing_missing_chat_id(self, authenticated_client):
        """Test sending typing indicator without chatId."""
        client, _ = authenticated_client
        response = await client.call("typing", {"isTyping": True})

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_typing_not_participant(self, authenticated_client, chat_id):
        """Test sending typing indicator to chat user is not in."""
        client, _ = authenticated_client
        response = await client.call(
            "typing", {"chatId": chat_id, "isTyping": True}
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"

    @pytest.mark.asyncio
    async def test_typing_success(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test successfully sending typing indicator."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "typing", {"chatId": setup_chat, "isTyping": True}
        )

        assert response["status"] == "ok"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_typing_default_false(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test that isTyping defaults to False."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call("typing", {"chatId": setup_chat})

        assert response["status"] == "ok"

        await client.disconnect()


class TestTypingBroadcast:
    """Tests for typing indicator broadcasting."""

    @pytest.mark.asyncio
    async def test_typing_broadcast_to_other_user(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that typing indicators are broadcast to other participants."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_typing = []

        @client2.on("typing")
        async def on_typing(data):
            received_typing.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        await client1.call("typing", {"chatId": setup_chat, "isTyping": True})

        await asyncio.sleep(0.2)

        assert len(received_typing) >= 1
        event = received_typing[-1]
        assert event["chatId"] == setup_chat
        assert event["userId"] == user1_id
        assert event["isTyping"] is True

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_typing_not_sent_to_sender(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test that typing indicator is not sent back to sender."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_typing = []

        @client.on("typing")
        async def on_typing(data):
            received_typing.append(data)

        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        await client.call("typing", {"chatId": setup_chat, "isTyping": True})

        await asyncio.sleep(0.2)

        # Sender should not receive their own typing indicator
        assert len(received_typing) == 0

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_typing_stop_broadcast(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that stopping typing is broadcast."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_typing = []

        @client2.on("typing")
        async def on_typing(data):
            received_typing.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # Start typing
        await client1.call("typing", {"chatId": setup_chat, "isTyping": True})
        await asyncio.sleep(0.1)

        # Stop typing
        await client1.call("typing", {"chatId": setup_chat, "isTyping": False})
        await asyncio.sleep(0.2)

        assert len(received_typing) >= 2
        assert received_typing[-2]["isTyping"] is True
        assert received_typing[-1]["isTyping"] is False

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_typing_not_broadcast_to_non_participants(
        self,
        test_server,
        user1_id,
        user1_token,
        user3_id,
        user3_token,
        setup_chat,
    ):
        """Test that typing is not broadcast to users not in the chat."""
        client1 = socketio.AsyncClient()
        client3 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_by_client3 = []

        @client3.on("typing")
        async def on_typing(data):
            received_by_client3.append(data)

        await client1.connect(url)
        await client3.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client3.call("authenticate", {"token": user3_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        # client3 does not join the chat

        await client1.call("typing", {"chatId": setup_chat, "isTyping": True})

        await asyncio.sleep(0.2)

        assert len(received_by_client3) == 0

        await client1.disconnect()
        await client3.disconnect()

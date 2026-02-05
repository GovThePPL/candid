"""
Tests for chat request response handling via pub/sub.

Tests the flow where the REST API publishes chat_request_response events
when a chat request is accepted or dismissed, and the chat server
notifies the initiator via Socket.IO.
"""

import asyncio
import json
import uuid

import pytest
import socketio
import redis.asyncio as aioredis

from .conftest import create_test_token


class TestChatRequestResponsePubSub:
    """Tests for handling chat_request_response events from pub/sub."""

    @pytest.mark.asyncio
    async def test_chat_request_accepted_event_received(
        self, test_server, redis_client, user1_id, user1_token
    ):
        """
        Test that initiator receives chat_request_accepted event
        when their request is accepted.
        """
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_events = []

        @client.on("chat_request_accepted")
        async def on_accepted(data):
            received_events.append(data)

        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        # Simulate the REST API publishing a chat_request_response event
        request_id = str(uuid.uuid4())
        chat_log_id = str(uuid.uuid4())
        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,
            "chatLogId": chat_log_id,
        }

        await redis_client.publish("chat:events", json.dumps(event))

        # Wait for event to propagate
        await asyncio.sleep(0.3)

        assert len(received_events) >= 1
        assert received_events[0]["requestId"] == request_id
        assert received_events[0]["chatLogId"] == chat_log_id

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_chat_request_declined_event_received(
        self, test_server, redis_client, user1_id, user1_token
    ):
        """
        Test that initiator receives chat_request_declined event
        when their request is dismissed.
        """
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_events = []

        @client.on("chat_request_declined")
        async def on_declined(data):
            received_events.append(data)

        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})

        # Simulate the REST API publishing a chat_request_response event
        request_id = str(uuid.uuid4())
        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "dismissed",
            "initiatorUserId": user1_id,
        }

        await redis_client.publish("chat:events", json.dumps(event))

        # Wait for event to propagate
        await asyncio.sleep(0.3)

        assert len(received_events) >= 1
        assert received_events[0]["requestId"] == request_id
        assert "chatLogId" not in received_events[0]

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_event_only_sent_to_initiator(
        self, test_server, redis_client, user1_id, user1_token, user2_id, user2_token
    ):
        """
        Test that chat_request_accepted event is only sent to the initiator,
        not to other connected users.
        """
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        events_for_user1 = []
        events_for_user2 = []

        @client1.on("chat_request_accepted")
        async def on_accepted_1(data):
            events_for_user1.append(data)

        @client2.on("chat_request_accepted")
        async def on_accepted_2(data):
            events_for_user2.append(data)

        await client1.connect(url)
        await client2.connect(url)
        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        # Publish event for user1 only
        request_id = str(uuid.uuid4())
        chat_log_id = str(uuid.uuid4())
        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,  # Only user1 should receive
            "chatLogId": chat_log_id,
        }

        await redis_client.publish("chat:events", json.dumps(event))
        await asyncio.sleep(0.3)

        assert len(events_for_user1) >= 1
        assert len(events_for_user2) == 0

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_multiple_connections_same_user_all_receive(
        self, test_server, redis_client, user1_id, user1_token
    ):
        """
        Test that when a user has multiple connections, all of them
        receive the chat_request_accepted event.
        """
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        events_client1 = []
        events_client2 = []

        @client1.on("chat_request_accepted")
        async def on_accepted_1(data):
            events_client1.append(data)

        @client2.on("chat_request_accepted")
        async def on_accepted_2(data):
            events_client2.append(data)

        await client1.connect(url)
        await client2.connect(url)
        # Both clients authenticate as the same user
        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user1_token})

        # Publish event for user1
        request_id = str(uuid.uuid4())
        chat_log_id = str(uuid.uuid4())
        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,
            "chatLogId": chat_log_id,
        }

        await redis_client.publish("chat:events", json.dumps(event))
        await asyncio.sleep(0.3)

        # Both connections should receive the event
        assert len(events_client1) >= 1
        assert len(events_client2) >= 1
        assert events_client1[0]["requestId"] == request_id
        assert events_client2[0]["requestId"] == request_id

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_disconnected_user_does_not_crash(
        self, test_server, redis_client, user1_id
    ):
        """
        Test that publishing an event for a disconnected user
        doesn't cause errors.
        """
        # Publish event for user who is not connected
        request_id = str(uuid.uuid4())
        event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,
            "chatLogId": str(uuid.uuid4()),
        }

        # This should not raise an exception
        await redis_client.publish("chat:events", json.dumps(event))
        await asyncio.sleep(0.2)

        # Test passes if no exception was raised

    @pytest.mark.asyncio
    async def test_invalid_event_data_handled_gracefully(
        self, test_server, redis_client
    ):
        """
        Test that invalid event data is handled gracefully
        without crashing the server.
        """
        # Missing required fields
        event = {
            "event": "chat_request_response",
            "requestId": str(uuid.uuid4()),
            # Missing response, initiatorUserId
        }

        # Should not crash
        await redis_client.publish("chat:events", json.dumps(event))
        await asyncio.sleep(0.2)

        # Malformed JSON
        await redis_client.publish("chat:events", "not valid json")
        await asyncio.sleep(0.2)

        # Empty event
        await redis_client.publish("chat:events", json.dumps({}))
        await asyncio.sleep(0.2)

        # Test passes if server is still running

    @pytest.mark.asyncio
    async def test_chat_started_event_on_accept(
        self, test_server, redis_client, user1_id, user1_token, user2_id, user2_token
    ):
        """
        Test that both users receive chat_started event when
        a chat request is accepted.
        """
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        chat_started_user1 = []
        chat_started_user2 = []

        @client1.on("chat_started")
        async def on_started_1(data):
            chat_started_user1.append(data)

        @client2.on("chat_started")
        async def on_started_2(data):
            chat_started_user2.append(data)

        await client1.connect(url)
        await client2.connect(url)
        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        # Publish chat_accepted event (this is different from chat_request_response)
        chat_log_id = str(uuid.uuid4())
        chat_request_id = str(uuid.uuid4())
        event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": chat_request_id,
            "initiatorUserId": user1_id,
            "responderUserId": user2_id,
            "positionStatement": "Test position statement",
        }

        await redis_client.publish("chat:events", json.dumps(event))
        await asyncio.sleep(0.5)

        # Both users should receive chat_started
        assert len(chat_started_user1) >= 1
        assert len(chat_started_user2) >= 1
        assert chat_started_user1[0]["chatId"] == chat_log_id
        assert chat_started_user2[0]["chatId"] == chat_log_id
        assert chat_started_user1[0]["role"] == "initiator"
        assert chat_started_user2[0]["role"] == "responder"

        await client1.disconnect()
        await client2.disconnect()


class TestChatRequestResponseWithChatAccepted:
    """Tests for the interaction between chat_request_response and chat_accepted events."""

    @pytest.mark.asyncio
    async def test_initiator_receives_both_events_on_accept(
        self, test_server, redis_client, user1_id, user1_token, user2_id, user2_token
    ):
        """
        When a chat request is accepted, the initiator should receive both:
        1. chat_request_accepted (response notification)
        2. chat_started (chat is ready)
        """
        client1 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        request_accepted_events = []
        chat_started_events = []

        @client1.on("chat_request_accepted")
        async def on_request_accepted(data):
            request_accepted_events.append(data)

        @client1.on("chat_started")
        async def on_chat_started(data):
            chat_started_events.append(data)

        await client1.connect(url)
        await client1.call("authenticate", {"token": user1_token})

        request_id = str(uuid.uuid4())
        chat_log_id = str(uuid.uuid4())

        # Publish chat_request_response (acceptance notification)
        response_event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,
            "chatLogId": chat_log_id,
        }
        await redis_client.publish("chat:events", json.dumps(response_event))

        # Publish chat_accepted (chat setup)
        accepted_event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": request_id,
            "initiatorUserId": user1_id,
            "responderUserId": user2_id,
            "positionStatement": "Test position",
        }
        await redis_client.publish("chat:events", json.dumps(accepted_event))

        await asyncio.sleep(0.5)

        # Initiator should receive both events
        assert len(request_accepted_events) >= 1
        assert len(chat_started_events) >= 1
        assert request_accepted_events[0]["chatLogId"] == chat_log_id
        assert chat_started_events[0]["chatId"] == chat_log_id

        await client1.disconnect()

    @pytest.mark.asyncio
    async def test_responder_only_receives_chat_started(
        self, test_server, redis_client, user1_id, user2_id, user2_token
    ):
        """
        The responder should only receive chat_started, not chat_request_accepted.
        """
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        request_accepted_events = []
        chat_started_events = []

        @client2.on("chat_request_accepted")
        async def on_request_accepted(data):
            request_accepted_events.append(data)

        @client2.on("chat_started")
        async def on_chat_started(data):
            chat_started_events.append(data)

        await client2.connect(url)
        await client2.call("authenticate", {"token": user2_token})

        request_id = str(uuid.uuid4())
        chat_log_id = str(uuid.uuid4())

        # Publish both events
        response_event = {
            "event": "chat_request_response",
            "requestId": request_id,
            "response": "accepted",
            "initiatorUserId": user1_id,  # Not user2
            "chatLogId": chat_log_id,
        }
        await redis_client.publish("chat:events", json.dumps(response_event))

        accepted_event = {
            "event": "chat_accepted",
            "chatLogId": chat_log_id,
            "chatRequestId": request_id,
            "initiatorUserId": user1_id,
            "responderUserId": user2_id,
            "positionStatement": "Test position",
        }
        await redis_client.publish("chat:events", json.dumps(accepted_event))

        await asyncio.sleep(0.5)

        # Responder should not receive chat_request_accepted
        assert len(request_accepted_events) == 0
        # But should receive chat_started
        assert len(chat_started_events) >= 1
        assert chat_started_events[0]["chatId"] == chat_log_id
        assert chat_started_events[0]["role"] == "responder"

        await client2.disconnect()

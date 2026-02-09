"""Unit tests for chat event publishing functions."""

import sys
import os

# Add the generated directory to the path to find the candid module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server', 'generated'))

import pytest
import json
from unittest.mock import patch, MagicMock


class TestPublishChatRequestResponse:
    """Unit tests for publish_chat_request_response function."""

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_accepted_with_chat_log_id(self, mock_get_redis):
        """Test publishing accepted response with chat_log_id."""
        from candid.controllers.helpers.chat_events import publish_chat_request_response

        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        result = publish_chat_request_response(
            request_id="req-123",
            response="accepted",
            initiator_user_id="user-456",
            chat_log_id="chat-789",
        )

        assert result is True
        mock_redis.publish.assert_called_once()

        # Verify the published event structure
        call_args = mock_redis.publish.call_args
        channel, message = call_args[0]
        assert channel == "chat:events"

        event = json.loads(message)
        assert event["event"] == "chat_request_response"
        assert event["requestId"] == "req-123"
        assert event["response"] == "accepted"
        assert event["initiatorUserId"] == "user-456"
        assert event["chatLogId"] == "chat-789"

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_dismissed_without_chat_log_id(self, mock_get_redis):
        """Test publishing dismissed response without chat_log_id."""
        from candid.controllers.helpers.chat_events import publish_chat_request_response

        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        result = publish_chat_request_response(
            request_id="req-123",
            response="dismissed",
            initiator_user_id="user-456",
            chat_log_id=None,
        )

        assert result is True
        mock_redis.publish.assert_called_once()

        # Verify chatLogId is not included when None
        call_args = mock_redis.publish.call_args
        _, message = call_args[0]
        event = json.loads(message)
        assert "chatLogId" not in event
        assert event["response"] == "dismissed"

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_handles_redis_error(self, mock_get_redis):
        """Test that Redis errors are handled gracefully."""
        from candid.controllers.helpers.chat_events import publish_chat_request_response

        mock_get_redis.side_effect = Exception("Redis connection failed")

        result = publish_chat_request_response(
            request_id="req-123",
            response="accepted",
            initiator_user_id="user-456",
            chat_log_id="chat-789",
        )

        assert result is False

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_handles_publish_error(self, mock_get_redis):
        """Test that publish errors are handled gracefully."""
        from candid.controllers.helpers.chat_events import publish_chat_request_response

        mock_redis = MagicMock()
        mock_redis.publish.side_effect = Exception("Publish failed")
        mock_get_redis.return_value = mock_redis

        result = publish_chat_request_response(
            request_id="req-123",
            response="accepted",
            initiator_user_id="user-456",
            chat_log_id="chat-789",
        )

        assert result is False

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_uses_correct_channel(self, mock_get_redis):
        """Test that events are published to the correct channel."""
        from candid.controllers.helpers.chat_events import (
            publish_chat_request_response,
            CHAT_EVENTS_CHANNEL,
        )

        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        publish_chat_request_response(
            request_id="req-123",
            response="accepted",
            initiator_user_id="user-456",
        )

        call_args = mock_redis.publish.call_args
        channel, _ = call_args[0]
        assert channel == CHAT_EVENTS_CHANNEL
        assert channel == "chat:events"


class TestPublishChatAccepted:
    """Unit tests for publish_chat_accepted function."""

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_chat_accepted_success(self, mock_get_redis):
        """Test successful publishing of chat_accepted event."""
        from candid.controllers.helpers.chat_events import publish_chat_accepted

        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        result = publish_chat_accepted(
            chat_log_id="chat-123",
            chat_request_id="req-456",
            initiator_user_id="user-A",
            responder_user_id="user-B",
            position_statement="Test position statement",
        )

        assert result is True
        mock_redis.publish.assert_called_once()

        # Verify event structure
        call_args = mock_redis.publish.call_args
        channel, message = call_args[0]
        assert channel == "chat:events"

        event = json.loads(message)
        assert event["event"] == "chat_accepted"
        assert event["chatLogId"] == "chat-123"
        assert event["chatRequestId"] == "req-456"
        assert event["initiatorUserId"] == "user-A"
        assert event["responderUserId"] == "user-B"
        assert event["positionStatement"] == "Test position statement"

    @patch('candid.controllers.helpers.chat_events.get_redis')
    def test_publish_chat_accepted_handles_error(self, mock_get_redis):
        """Test that errors are handled gracefully."""
        from candid.controllers.helpers.chat_events import publish_chat_accepted

        mock_get_redis.side_effect = Exception("Connection failed")

        result = publish_chat_accepted(
            chat_log_id="chat-123",
            chat_request_id="req-456",
            initiator_user_id="user-A",
            responder_user_id="user-B",
            position_statement="Test",
        )

        assert result is False


class TestChatEventsIntegration:
    """
    Integration tests that verify chat events are properly published.
    These tests require a running Redis instance.

    NOTE: These tests verify publishing to Redis but the publish functions
    use the Docker hostname (redis:6379). When running outside Docker,
    use the unit tests above instead.
    """

    @pytest.fixture
    def redis_client(self):
        """Get a Redis client for testing."""
        import redis
        from .conftest import REDIS_URL
        try:
            client = redis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            client.ping()  # Test connection
            yield client
            client.close()
        except redis.exceptions.ConnectionError:
            pytest.skip("Redis not available at localhost:6379")

    @pytest.fixture
    def pubsub(self, redis_client):
        """Create a pubsub subscriber."""
        ps = redis_client.pubsub()
        ps.subscribe("chat:events")
        # Consume the subscription message
        ps.get_message(timeout=1)
        yield ps
        ps.unsubscribe()
        ps.close()

    @pytest.mark.integration
    @pytest.mark.skip(reason="Requires Docker environment - publish functions use Docker hostname")
    def test_publish_chat_request_response_integration(self, redis_client, pubsub):
        """Integration test that verifies event is actually published to Redis."""
        from candid.controllers.helpers.chat_events import publish_chat_request_response

        result = publish_chat_request_response(
            request_id="test-req-123",
            response="accepted",
            initiator_user_id="test-user-456",
            chat_log_id="test-chat-789",
        )

        assert result is True

        # Get the published message
        import time
        message = None
        for _ in range(10):  # Try for up to 1 second
            message = pubsub.get_message(timeout=0.1)
            if message and message["type"] == "message":
                break

        assert message is not None
        assert message["type"] == "message"

        event = json.loads(message["data"])
        assert event["event"] == "chat_request_response"
        assert event["requestId"] == "test-req-123"

    @pytest.mark.integration
    @pytest.mark.skip(reason="Requires Docker environment - publish functions use Docker hostname")
    def test_publish_chat_accepted_integration(self, redis_client, pubsub):
        """Integration test that verifies chat_accepted event is published."""
        from candid.controllers.helpers.chat_events import publish_chat_accepted

        result = publish_chat_accepted(
            chat_log_id="test-chat-123",
            chat_request_id="test-req-456",
            initiator_user_id="user-A",
            responder_user_id="user-B",
            position_statement="Integration test position",
        )

        assert result is True

        # Get the published message
        message = None
        for _ in range(10):
            message = pubsub.get_message(timeout=0.1)
            if message and message["type"] == "message":
                break

        assert message is not None
        event = json.loads(message["data"])
        assert event["event"] == "chat_accepted"
        assert event["chatLogId"] == "test-chat-123"

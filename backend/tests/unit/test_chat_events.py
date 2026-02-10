"""Unit tests for chat_events.py — Redis pub/sub event publishing."""

import json
import pytest
from unittest.mock import patch, MagicMock

from .conftest import MockRedis

pytestmark = pytest.mark.unit


@pytest.fixture
def redis_and_events():
    r = MockRedis()
    with patch("candid.controllers.helpers.chat_events.get_redis", return_value=r):
        from candid.controllers.helpers import chat_events
        yield r, chat_events


# ---------------------------------------------------------------------------
# publish_chat_request_response
# ---------------------------------------------------------------------------

class TestPublishChatRequestResponse:
    def test_accepted_event(self, redis_and_events):
        r, events = redis_and_events
        # Capture what gets published
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        result = events.publish_chat_request_response(
            request_id="req-1",
            response="accepted",
            initiator_user_id="user-1",
            chat_log_id="chat-1",
        )

        assert result is True
        assert len(published) == 1
        channel, event = published[0]
        assert channel == "chat:events"
        assert event["event"] == "chat_request_response"
        assert event["requestId"] == "req-1"
        assert event["response"] == "accepted"
        assert event["initiatorUserId"] == "user-1"
        assert event["chatLogId"] == "chat-1"

    def test_dismissed_event_no_chat_log(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        result = events.publish_chat_request_response(
            request_id="req-2",
            response="dismissed",
            initiator_user_id="user-2",
        )

        assert result is True
        _, event = published[0]
        assert event["response"] == "dismissed"
        assert "chatLogId" not in event

    def test_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.publish = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.chat_events.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.chat_events import publish_chat_request_response
            result = publish_chat_request_response("req-1", "accepted", "user-1")
            assert result is False


# ---------------------------------------------------------------------------
# publish_chat_request_received
# ---------------------------------------------------------------------------

class TestPublishChatRequestReceived:
    def test_event_structure(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        card_data = {"type": "chat_request", "id": "req-1", "statement": "test"}
        result = events.publish_chat_request_received(
            recipient_user_id="user-3",
            card_data=card_data,
        )

        assert result is True
        _, event = published[0]
        assert event["event"] == "chat_request_received"
        assert event["recipientUserId"] == "user-3"
        assert event["card"] == card_data


# ---------------------------------------------------------------------------
# publish_chat_accepted
# ---------------------------------------------------------------------------

class TestPublishChatAccepted:
    def test_event_structure(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        result = events.publish_chat_accepted(
            chat_log_id="chat-1",
            chat_request_id="req-1",
            initiator_user_id="user-1",
            responder_user_id="user-2",
            position_statement="Healthcare should be free",
        )

        assert result is True
        _, event = published[0]
        assert event["event"] == "chat_accepted"
        assert event["chatLogId"] == "chat-1"
        assert event["chatRequestId"] == "req-1"
        assert event["initiatorUserId"] == "user-1"
        assert event["responderUserId"] == "user-2"
        assert event["positionStatement"] == "Healthcare should be free"

    def test_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.publish = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.chat_events.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.chat_events import publish_chat_accepted
            result = publish_chat_accepted("c", "r", "u1", "u2", "stmt")
            assert result is False

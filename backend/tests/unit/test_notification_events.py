"""Unit tests for notification_events.py — Redis pub/sub event publishing for notifications."""

import json
import pytest
from unittest.mock import patch, MagicMock

from .conftest import MockRedis

pytestmark = pytest.mark.unit


@pytest.fixture
def redis_and_events():
    r = MockRedis()
    with patch("candid.controllers.helpers.notification_events.get_redis", return_value=r):
        from candid.controllers.helpers import notification_events
        yield r, notification_events


# ---------------------------------------------------------------------------
# publish_notification
# ---------------------------------------------------------------------------

class TestPublishNotification:
    def test_event_structure(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        result = events.publish_notification(
            user_id="user-1",
            inbox_id="inbox-1",
            notification_type="comment_reply",
            title="Alice replied to your comment",
            body="I agree with that",
            data={"action": "open_post", "postId": "post-1"},
            actor_user_id="actor-1",
            actor_display_name="Alice",
            actor_avatar_icon_url="data:image/png;base64,abc",
            created_time="2026-02-16T10:00:00",
        )

        assert result is True
        assert len(published) == 1
        channel, event = published[0]
        assert channel == "notifications:events"
        assert event["event"] == "notification"
        assert event["userId"] == "user-1"
        notif = event["notification"]
        assert notif["id"] == "inbox-1"
        assert notif["type"] == "comment_reply"
        assert notif["actorUserId"] == "actor-1"
        assert notif["actorDisplayName"] == "Alice"
        assert notif["title"] == "Alice replied to your comment"
        assert notif["body"] == "I agree with that"
        assert notif["data"]["action"] == "open_post"
        assert notif["isRead"] is False

    def test_no_actor(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        result = events.publish_notification(
            user_id="user-1",
            inbox_id="inbox-2",
            notification_type="moderation",
            title="Content removed",
            body="Your post was removed",
        )

        assert result is True
        notif = published[0][1]["notification"]
        assert notif["actorUserId"] is None
        assert notif["actorDisplayName"] is None

    def test_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.publish = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.notification_events.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.notification_events import publish_notification
            result = publish_notification(
                user_id="user-1", inbox_id="inbox-1",
                notification_type="chat_request",
                title="Test", body="Test",
            )
            assert result is False

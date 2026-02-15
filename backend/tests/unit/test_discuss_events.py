"""Unit tests for discuss_events.py — Redis pub/sub event publishing for discuss forum."""

import json
import pytest
from unittest.mock import patch, MagicMock

from .conftest import MockRedis

pytestmark = pytest.mark.unit


@pytest.fixture
def redis_and_events():
    r = MockRedis()
    with patch("candid.controllers.helpers.discuss_events.get_redis", return_value=r):
        from candid.controllers.helpers import discuss_events
        yield r, discuss_events


# ---------------------------------------------------------------------------
# publish_new_comment
# ---------------------------------------------------------------------------

class TestPublishNewComment:
    def test_event_structure(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        comment_dict = {
            "id": "comment-1",
            "postId": "post-1",
            "body": "Hello world",
            "depth": 0,
        }
        result = events.publish_new_comment("post-1", comment_dict)

        assert result is True
        assert len(published) == 1
        channel, event = published[0]
        assert channel == "discuss:events"
        assert event["event"] == "new_comment"
        assert event["postId"] == "post-1"
        assert event["comment"] == comment_dict

    def test_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.publish = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.discuss_events.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.discuss_events import publish_new_comment
            result = publish_new_comment("post-1", {"id": "c1"})
            assert result is False


# ---------------------------------------------------------------------------
# publish_vote_update
# ---------------------------------------------------------------------------

class TestPublishVoteUpdate:
    def test_event_structure(self, redis_and_events):
        r, events = redis_and_events
        published = []
        r.publish = lambda channel, msg: published.append((channel, json.loads(msg))) or 1

        counts = {"upvoteCount": 5, "downvoteCount": 1, "score": 0.72}
        result = events.publish_vote_update("post-1", "comment-1", counts)

        assert result is True
        assert len(published) == 1
        channel, event = published[0]
        assert channel == "discuss:events"
        assert event["event"] == "vote_update"
        assert event["postId"] == "post-1"
        assert event["commentId"] == "comment-1"
        assert event["counts"] == counts

    def test_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.publish = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.discuss_events.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.discuss_events import publish_vote_update
            result = publish_vote_update("post-1", "comment-1", {})
            assert result is False

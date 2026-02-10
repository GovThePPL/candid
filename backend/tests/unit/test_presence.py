"""Unit tests for presence.py — Redis-based presence tracking."""

import pytest
from unittest.mock import patch, MagicMock

# Import conftest MockRedis
from .conftest import MockRedis

pytestmark = pytest.mark.unit


def _get_patched_presence(mock_redis_instance):
    """Return the presence module with get_redis patched."""
    with patch(
        "candid.controllers.helpers.presence.get_redis",
        return_value=mock_redis_instance,
    ):
        from candid.controllers.helpers import presence
        yield presence


@pytest.fixture
def redis_and_presence():
    r = MockRedis()
    with patch("candid.controllers.helpers.presence.get_redis", return_value=r):
        from candid.controllers.helpers import presence
        yield r, presence


# ---------------------------------------------------------------------------
# record_swiping / record_heartbeat
# ---------------------------------------------------------------------------

class TestRecordPresence:
    def test_record_swiping_sets_both_keys(self, redis_and_presence):
        r, presence = redis_and_presence
        presence.record_swiping("user-1")
        assert r.get("presence:swiping:user-1") == "1"
        assert r.get("presence:in_app:user-1") == "1"

    def test_record_swiping_ttl(self, redis_and_presence):
        r, presence = redis_and_presence
        presence.record_swiping("user-1")
        assert r._ttls.get("presence:swiping:user-1") == 45
        assert r._ttls.get("presence:in_app:user-1") == 60

    def test_record_heartbeat_sets_in_app(self, redis_and_presence):
        r, presence = redis_and_presence
        presence.record_heartbeat("user-1")
        assert r.get("presence:in_app:user-1") == "1"
        assert r.get("presence:swiping:user-1") is None  # not set

    def test_record_heartbeat_ttl(self, redis_and_presence):
        r, presence = redis_and_presence
        presence.record_heartbeat("user-1")
        assert r._ttls.get("presence:in_app:user-1") == 60


# ---------------------------------------------------------------------------
# is_user_swiping / is_user_in_app
# ---------------------------------------------------------------------------

class TestIsUserPresent:
    def test_swiping_true(self, redis_and_presence):
        r, presence = redis_and_presence
        r.set("presence:swiping:user-1", "1")
        assert presence.is_user_swiping("user-1") is True

    def test_swiping_false(self, redis_and_presence):
        _, presence = redis_and_presence
        assert presence.is_user_swiping("user-1") is False

    def test_in_app_true(self, redis_and_presence):
        r, presence = redis_and_presence
        r.set("presence:in_app:user-1", "1")
        assert presence.is_user_in_app("user-1") is True

    def test_in_app_false(self, redis_and_presence):
        _, presence = redis_and_presence
        assert presence.is_user_in_app("user-1") is False


# ---------------------------------------------------------------------------
# get_swiping_users / get_in_app_users
# ---------------------------------------------------------------------------

class TestBatchPresence:
    def test_get_swiping_users(self, redis_and_presence):
        r, presence = redis_and_presence
        r.set("presence:swiping:u1", "1")
        r.set("presence:swiping:u3", "1")
        result = presence.get_swiping_users(["u1", "u2", "u3"])
        assert result == {"u1", "u3"}

    def test_get_in_app_users(self, redis_and_presence):
        r, presence = redis_and_presence
        r.set("presence:in_app:u2", "1")
        result = presence.get_in_app_users(["u1", "u2", "u3"])
        assert result == {"u2"}

    def test_empty_input(self, redis_and_presence):
        _, presence = redis_and_presence
        assert presence.get_swiping_users([]) == set()
        assert presence.get_in_app_users([]) == set()

    def test_no_matches(self, redis_and_presence):
        _, presence = redis_and_presence
        assert presence.get_swiping_users(["u1", "u2"]) == set()


# ---------------------------------------------------------------------------
# get_chat_likelihoods
# ---------------------------------------------------------------------------

class TestChatLikelihoods:
    def test_returns_stored_values(self, redis_and_presence):
        r, presence = redis_and_presence
        r.set("preference:chat_likelihood:u1", "5")
        r.set("preference:chat_likelihood:u2", "1")
        result = presence.get_chat_likelihoods(["u1", "u2", "u3"])
        assert result["u1"] == 5
        assert result["u2"] == 1
        assert result["u3"] == 3  # default

    def test_empty_input(self, redis_and_presence):
        _, presence = redis_and_presence
        assert presence.get_chat_likelihoods([]) == {}

    def test_default_value_is_3(self, redis_and_presence):
        _, presence = redis_and_presence
        result = presence.get_chat_likelihoods(["u1"])
        assert result["u1"] == 3


# ---------------------------------------------------------------------------
# set_chat_likelihood
# ---------------------------------------------------------------------------

class TestSetChatLikelihood:
    def test_stores_value(self, redis_and_presence):
        r, presence = redis_and_presence
        presence.set_chat_likelihood("u1", 4)
        assert r.get("preference:chat_likelihood:u1") == "4"


# ---------------------------------------------------------------------------
# Exception resilience
# ---------------------------------------------------------------------------

class TestExceptionResilience:
    def test_swiping_redis_error_returns_false(self):
        mock_redis = MagicMock()
        mock_redis.exists = MagicMock(side_effect=Exception("connection failed"))
        with patch("candid.controllers.helpers.presence.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.presence import is_user_swiping
            assert is_user_swiping("u1") is False

    def test_get_swiping_users_error_returns_empty(self):
        mock_redis = MagicMock()
        mock_redis.pipeline = MagicMock(side_effect=Exception("connection failed"))
        with patch("candid.controllers.helpers.presence.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.presence import get_swiping_users
            assert get_swiping_users(["u1"]) == set()

    def test_get_likelihoods_error_returns_defaults(self):
        mock_redis = MagicMock()
        mock_redis.pipeline = MagicMock(side_effect=Exception("connection failed"))
        with patch("candid.controllers.helpers.presence.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.presence import get_chat_likelihoods
            result = get_chat_likelihoods(["u1", "u2"])
            assert result == {"u1": 3, "u2": 3}

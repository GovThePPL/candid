"""Unit tests for auth.py — role hierarchy, authorization, ban checking."""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Helpers to set up mocking for auth module
# ---------------------------------------------------------------------------

def _import_auth(mock_db, mock_redis_instance):
    """Import auth module with mocked DB and Redis."""
    with patch("candid.controllers.helpers.auth.db", mock_db), \
         patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis_instance):
        from candid.controllers.helpers import auth
        return auth


# ---------------------------------------------------------------------------
# Role hierarchy ranking
# ---------------------------------------------------------------------------

class TestRoleRanking:
    def test_guest_is_lowest(self):
        from candid.controllers.helpers.auth import _USER_ROLE_RANKING
        assert _USER_ROLE_RANKING["guest"] < _USER_ROLE_RANKING["normal"]

    def test_admin_is_highest(self):
        from candid.controllers.helpers.auth import _USER_ROLE_RANKING
        assert _USER_ROLE_RANKING["admin"] > _USER_ROLE_RANKING["moderator"]

    def test_ordering(self):
        from candid.controllers.helpers.auth import _USER_ROLE_RANKING
        assert (_USER_ROLE_RANKING["guest"]
                < _USER_ROLE_RANKING["normal"]
                < _USER_ROLE_RANKING["moderator"]
                < _USER_ROLE_RANKING["admin"])


# ---------------------------------------------------------------------------
# authorization()
# ---------------------------------------------------------------------------

class TestAuthorization:
    def test_no_token_returns_401(self):
        from candid.controllers.helpers.auth import authorization
        ok, err = authorization("normal", token_info=None)
        assert ok is False
        assert err.code == 401

    def test_user_not_found_returns_401(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)
        mock_redis = MagicMock()

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is False
            assert err.code == 401

    def test_insufficient_role_returns_403(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"user_type": "guest"})
        mock_redis = MagicMock()

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("admin", token_info={"sub": "user-123"})
            assert ok is False
            assert err.code == 403

    def test_sufficient_role_not_banned(self):
        mock_db = MagicMock()
        # First call: get_user_type returns "admin"
        # Second call: _check_ban_status DB lookup returns non-banned
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"user_type": "admin"},       # get_user_type
                {"status": "active"},          # _check_ban_status: user status
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)  # cache miss

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is True
            assert err is None

    def test_equal_role_is_sufficient(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"user_type": "normal"},
                {"status": "active"},
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is True


# ---------------------------------------------------------------------------
# _check_ban_status
# ---------------------------------------------------------------------------

class TestCheckBanStatus:
    def test_cached_not_banned(self):
        mock_db = MagicMock()
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value="not_banned")

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False
            assert err is None
            # DB should NOT have been called
            mock_db.execute_query.assert_not_called()

    def test_active_user_not_banned(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"status": "active"})
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)  # cache miss

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False
            # Should cache the result
            mock_redis.setex.assert_called()

    def test_permanently_banned(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},           # user status check
                {"action_end_time": None},       # permanent ban (no end time)
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is True
            assert err.code == 403

    def test_expired_temp_ban_restores_user(self):
        past_time = datetime.now(timezone.utc) - timedelta(hours=1)
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},
                {"action_end_time": past_time},  # expired temp ban
                None,  # UPDATE users SET status = 'active'
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False

    def test_active_temp_ban(self):
        future_time = datetime.now(timezone.utc) + timedelta(hours=24)
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},
                {"action_end_time": future_time},  # active temp ban
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is True

    def test_redis_failure_falls_through(self):
        """Redis failure should not prevent auth check."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"status": "active"})
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False


# ---------------------------------------------------------------------------
# invalidate_ban_cache
# ---------------------------------------------------------------------------

class TestInvalidateBanCache:
    def test_deletes_key(self):
        mock_redis = MagicMock()
        with patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import invalidate_ban_cache
            invalidate_ban_cache("user-123")
            mock_redis.delete.assert_called_once_with("ban_status:user-123")

    def test_redis_failure_silent(self):
        with patch("candid.controllers.helpers.auth.get_redis", side_effect=Exception("fail")):
            from candid.controllers.helpers.auth import invalidate_ban_cache
            # Should not raise
            invalidate_ban_cache("user-123")


# ---------------------------------------------------------------------------
# authorization_allow_banned
# ---------------------------------------------------------------------------

class TestAuthorizationAllowBanned:
    def test_banned_user_still_authorized(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"user_type": "normal"})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import authorization_allow_banned
            ok, err = authorization_allow_banned("normal", token_info={"sub": "user-123"})
            assert ok is True
            assert err is None

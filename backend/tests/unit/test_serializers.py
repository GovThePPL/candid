"""Unit tests for helpers/serializers.py — shared serialization utilities."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# get_user_card
# ---------------------------------------------------------------------------

class TestGetUserCard:
    def test_returns_user_model(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "id": "u-1", "username": "alice", "display_name": "Alice",
            "status": "active", "kudos_count": 5,
        })

        with patch("candid.controllers.helpers.serializers.db", mock_db):
            from candid.controllers.helpers.serializers import get_user_card
            user = get_user_card("u-1")
            assert user.id == "u-1"
            assert user.username == "alice"
            assert user.display_name == "Alice"
            assert user.status == "active"
            assert user.kudos_count == 5

    def test_returns_none_for_missing_user(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.serializers.db", mock_db):
            from candid.controllers.helpers.serializers import get_user_card
            assert get_user_card("nonexistent") is None

    def test_kudos_count_defaults_to_zero(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "id": "u-1", "username": "bob", "display_name": "Bob",
            "status": "active",
        })

        with patch("candid.controllers.helpers.serializers.db", mock_db):
            from candid.controllers.helpers.serializers import get_user_card
            user = get_user_card("u-1")
            assert user.kudos_count == 0


# ---------------------------------------------------------------------------
# build_creator_dict
# ---------------------------------------------------------------------------

class TestBuildCreatorDict:
    def test_full_creator_info(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        row = {
            "creator_user_id": "u-1",
            "creator_username": "alice",
            "creator_display_name": "Alice",
            "creator_avatar_icon_url": "https://example.com/icon.png",
            "creator_status": "active",
            "creator_trust_score": 0.85,
            "creator_kudos_count": 3,
        }
        result = build_creator_dict(row)
        assert result == {
            "id": "u-1",
            "username": "alice",
            "displayName": "Alice",
            "avatarIconUrl": "https://example.com/icon.png",
            "status": "active",
            "trustScore": 0.85,
            "kudosCount": 3,
        }

    def test_minimal_creator_only_id(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        row = {"creator_user_id": "u-2"}
        result = build_creator_dict(row)
        assert result == {"id": "u-2"}

    def test_no_creator_info(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        result = build_creator_dict({})
        assert result is None

    def test_null_trust_score(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        row = {
            "creator_user_id": "u-1",
            "creator_username": "alice",
            "creator_display_name": "Alice",
            "creator_status": "active",
            "creator_trust_score": None,
            "creator_kudos_count": 0,
        }
        result = build_creator_dict(row)
        assert result["trustScore"] is None

    def test_custom_prefix(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        row = {
            "author_user_id": "u-3",
            "author_display_name": "Charlie",
            "author_username": "charlie",
            "author_status": "active",
        }
        result = build_creator_dict(row, prefix="author_")
        assert result["id"] == "u-3"
        assert result["displayName"] == "Charlie"

    def test_missing_kudos_count_defaults_to_zero(self):
        from candid.controllers.helpers.serializers import build_creator_dict
        row = {
            "creator_user_id": "u-1",
            "creator_display_name": "Alice",
            "creator_username": "alice",
            "creator_status": "active",
        }
        result = build_creator_dict(row)
        assert result["kudosCount"] == 0


# ---------------------------------------------------------------------------
# clamp_pagination
# ---------------------------------------------------------------------------

class TestClampPagination:
    def test_defaults(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(None, None)
        assert limit == 20
        assert offset == 0

    def test_respects_max_limit(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(500, 0)
        assert limit == 100

    def test_zero_limit_uses_default(self):
        """0 is falsy, so ``limit or default_limit`` gives the default."""
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(0, 0)
        assert limit == 20

    def test_negative_limit_clamped_to_one(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(-5, 0)
        assert limit == 1

    def test_negative_offset_clamped_to_zero(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(10, -5)
        assert offset == 0

    def test_custom_defaults(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(None, None, default_limit=50, max_limit=200)
        assert limit == 50

    def test_custom_max(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(1000, 0, max_limit=500)
        assert limit == 500

    def test_valid_values_pass_through(self):
        from candid.controllers.helpers.serializers import clamp_pagination
        limit, offset = clamp_pagination(25, 50)
        assert limit == 25
        assert offset == 50

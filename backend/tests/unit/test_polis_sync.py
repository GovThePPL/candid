"""Unit tests for polis_sync.py — sync queue and vote mapping."""

import json
import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# generate_xid
# ---------------------------------------------------------------------------

class TestGenerateXid:
    def test_format(self):
        from candid.controllers.helpers.polis_sync import generate_xid
        xid = generate_xid("abc-123")
        assert xid == "candid:abc-123"

    def test_roundtrip(self):
        from candid.controllers.helpers.polis_sync import generate_xid
        user_id = "550e8400-e29b-41d4-a716-446655440000"
        xid = generate_xid(user_id)
        assert xid.replace("candid:", "") == user_id


# ---------------------------------------------------------------------------
# VOTE_MAPPING
# ---------------------------------------------------------------------------

class TestVoteMapping:
    def test_agree(self):
        from candid.controllers.helpers.polis_sync import VOTE_MAPPING
        assert VOTE_MAPPING["agree"] == -1

    def test_disagree(self):
        from candid.controllers.helpers.polis_sync import VOTE_MAPPING
        assert VOTE_MAPPING["disagree"] == 1

    def test_pass(self):
        from candid.controllers.helpers.polis_sync import VOTE_MAPPING
        assert VOTE_MAPPING["pass"] == 0


# ---------------------------------------------------------------------------
# queue_position_sync
# ---------------------------------------------------------------------------

class TestQueuePositionSync:
    def test_success(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_position_sync
            result = queue_position_sync("pos-1", "test statement", "cat-1", "loc-1", "user-1")
            assert result is True
            # Verify payload structure
            call_args = mock_db.execute_query.call_args
            payload = json.loads(call_args[0][1][1])
            assert payload["position_id"] == "pos-1"
            assert payload["statement"] == "test statement"
            assert payload["category_id"] == "cat-1"
            assert payload["location_id"] == "loc-1"
            assert payload["creator_user_id"] == "user-1"

    def test_polis_disabled(self):
        with patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=False)):
            from candid.controllers.helpers.polis_sync import queue_position_sync
            result = queue_position_sync("pos-1", "stmt", "cat", "loc", "user")
            assert result is False

    def test_db_error_returns_false(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=Exception("DB down"))

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_position_sync
            result = queue_position_sync("pos-1", "stmt", "cat", "loc", "user")
            assert result is False


# ---------------------------------------------------------------------------
# queue_vote_sync
# ---------------------------------------------------------------------------

class TestQueueVoteSync:
    def test_agree_vote(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "agree")
            assert result is True
            payload = json.loads(mock_db.execute_query.call_args[0][1][1])
            assert payload["polis_vote"] == -1

    def test_chat_response_skipped(self):
        with patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "chat")
            assert result is False

    def test_unknown_response_skipped(self):
        with patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "unknown_response")
            assert result is False

    def test_polis_disabled(self):
        with patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=False)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "agree")
            assert result is False


# ---------------------------------------------------------------------------
# get_active_window_dates
# ---------------------------------------------------------------------------

class TestActiveWindowDates:
    def test_returns_tuple(self):
        from candid.controllers.helpers.polis_sync import get_active_window_dates
        active_from, active_until = get_active_window_dates()
        assert active_from.day == 1  # First of month
        assert active_until > active_from

    def test_window_is_6_months(self):
        from candid.controllers.helpers.polis_sync import get_active_window_dates
        active_from, active_until = get_active_window_dates()
        diff_months = (active_until.year - active_from.year) * 12 + (active_until.month - active_from.month)
        assert diff_months == 6

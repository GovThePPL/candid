"""Unit tests for polis_sync.py — sync queue and vote mapping."""

import json
from datetime import date
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
        # First call: UPDATE (no match), second call: INSERT
        mock_db.execute_query = MagicMock(side_effect=[None, None])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "agree")
            assert result is True
            # INSERT call is the second one
            insert_payload = json.loads(mock_db.execute_query.call_args_list[1][0][1][1])
            assert insert_payload["polis_vote"] == -1

    def test_dedup_updates_existing(self):
        """When a pending entry exists for same position+user, update instead of insert."""
        mock_db = MagicMock()
        # First call: UPDATE returns a match (existing pending entry found)
        mock_db.execute_query = MagicMock(return_value={"id": "existing-id"})

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import queue_vote_sync
            result = queue_vote_sync("pos-1", "user-1", "disagree")
            assert result is True
            # Only one call (UPDATE), no INSERT
            assert mock_db.execute_query.call_count == 1
            update_sql = mock_db.execute_query.call_args[0][0]
            assert "UPDATE" in update_sql
            assert "RETURNING" in update_sql

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


# ---------------------------------------------------------------------------
# get_active_conversations
# ---------------------------------------------------------------------------

class TestGetActiveConversations:
    def test_with_category(self):
        mock_db = MagicMock()
        conv_rows = [
            {"id": "c-1", "polis_conversation_id": "p-1",
             "active_from": "2026-01-01", "active_until": "2026-07-01"},
        ]
        mock_db.execute_query = MagicMock(return_value=conv_rows)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import get_active_conversations
            result = get_active_conversations("loc-1", "cat-1")
            assert len(result) == 1
            sql = mock_db.execute_query.call_args[0][0]
            assert "category_id" in sql
            assert "category_id IS NULL" not in sql

    def test_without_category(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"id": "c-1", "polis_conversation_id": "p-1",
             "active_from": "2026-01-01", "active_until": "2026-07-01"},
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import get_active_conversations
            result = get_active_conversations("loc-1", None)
            assert len(result) == 1
            sql = mock_db.execute_query.call_args[0][0]
            assert "category_id IS NULL" in sql

    def test_empty_returns_empty_list(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import get_active_conversations
            result = get_active_conversations("loc-1", "cat-1")
            assert result == []


# ---------------------------------------------------------------------------
# get_oldest_active_conversation
# ---------------------------------------------------------------------------

class TestGetOldestActiveConversation:
    def test_returns_first(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"id": "oldest", "polis_conversation_id": "p-1"},
            {"id": "newer", "polis_conversation_id": "p-2"},
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import get_oldest_active_conversation
            result = get_oldest_active_conversation("loc-1", "cat-1")
            assert result["id"] == "oldest"

    def test_no_conversations_returns_none(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import get_oldest_active_conversation
            result = get_oldest_active_conversation("loc-1", "cat-1")
            assert result is None


# ---------------------------------------------------------------------------
# get_or_create_conversation
# ---------------------------------------------------------------------------

class TestGetOrCreateConversation:
    def test_returns_existing(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"polis_conversation_id": "existing-conv"})

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_sync import get_or_create_conversation
            result = get_or_create_conversation("loc-1", "cat-1", "USA", "Politics")
            assert result == "existing-conv"

    def test_creates_new_with_category(self):
        mock_db = MagicMock()
        # First call: no existing, second: INSERT returning row
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no existing
            {"polis_conversation_id": "new-conv"},  # INSERT RETURNING
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(return_value="new-conv")

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_sync.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_sync import get_or_create_conversation
            result = get_or_create_conversation("loc-1", "cat-1", "USA", "Politics")
            assert result == "new-conv"
            mock_client.create_conversation.assert_called_once()
            # Verify topic includes location and category
            topic = mock_client.create_conversation.call_args[0][0]
            assert "USA" in topic
            assert "Politics" in topic

    def test_creates_new_location_only(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no existing
            {"polis_conversation_id": "loc-conv"},  # INSERT RETURNING
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(return_value="loc-conv")

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_sync.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_sync import get_or_create_conversation
            result = get_or_create_conversation("loc-1", None, "USA")
            assert result == "loc-conv"
            topic = mock_client.create_conversation.call_args[0][0]
            assert "All Topics" in topic

    def test_polis_error_returns_none(self):
        from candid.controllers.helpers.polis_client import PolisError
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(side_effect=PolisError("API down"))

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_sync.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_sync import get_or_create_conversation
            result = get_or_create_conversation("loc-1", "cat-1", "USA", "Politics")
            assert result is None


# ---------------------------------------------------------------------------
# sync_position
# ---------------------------------------------------------------------------

class TestSyncPosition:
    def test_syncs_to_active_conversations(self):
        mock_db = MagicMock()
        # Calls: location lookup, category lookup, (get_active_conversations x2 handled by patches)
        mock_db.execute_query = MagicMock(side_effect=[
            {"name": "USA"},     # location lookup
            {"label": "Politics"},  # category lookup
            None,  # INSERT polis_comment (category conv)
            None,  # INSERT polis_comment (location conv)
        ])

        mock_client = MagicMock()
        mock_client.create_comment = MagicMock(return_value=42)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   side_effect=[
                       [{"polis_conversation_id": "cat-conv"}],  # category convs
                       [{"polis_conversation_id": "loc-conv"}],  # location convs
                   ]):
            from candid.controllers.helpers.polis_sync import sync_position
            payload = {
                "position_id": "pos-1", "statement": "test",
                "category_id": "cat-1", "location_id": "loc-1",
                "creator_user_id": "user-1",
            }
            success, error = sync_position(payload)
            assert success is True
            assert error is None
            assert mock_client.create_comment.call_count == 2

    def test_missing_location_returns_false(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # location not found
            {"label": "Politics"},
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import sync_position
            payload = {
                "position_id": "pos-1", "statement": "test",
                "category_id": "cat-1", "location_id": "loc-bad",
                "creator_user_id": "user-1",
            }
            success, error = sync_position(payload)
            assert success is False
            assert "not found" in error

    def test_no_conversations_creates_new(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"name": "USA"},     # location lookup
            {"label": "Politics"},  # category lookup
            None,  # INSERT from get_or_create
            None,  # INSERT polis_comment
            None,  # INSERT from get_or_create (location)
            None,  # INSERT polis_comment
        ])

        mock_client = MagicMock()
        mock_client.create_comment = MagicMock(return_value=1)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   return_value=[]), \
             patch("candid.controllers.helpers.polis_sync.get_or_create_conversation",
                   return_value="new-conv"):
            from candid.controllers.helpers.polis_sync import sync_position
            payload = {
                "position_id": "pos-1", "statement": "test",
                "category_id": "cat-1", "location_id": "loc-1",
                "creator_user_id": "user-1",
            }
            success, error = sync_position(payload)
            assert success is True


# ---------------------------------------------------------------------------
# sync_vote
# ---------------------------------------------------------------------------

class TestSyncVote:
    def test_syncs_across_conversations(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"polis_conversation_id": "conv-1", "polis_comment_tid": 10},
            {"polis_conversation_id": "conv-2", "polis_comment_tid": 20},
        ])

        mock_client = MagicMock()
        mock_client.submit_vote = MagicMock(return_value=True)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client):
            from candid.controllers.helpers.polis_sync import sync_vote
            payload = {"position_id": "pos-1", "user_id": "user-1", "polis_vote": -1}
            success, error = sync_vote(payload)
            assert success is True
            assert error is None
            assert mock_client.submit_vote.call_count == 2

    def test_position_not_yet_synced(self):
        mock_db = MagicMock()
        # First query: no polis_comment rows; second: position exists
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no polis_comment mappings
            {"1": 1},  # position exists
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", MagicMock()):
            from candid.controllers.helpers.polis_sync import sync_vote
            payload = {"position_id": "pos-1", "user_id": "user-1", "polis_vote": -1}
            success, error = sync_vote(payload)
            assert success is False
            assert "not yet synced" in error

    def test_deleted_position_skipped(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no polis_comment mappings
            None,  # position doesn't exist
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", MagicMock()):
            from candid.controllers.helpers.polis_sync import sync_vote
            payload = {"position_id": "pos-deleted", "user_id": "user-1", "polis_vote": -1}
            success, error = sync_vote(payload)
            assert success is True
            assert error is None

    def test_partial_sync_reports_errors(self):
        from candid.controllers.helpers.polis_client import PolisError
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"polis_conversation_id": "conv-1", "polis_comment_tid": 10},
            {"polis_conversation_id": "conv-2", "polis_comment_tid": 20},
        ])

        mock_client = MagicMock()
        mock_client.submit_vote = MagicMock(side_effect=[
            True,  # conv-1 succeeds
            PolisError("failed"),  # conv-2 fails
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_client", return_value=mock_client):
            from candid.controllers.helpers.polis_sync import sync_vote
            payload = {"position_id": "pos-1", "user_id": "user-1", "polis_vote": -1}
            success, error = sync_vote(payload)
            assert success is True
            assert "Partial" in error


# ---------------------------------------------------------------------------
# sync_adopted_position
# ---------------------------------------------------------------------------

class TestSyncAdoptedPosition:
    def test_queues_position(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"statement": "test", "category_id": "cat-1", "location_id": "loc-1"},  # position lookup
            None,  # queue INSERT
        ])

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.config", MagicMock(POLIS_ENABLED=True)):
            from candid.controllers.helpers.polis_sync import sync_adopted_position
            result = sync_adopted_position("adopter-1", "pos-1")
            assert result is True

    def test_missing_position_returns_false(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import sync_adopted_position
            result = sync_adopted_position("user-1", "pos-nonexistent")
            assert result is False


# ---------------------------------------------------------------------------
# _lookup_conversation_for_month
# ---------------------------------------------------------------------------

class TestLookupConversationForMonth:
    def test_with_category(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"polis_conversation_id": "conv-1"})

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import _lookup_conversation_for_month
            result = _lookup_conversation_for_month("loc-1", "cat-1", date(2026, 2, 1))
            assert result["polis_conversation_id"] == "conv-1"
            sql = mock_db.execute_query.call_args[0][0]
            assert "category_id = %s" in sql
            assert "category_id IS NULL" not in sql

    def test_without_category(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"polis_conversation_id": "conv-2"})

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import _lookup_conversation_for_month
            result = _lookup_conversation_for_month("loc-1", None, date(2026, 2, 1))
            assert result["polis_conversation_id"] == "conv-2"
            sql = mock_db.execute_query.call_args[0][0]
            assert "category_id IS NULL" in sql

    def test_not_found(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import _lookup_conversation_for_month
            result = _lookup_conversation_for_month("loc-1", "cat-1", date(2026, 2, 1))
            assert result is None


# ---------------------------------------------------------------------------
# _store_polis_comment
# ---------------------------------------------------------------------------

class TestStorePolisComment:
    def test_inserts_with_on_conflict(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db):
            from candid.controllers.helpers.polis_sync import _store_polis_comment
            _store_polis_comment("pos-1", "conv-1", 42)
            sql = mock_db.execute_query.call_args[0][0]
            assert "INSERT INTO polis_comment" in sql
            assert "ON CONFLICT" in sql
            args = mock_db.execute_query.call_args[0][1]
            assert args[1] == "pos-1"
            assert args[2] == "conv-1"
            assert args[3] == 42


# ---------------------------------------------------------------------------
# _sync_position_to_conv_group
# ---------------------------------------------------------------------------

class TestSyncPositionToConvGroup:
    def test_syncs_to_existing_conversations(self):
        from candid.controllers.helpers.polis_client import PolisError
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)
        mock_client = MagicMock()
        mock_client.create_comment = MagicMock(return_value=42)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   return_value=[{"polis_conversation_id": "conv-1"}, {"polis_conversation_id": "conv-2"}]):
            from candid.controllers.helpers.polis_sync import _sync_position_to_conv_group
            errors = []
            count = _sync_position_to_conv_group(
                mock_client, "pos-1", "test stmt", "candid:user-1",
                "loc-1", "cat-1", "USA", "Politics", errors
            )
            assert count == 2
            assert len(errors) == 0
            assert mock_client.create_comment.call_count == 2

    def test_creates_conversation_when_none_exist(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)
        mock_client = MagicMock()
        mock_client.create_comment = MagicMock(return_value=1)

        with patch("candid.controllers.helpers.polis_sync.db", mock_db), \
             patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   return_value=[]), \
             patch("candid.controllers.helpers.polis_sync.get_or_create_conversation",
                   return_value="new-conv"):
            from candid.controllers.helpers.polis_sync import _sync_position_to_conv_group
            errors = []
            count = _sync_position_to_conv_group(
                mock_client, "pos-1", "test stmt", "candid:user-1",
                "loc-1", "cat-1", "USA", "Politics", errors
            )
            assert count == 1
            assert len(errors) == 0

    def test_collects_errors(self):
        from candid.controllers.helpers.polis_client import PolisError
        mock_client = MagicMock()
        mock_client.create_comment = MagicMock(side_effect=PolisError("API error"))

        with patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   return_value=[{"polis_conversation_id": "conv-1"}]):
            from candid.controllers.helpers.polis_sync import _sync_position_to_conv_group
            errors = []
            count = _sync_position_to_conv_group(
                mock_client, "pos-1", "test", "candid:user-1",
                "loc-1", "cat-1", "USA", "Politics", errors
            )
            assert count == 0
            assert len(errors) == 1
            assert "conv-1" in errors[0]

    def test_no_conv_created_returns_zero(self):
        with patch("candid.controllers.helpers.polis_sync.get_active_conversations",
                   return_value=[]), \
             patch("candid.controllers.helpers.polis_sync.get_or_create_conversation",
                   return_value=None):
            from candid.controllers.helpers.polis_sync import _sync_position_to_conv_group
            errors = []
            count = _sync_position_to_conv_group(
                MagicMock(), "pos-1", "test", "candid:user-1",
                "loc-1", None, "USA", None, errors
            )
            assert count == 0

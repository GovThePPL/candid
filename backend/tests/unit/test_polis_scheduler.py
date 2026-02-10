"""Unit tests for polis_scheduler.py — conversation lifecycle management."""

import pytest
from unittest.mock import patch, MagicMock, call
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# create_monthly_conversations
# ---------------------------------------------------------------------------

class TestCreateMonthlyConversations:
    def test_no_active_combos_returns_zero(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.config", MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert result["created"] == 0
            assert result["errors"] == []

    def test_skips_existing_conversations(self):
        mock_db = MagicMock()
        combo = {"location_id": "loc-1", "category_id": "cat-1",
                 "location_name": "USA", "category_name": "Politics"}

        # First call: active combos, second: existing check returns row
        mock_db.execute_query = MagicMock(side_effect=[
            [combo],        # active_combos query
            {"id": "existing"},  # deduplication check → already exists
            [],             # active_locations query
        ])

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert result["created"] == 0

    def test_creates_category_and_location_conversations(self):
        mock_db = MagicMock()
        combo = {"location_id": "loc-1", "category_id": "cat-1",
                 "location_name": "USA", "category_name": "Politics"}
        location = {"location_id": "loc-1", "location_name": "USA"}

        mock_db.execute_query = MagicMock(side_effect=[
            [combo],    # active_combos
            None,       # dedup check for category conv → not found
            None,       # INSERT category conv
            [location], # active_locations
            None,       # dedup check for location conv → not found
            None,       # INSERT location conv
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(return_value="polis-conv-123")

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_scheduler.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert result["created"] == 2
            assert result["errors"] == []
            assert mock_client.create_conversation.call_count == 2

    def test_collects_polis_errors(self):
        from candid.controllers.helpers.polis_client import PolisError
        mock_db = MagicMock()
        combo = {"location_id": "loc-1", "category_id": "cat-1",
                 "location_name": "USA", "category_name": "Politics"}

        mock_db.execute_query = MagicMock(side_effect=[
            [combo],    # active_combos
            None,       # dedup check → not found
            # No INSERT because create_conversation raises
            [],         # active_locations (empty)
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(side_effect=PolisError("API down"))

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_scheduler.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert result["created"] == 0
            assert len(result["errors"]) == 1
            assert "USA/Politics" in result["errors"][0]

    def test_returns_date_strings(self):
        """When conversations are created, result includes date strings."""
        mock_db = MagicMock()
        combo = {"location_id": "loc-1", "category_id": "cat-1",
                 "location_name": "USA", "category_name": "Politics"}

        mock_db.execute_query = MagicMock(side_effect=[
            [combo],    # active_combos
            None,       # dedup check → not found
            None,       # INSERT
            [],         # active_locations (empty)
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(return_value="polis-conv-1")

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_scheduler.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert "active_from" in result
            assert "active_until" in result
            # Dates should be parseable strings
            date.fromisoformat(result["active_from"])
            date.fromisoformat(result["active_until"])

    def test_null_polis_conv_id_not_counted(self):
        """If Polis returns None for conversation ID, don't count as created."""
        mock_db = MagicMock()
        combo = {"location_id": "loc-1", "category_id": "cat-1",
                 "location_name": "USA", "category_name": "Politics"}

        mock_db.execute_query = MagicMock(side_effect=[
            [combo],    # active_combos
            None,       # dedup check → not found
            [],         # active_locations
        ])

        mock_client = MagicMock()
        mock_client.create_conversation = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db), \
             patch("candid.controllers.helpers.polis_scheduler.get_client", return_value=mock_client), \
             patch("candid.controllers.helpers.polis_scheduler.config",
                   MagicMock(POLIS_CONVERSATION_WINDOW_MONTHS=6)):
            from candid.controllers.helpers.polis_scheduler import create_monthly_conversations
            result = create_monthly_conversations()
            assert result["created"] == 0


# ---------------------------------------------------------------------------
# expire_old_conversations
# ---------------------------------------------------------------------------

class TestExpireOldConversations:
    def test_expires_past_due(self):
        mock_db = MagicMock()
        expired_rows = [
            {"id": "conv-1", "polis_conversation_id": "p-1",
             "location_id": "loc-1", "category_id": "cat-1"},
            {"id": "conv-2", "polis_conversation_id": "p-2",
             "location_id": "loc-1", "category_id": "cat-2"},
        ]
        mock_db.execute_query = MagicMock(return_value=expired_rows)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import expire_old_conversations
            result = expire_old_conversations()
            assert result["expired_count"] == 2
            assert len(result["conversations"]) == 2

    def test_no_expired_returns_zero(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import expire_old_conversations
            result = expire_old_conversations()
            assert result["expired_count"] == 0
            assert result["conversations"] == []

    def test_query_uses_today(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import expire_old_conversations
            expire_old_conversations()
            sql = mock_db.execute_query.call_args[0][0]
            assert "active_until" in sql
            assert "expired" in sql


# ---------------------------------------------------------------------------
# cleanup_expired_data
# ---------------------------------------------------------------------------

class TestCleanupExpiredData:
    def test_no_expired_conversations(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import cleanup_expired_data
            result = cleanup_expired_data()
            assert result["cleaned_comments"] == 0
            assert result["cleaned_participants"] == 0

    def test_deletes_comments_and_participants(self):
        mock_db = MagicMock()
        expired_convs = [
            {"polis_conversation_id": "p-1"},
            {"polis_conversation_id": "p-2"},
        ]

        mock_db.execute_query = MagicMock(side_effect=[
            expired_convs,  # SELECT expired conversations
            None,           # DELETE polis_comment
            None,           # DELETE polis_participant
        ])

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import cleanup_expired_data
            result = cleanup_expired_data(days_after_expiry=30)
            assert result["cleaned_conversations"] == 2
            # Verify both DELETE queries were issued
            assert mock_db.execute_query.call_count == 3

    def test_uses_cutoff_date(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import cleanup_expired_data
            result = cleanup_expired_data(days_after_expiry=60)
            # Verify cutoff was passed to query
            call_args = mock_db.execute_query.call_args
            cutoff = call_args[0][1][0]
            expected_cutoff = date.today() - timedelta(days=60)
            assert cutoff == expected_cutoff


# ---------------------------------------------------------------------------
# get_conversation_stats
# ---------------------------------------------------------------------------

class TestGetConversationStats:
    def test_aggregation(self):
        mock_db = MagicMock()
        stats_rows = [
            {"status": "active", "conversation_type": "category", "count": 10},
            {"status": "expired", "conversation_type": "location_all", "count": 5},
        ]
        active_count = {"locations": 3, "categories": 7}

        mock_db.execute_query = MagicMock(side_effect=[stats_rows, active_count])

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import get_conversation_stats
            result = get_conversation_stats()
            assert len(result["by_status_and_type"]) == 2
            assert result["active_locations"] == 3
            assert result["active_categories"] == 7

    def test_empty_db(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[None, None])

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import get_conversation_stats
            result = get_conversation_stats()
            assert result["by_status_and_type"] == []
            assert result["active_locations"] == 0
            assert result["active_categories"] == 0


# ---------------------------------------------------------------------------
# get_conversations_for_location
# ---------------------------------------------------------------------------

class TestGetConversationsForLocation:
    def test_returns_conversations(self):
        mock_db = MagicMock()
        conv_rows = [
            {"id": "c-1", "polis_conversation_id": "p-1",
             "conversation_type": "category", "active_from": date(2026, 1, 1),
             "active_until": date(2026, 7, 1), "status": "active",
             "category_name": "Politics"},
        ]
        mock_db.execute_query = MagicMock(return_value=conv_rows)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import get_conversations_for_location
            result = get_conversations_for_location("loc-1")
            assert len(result) == 1
            assert result[0]["polis_conversation_id"] == "p-1"

    def test_empty_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import get_conversations_for_location
            result = get_conversations_for_location("loc-nonexistent")
            assert result == []

    def test_passes_location_id_to_query(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_scheduler.db", mock_db):
            from candid.controllers.helpers.polis_scheduler import get_conversations_for_location
            get_conversations_for_location("loc-42")
            params = mock_db.execute_query.call_args[0][1]
            assert params == ("loc-42",)

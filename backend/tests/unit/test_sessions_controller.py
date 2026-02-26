"""Unit tests for sessions_controller — _get_voting_round_row helper."""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

pytestmark = pytest.mark.unit


@pytest.fixture
def mock_db():
    """Create a mock db instance."""
    with patch("candid.controllers.sessions_controller.db") as mdb:
        yield mdb


class TestGetVotingRoundRow:
    """Tests for _get_voting_round_row helper."""

    def _import_helper(self):
        from candid.controllers.sessions_controller import _get_voting_round_row
        return _get_voting_round_row

    def test_without_round_type_returns_latest(self, mock_db):
        """When round_type is None, queries with ORDER BY created_time DESC."""
        helper = self._import_helper()
        fake_row = {
            "id": "vr-1", "session_id": "s-1", "round_type": "policy_selection",
            "status": "proposals_open", "ballot_size": 7, "winner_count": 1,
            "created_time": datetime(2026, 1, 1), "results_json": None,
        }
        mock_db.execute_query.return_value = fake_row

        result = helper("s-1")

        assert result == fake_row
        call_args = mock_db.execute_query.call_args
        sql = call_args[0][0]
        params = call_args[0][1]
        assert "ORDER BY created_time DESC" in sql
        assert params == ("s-1",)
        assert call_args[1] == {"fetchone": True}

    def test_with_round_type_filters_by_type(self, mock_db):
        """When round_type is specified, queries with WHERE round_type clause."""
        helper = self._import_helper()
        fake_row = {
            "id": "vr-2", "session_id": "s-1", "round_type": "issue_selection",
            "status": "voting_closed", "ballot_size": 5, "winner_count": 1,
            "created_time": datetime(2026, 1, 1), "results_json": None,
        }
        mock_db.execute_query.return_value = fake_row

        result = helper("s-1", round_type="issue_selection")

        assert result == fake_row
        call_args = mock_db.execute_query.call_args
        sql = call_args[0][0]
        params = call_args[0][1]
        assert "round_type = %s" in sql
        assert "ORDER BY" not in sql
        assert params == ("s-1", "issue_selection")

    def test_returns_none_when_not_found(self, mock_db):
        """Returns None when no voting round matches."""
        helper = self._import_helper()
        mock_db.execute_query.return_value = None

        result = helper("s-1", round_type="issue_selection")
        assert result is None

    def test_session_id_converted_to_string(self, mock_db):
        """Session ID is converted to string in the query."""
        helper = self._import_helper()
        mock_db.execute_query.return_value = None

        helper(123)

        call_args = mock_db.execute_query.call_args
        params = call_args[0][1]
        assert params == ("123",)

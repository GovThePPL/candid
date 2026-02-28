"""Unit tests for audit.py — structured audit logging."""

import json
import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


class TestLogAction:
    """Tests for log_action()."""

    @patch("candid.controllers.helpers.audit.db")
    def test_inserts_full_row(self, mock_db):
        from candid.controllers.helpers.audit import log_action

        log_action(
            actor_id="actor-1",
            action="ban_user",
            target_type="user",
            target_id="target-1",
            location_id="loc-1",
            session_id="sess-1",
            details={"reason": "spam"},
        )

        mock_db.execute_query.assert_called_once()
        args = mock_db.execute_query.call_args
        sql = args[0][0]
        params = args[0][1]

        assert "INSERT INTO audit_log" in sql
        assert params[0] == "actor-1"
        assert params[1] == "ban_user"
        assert params[2] == "user"
        assert params[3] == "target-1"
        assert params[4] == "loc-1"
        assert params[5] == "sess-1"
        assert json.loads(params[6]) == {"reason": "spam"}

    @patch("candid.controllers.helpers.audit.db")
    def test_minimal_params(self, mock_db):
        from candid.controllers.helpers.audit import log_action

        log_action(actor_id="a", action="remove_post", target_type="post")

        params = mock_db.execute_query.call_args[0][1]
        assert params[0] == "a"
        assert params[1] == "remove_post"
        assert params[2] == "post"
        assert params[3] is None  # target_id
        assert params[4] is None  # location_id
        assert params[5] is None  # session_id
        assert params[6] is None  # details

    @patch("candid.controllers.helpers.audit.db")
    def test_details_none_stays_none(self, mock_db):
        from candid.controllers.helpers.audit import log_action

        log_action(actor_id="a", action="x", target_type="y", details=None)

        params = mock_db.execute_query.call_args[0][1]
        assert params[6] is None

    @patch("candid.controllers.helpers.audit.db")
    def test_details_serialized_as_json(self, mock_db):
        from candid.controllers.helpers.audit import log_action

        log_action(actor_id="a", action="x", target_type="y", details={"k": [1, 2]})

        params = mock_db.execute_query.call_args[0][1]
        assert json.loads(params[6]) == {"k": [1, 2]}

    @patch("candid.controllers.helpers.audit.logger")
    @patch("candid.controllers.helpers.audit.db")
    def test_db_error_swallowed(self, mock_db, mock_logger):
        """Audit failures must never break the main request."""
        from candid.controllers.helpers.audit import log_action

        mock_db.execute_query.side_effect = Exception("connection lost")

        # Should not raise
        log_action(actor_id="a", action="x", target_type="y")

        mock_logger.exception.assert_called_once()
        assert "audit log" in mock_logger.exception.call_args[0][0].lower()

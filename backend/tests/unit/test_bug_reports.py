"""Unit tests for bug_reports_controller.py — validation, cleanup, insert logic."""

import json
import importlib.util
import os
import sys
import pytest
from unittest.mock import MagicMock

pytestmark = pytest.mark.unit

# ---------------------------------------------------------------------------
# Load controller module directly from file (bypasses connexion import chain)
# ---------------------------------------------------------------------------

_CONTROLLER_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "server", "controllers", "bug_reports_controller.py"
)
_CONTROLLER_PATH = os.path.abspath(_CONTROLLER_PATH)


def _load_controller(mock_db, auth_return=(True, None)):
    """Load bug_reports_controller from file with mocked dependencies."""
    mock_auth_fn = MagicMock(return_value=auth_return)

    # Create mock modules that the controller imports from
    mock_candid_controllers = MagicMock()
    mock_candid_controllers.db = mock_db

    mock_auth_module = MagicMock()
    mock_auth_module.authorization_allow_banned = mock_auth_fn

    # Set up module stubs in sys.modules temporarily
    saved = {}
    stubs = {
        "connexion": MagicMock(),
        "flask": MagicMock(),
        "candid.controllers": mock_candid_controllers,
        "candid.controllers.helpers": MagicMock(),
        "candid.controllers.helpers.auth": mock_auth_module,
    }
    for name, mock in stubs.items():
        saved[name] = sys.modules.get(name)
        sys.modules[name] = mock

    try:
        spec = importlib.util.spec_from_file_location(
            "bug_reports_controller", _CONTROLLER_PATH
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Wire up the mocks that the controller bound at import time
        mod.db = mock_db
        mod.authorization_allow_banned = mock_auth_fn
        return mod
    finally:
        # Restore original modules
        for name, orig in saved.items():
            if orig is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = orig


# ---------------------------------------------------------------------------
# Authentication / Authorization
# ---------------------------------------------------------------------------

class TestCreateBugReportAuth:
    def test_no_token_returns_401(self):
        from candid.models.error_model import ErrorModel
        err = ErrorModel(401, "Unauthorized")
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db, auth_return=(False, err))

        result, code = ctrl.create_bug_report(
            {"source": "user", "description": "test"}, token_info=None
        )
        assert code == 401

    def test_insufficient_role_returns_403(self):
        from candid.models.error_model import ErrorModel
        err = ErrorModel(403, "Forbidden")
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db, auth_return=(False, err))

        result, code = ctrl.create_bug_report(
            {"source": "user", "description": "test"},
            token_info={"sub": "user-1"},
        )
        assert code == 403


# ---------------------------------------------------------------------------
# Validation — source=user
# ---------------------------------------------------------------------------

class TestUserReportValidation:
    def test_missing_description_returns_400(self):
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "user"}, token_info={"sub": "user-1"}
        )
        assert code == 400

    def test_empty_description_returns_400(self):
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "user", "description": "   "},
            token_info={"sub": "user-1"},
        )
        assert code == 400

    def test_valid_user_report(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "user", "description": "Bug on settings page"},
            token_info={"sub": "user-1"},
        )
        assert code == 201
        assert result.source == "user"
        assert result.description == "Bug on settings page"
        assert result.id == "abc-123"


# ---------------------------------------------------------------------------
# Validation — source=auto/crash
# ---------------------------------------------------------------------------

class TestAutoReportValidation:
    def test_auto_missing_metrics_returns_400(self):
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "auto"}, token_info={"sub": "user-1"}
        )
        assert code == 400

    def test_crash_missing_metrics_returns_400(self):
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "crash"}, token_info={"sub": "user-1"}
        )
        assert code == 400

    def test_valid_auto_report(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "def-456", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        metrics = {"errors": [{"message": "TypeError", "count": 3}]}
        result, code = ctrl.create_bug_report(
            {"source": "auto", "errorMetrics": metrics},
            token_info={"sub": "user-1"},
        )
        assert code == 201
        assert result.source == "auto"
        assert result.error_metrics == metrics

    def test_valid_crash_report_with_context(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "ghi-789", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        metrics = {"crashStack": "Error at line 42"}
        context = {"screen": "cards", "appVersion": "1.0.0"}
        result, code = ctrl.create_bug_report(
            {"source": "crash", "errorMetrics": metrics, "clientContext": context},
            token_info={"sub": "user-1"},
        )
        assert code == 201
        assert result.client_context == context


# ---------------------------------------------------------------------------
# Invalid source
# ---------------------------------------------------------------------------

class TestInvalidSource:
    def test_invalid_source_returns_400(self):
        mock_db = MagicMock()
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "invalid", "description": "test"},
            token_info={"sub": "user-1"},
        )
        assert code == 400
        assert "Invalid source" in result.message


# ---------------------------------------------------------------------------
# Cleanup logic
# ---------------------------------------------------------------------------

class TestCleanupLogic:
    def test_30_day_cleanup_runs_on_every_report(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        ctrl.create_bug_report(
            {"source": "user", "description": "test"},
            token_info={"sub": "user-1"},
        )

        # First DB call should be the 30-day cleanup
        first_call_sql = mock_db.execute_query.call_args_list[0][0][0]
        assert "30 days" in first_call_sql
        assert "DELETE" in first_call_sql

    def test_per_user_cap_runs_for_auto_reports(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        ctrl.create_bug_report(
            {"source": "auto", "errorMetrics": {"errors": []}},
            token_info={"sub": "user-1"},
        )

        # Should have 3 DB calls: 30-day cleanup, per-user cap, insert
        assert mock_db.execute_query.call_count == 3
        cap_call_sql = mock_db.execute_query.call_args_list[1][0][0]
        assert "OFFSET 49" in cap_call_sql

    def test_per_user_cap_skipped_for_user_reports(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        ctrl.create_bug_report(
            {"source": "user", "description": "manual report"},
            token_info={"sub": "user-1"},
        )

        # Should have 2 DB calls: 30-day cleanup, insert (no per-user cap)
        assert mock_db.execute_query.call_count == 2


# ---------------------------------------------------------------------------
# Description trimming
# ---------------------------------------------------------------------------

class TestDescriptionTrimming:
    def test_description_is_trimmed(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"source": "user", "description": "  trimmed  "},
            token_info={"sub": "user-1"},
        )
        assert code == 201
        assert result.description == "trimmed"

        # Check the INSERT call passes trimmed value
        insert_call = mock_db.execute_query.call_args_list[-1]
        insert_params = insert_call[0][1]
        assert insert_params[0] == "user-1"   # user_id
        assert insert_params[1] == "trimmed"   # description


# ---------------------------------------------------------------------------
# JSON serialization of metrics/context
# ---------------------------------------------------------------------------

class TestJsonSerialization:
    def test_error_metrics_serialized_as_json(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        metrics = {"errors": [{"msg": "fail"}]}
        ctrl.create_bug_report(
            {"source": "auto", "errorMetrics": metrics},
            token_info={"sub": "user-1"},
        )

        insert_call = mock_db.execute_query.call_args_list[-1]
        insert_params = insert_call[0][1]
        # error_metrics param should be JSON string
        assert insert_params[2] == json.dumps(metrics)

    def test_client_context_serialized_as_json(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        context = {"screen": "home", "version": "2.0"}
        ctrl.create_bug_report(
            {"source": "auto", "errorMetrics": {"x": 1}, "clientContext": context},
            token_info={"sub": "user-1"},
        )

        insert_call = mock_db.execute_query.call_args_list[-1]
        insert_params = insert_call[0][1]
        # client_context param should be JSON string
        assert insert_params[3] == json.dumps(context)

    def test_none_metrics_passes_none(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        ctrl.create_bug_report(
            {"source": "user", "description": "no metrics"},
            token_info={"sub": "user-1"},
        )

        insert_call = mock_db.execute_query.call_args_list[-1]
        insert_params = insert_call[0][1]
        assert insert_params[2] is None  # error_metrics
        assert insert_params[3] is None  # client_context


# ---------------------------------------------------------------------------
# Default source
# ---------------------------------------------------------------------------

class TestDefaultSource:
    def test_defaults_to_user_source(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            return_value={"id": "abc-123", "created_time": "2026-01-01T00:00:00.000Z"}
        )
        ctrl = _load_controller(mock_db)

        result, code = ctrl.create_bug_report(
            {"description": "no source specified"},
            token_info={"sub": "user-1"},
        )
        assert code == 201
        assert result.source == "user"

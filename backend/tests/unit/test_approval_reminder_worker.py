"""Unit tests for approval_reminder_worker.py — auto-approve reminder notifications."""

import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, call

pytestmark = pytest.mark.unit

WORKER_MOD = "candid.controllers.helpers.approval_reminder_worker"
ADMIN_HELPERS = "candid.controllers.helpers.admin"

# Test UUIDs
ADMIN_USER = "aaa00000-0000-0000-0000-000000000001"
PEER_ADMIN = "aaa00000-0000-0000-0000-000000000099"
FACILITATOR_USER = "ccc00000-0000-0000-0000-000000000003"
TARGET_USER = "eee00000-0000-0000-0000-000000000005"

OREGON = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"
PORTLAND = "d3c4b5a6-f7e8-9012-cdef-123456789012"
HEALTHCARE_CAT = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"

REQUEST_ID_1 = "rrr00000-0000-0000-0000-000000000001"
REQUEST_ID_2 = "rrr00000-0000-0000-0000-000000000002"


@pytest.fixture(autouse=True)
def _clear_caches():
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


def _make_role_request(req_id=REQUEST_ID_1, auto_approve_hours=20):
    """Create a fake role_change_request row approaching auto-approve."""
    return {
        'id': req_id,
        'action': 'assign',
        'target_user_id': TARGET_USER,
        'role': 'moderator',
        'location_id': OREGON,
        'session_id': None,
        'requested_by': FACILITATOR_USER,
        'requester_authority_location_id': OREGON,
        'auto_approve_at': datetime.now(timezone.utc) + timedelta(hours=auto_approve_hours),
        'reminder_sent_at': None,
        'status': 'pending',
    }


def _make_rule_request(req_id=REQUEST_ID_2, auto_approve_hours=18):
    """Create a fake rule_change_request row approaching auto-approve."""
    return {
        'id': req_id,
        'action': 'create',
        'rule_id': None,
        'proposed_rule': {'title': 'No Hate Speech', 'text': 'Description'},
        'requested_by': ADMIN_USER,
        'requester_authority_location_id': OREGON,
        'auto_approve_at': datetime.now(timezone.utc) + timedelta(hours=auto_approve_hours),
        'reminder_sent_at': None,
        'status': 'pending',
    }


class TestApprovalReminderWorker:
    """Tests for ApprovalReminderWorker._check_and_send_reminders()."""

    def test_sends_role_request_reminder(self):
        """Sends reminder for role request within 24h of auto-approve."""
        mock_db = MagicMock()
        role_req = _make_role_request()

        # DB returns: role requests, location name, then update reminder_sent_at
        # Then: no rule requests
        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # pending role requests within 24h
            {"name": "Oregon"},  # location name lookup
            None,  # UPDATE reminder_sent_at
            [],  # pending rule requests (empty)
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_called_once()
            args = mock_remind.call_args
            assert args[0][0] == [PEER_ADMIN]
            assert "moderator at Oregon" in args[0][1]
            assert args[0][2] == 'role_change'

    def test_sends_rule_request_reminder(self):
        """Sends reminder for rule request within 24h of auto-approve."""
        mock_db = MagicMock()
        rule_req = _make_rule_request()

        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no pending role requests
            [rule_req],  # pending rule requests within 24h
            None,  # UPDATE reminder_sent_at
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_rule_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_called_once()
            args = mock_remind.call_args
            assert args[0][0] == [PEER_ADMIN]
            assert "No Hate Speech" in args[0][1]
            assert args[0][2] == 'rule_change'

    def test_skips_already_reminded_requests(self):
        """Requests with reminder_sent_at set are excluded by the SQL query.

        The worker's SQL WHERE clause includes 'AND reminder_sent_at IS NULL',
        so already-reminded requests won't be returned by the DB.
        """
        mock_db = MagicMock()
        # DB returns empty because already-reminded requests are filtered out
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no role requests (already reminded are filtered)
            [],  # no rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_not_called()

    def test_skips_requests_without_peers(self):
        """Requests where find_approval_peer returns None are skipped."""
        mock_db = MagicMock()
        role_req = _make_role_request()

        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # pending role request
            [],  # no rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_approval_peer", return_value=None), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_not_called()

    def test_handles_both_role_and_rule_requests(self):
        """Processes both role and rule requests in one check cycle."""
        mock_db = MagicMock()
        role_req = _make_role_request()
        rule_req = _make_rule_request()

        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # pending role requests
            {"name": "Oregon"},  # location name
            None,  # UPDATE role reminder_sent_at
            [rule_req],  # pending rule requests
            None,  # UPDATE rule reminder_sent_at
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.find_rule_approval_peer", return_value=[ADMIN_USER]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            assert mock_remind.call_count == 2

    def test_empty_result_set(self):
        """No pending requests means no reminders sent."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no role requests
            [],  # no rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_not_called()

    def test_none_result_set(self):
        """None return from DB is handled gracefully."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # None role requests
            None,  # None rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_not_called()

    def test_rule_request_with_string_proposed_rule(self):
        """Handles proposed_rule stored as JSON string."""
        mock_db = MagicMock()
        rule_req = _make_rule_request()
        rule_req['proposed_rule'] = json.dumps({'title': 'Civility Rule'})

        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no role requests
            [rule_req],  # rule request with string proposed_rule
            None,  # UPDATE reminder_sent_at
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_rule_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder") as mock_remind:
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            mock_remind.assert_called_once()
            assert "Civility Rule" in mock_remind.call_args[0][1]

    def test_updates_reminder_sent_at(self):
        """After sending reminder, updates reminder_sent_at in DB."""
        mock_db = MagicMock()
        role_req = _make_role_request()

        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # pending role requests
            {"name": "Oregon"},  # location name
            None,  # UPDATE reminder_sent_at
            [],  # no rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder"):
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            # Third DB call should be the UPDATE for reminder_sent_at
            update_call = mock_db.execute_query.call_args_list[2]
            sql = update_call[0][0]
            assert "UPDATE role_change_request" in sql
            assert "reminder_sent_at" in sql
            assert REQUEST_ID_1 in update_call[0][1]

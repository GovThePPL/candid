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

        # DB returns: atomic UPDATE...RETURNING for role requests, location name
        # Then: empty atomic UPDATE...RETURNING for rule requests
        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # UPDATE...RETURNING claimed role requests
            {"name": "Oregon"},  # location name lookup
            [],  # UPDATE...RETURNING rule requests (empty)
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
            [rule_req],  # UPDATE...RETURNING claimed rule requests
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

        The atomic UPDATE...RETURNING includes 'AND reminder_sent_at IS NULL',
        so already-reminded requests won't be returned.
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
            [role_req],  # pending role request (claimed atomically)
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
            [role_req],  # UPDATE...RETURNING role requests
            {"name": "Oregon"},  # location name
            [rule_req],  # UPDATE...RETURNING rule requests
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

    def test_atomic_claim_uses_for_update_skip_locked(self):
        """Verify the query uses FOR UPDATE SKIP LOCKED for replica safety."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # role requests
            [],  # rule requests
        ])

        with patch(f"{WORKER_MOD}.db", mock_db):
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            # Both queries should use UPDATE...RETURNING with FOR UPDATE SKIP LOCKED
            for call_obj in mock_db.execute_query.call_args_list:
                sql = call_obj[0][0]
                assert "UPDATE" in sql
                assert "RETURNING" in sql
                assert "FOR UPDATE SKIP LOCKED" in sql

    def test_no_separate_update_after_claim(self):
        """The atomic claim sets reminder_sent_at, so no separate UPDATE is needed."""
        mock_db = MagicMock()
        role_req = _make_role_request()

        mock_db.execute_query = MagicMock(side_effect=[
            [role_req],  # UPDATE...RETURNING role requests (already sets reminder_sent_at)
            {"name": "Oregon"},  # location name lookup
            [],  # UPDATE...RETURNING rule requests (empty)
        ])

        with patch(f"{WORKER_MOD}.db", mock_db), \
             patch(f"{WORKER_MOD}.find_approval_peer", return_value=[PEER_ADMIN]), \
             patch(f"{WORKER_MOD}.send_auto_approve_reminder"):
            from candid.controllers.helpers.approval_reminder_worker import \
                ApprovalReminderWorker
            worker = ApprovalReminderWorker(check_interval=60)
            worker._check_and_send_reminders()

            # Should be exactly 3 calls: atomic role claim, location lookup, atomic rule claim
            # No separate UPDATE call for reminder_sent_at
            assert mock_db.execute_query.call_count == 3
            calls = mock_db.execute_query.call_args_list
            # First call: atomic UPDATE...RETURNING for role requests
            assert "UPDATE role_change_request" in calls[0][0][0]
            assert "RETURNING" in calls[0][0][0]
            # Second call: location name lookup
            assert "SELECT name FROM location" in calls[1][0][0]
            # Third call: atomic UPDATE...RETURNING for rule requests
            assert "UPDATE rule_change_request" in calls[2][0][0]
            assert "RETURNING" in calls[2][0][0]

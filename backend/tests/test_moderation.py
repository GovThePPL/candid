"""Tests for moderation endpoints: report position/chat, moderation queue, moderator actions, appeal responses."""

import pytest
import requests
from conftest import (
    BASE_URL,
    POSITION1_ID,
    POSITION2_ID,
    NONEXISTENT_UUID,
    RULE_VIOLENCE_ID,
    RULE_SPAM_ID,
    CHAT_LOG_1_ID,  # Normal1 <-> Normal3
    CHAT_LOG_2_ID,  # Normal4 <-> Normal5
    NORMAL1_ID,
    NORMAL2_ID,
    NORMAL3_ID,
    ADMIN1_ID,
    login,
    auth_header,
    db_execute,
)

MODERATION_URL = f"{BASE_URL}/moderation"


class TestReportPosition:
    """POST /positions/{positionId}/report"""

    @pytest.mark.mutation
    def test_report_position_success(self, normal_headers):
        """Normal user can report a position."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
            "comment": "Test report comment",
        }
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "position"
        assert body["targetId"] == POSITION1_ID
        assert body["ruleId"] == RULE_VIOLENCE_ID
        assert body["status"] == "pending"
        assert body["submitterComment"] == "Test report comment"
        assert "id" in body

    @pytest.mark.mutation
    def test_report_position_without_comment(self, normal_headers):
        """Can report a position without a comment."""
        payload = {
            "ruleId": RULE_SPAM_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION2_ID}/report",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "position"
        assert body["status"] == "pending"

    def test_report_nonexistent_position(self, normal_headers):
        """Reporting a nonexistent position returns 400."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/positions/{NONEXISTENT_UUID}/report",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 400

    def test_report_with_invalid_rule(self, normal_headers):
        """Reporting with a nonexistent rule returns 400."""
        payload = {
            "ruleId": NONEXISTENT_UUID,
        }
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 400

    def test_report_position_unauthenticated(self):
        """Unauthenticated request returns 401."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            json=payload,
        )
        assert resp.status_code == 401


class TestReportChat:
    """POST /chats/{chatId}/report"""

    @pytest.fixture
    def normal1_headers(self):
        """Get headers for normal1 (participant in CHAT_LOG_1)."""
        token = login("normal1")
        return auth_header(token)

    @pytest.fixture
    def normal3_headers(self):
        """Get headers for normal3 (participant in CHAT_LOG_1)."""
        token = login("normal3")
        return auth_header(token)

    @pytest.fixture
    def normal2_headers(self):
        """Get headers for normal2 (not a participant in CHAT_LOG_1)."""
        token = login("normal2")
        return auth_header(token)

    @pytest.mark.mutation
    def test_report_chat_by_initiator(self, normal1_headers):
        """Chat initiator can report a chat."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
            "comment": "Inappropriate behavior in chat",
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=normal1_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "chat_log"
        assert body["targetId"] == CHAT_LOG_1_ID
        assert body["ruleId"] == RULE_VIOLENCE_ID
        assert body["status"] == "pending"

    @pytest.mark.mutation
    def test_report_chat_by_position_holder(self, normal3_headers):
        """Position holder can report a chat."""
        payload = {
            "ruleId": RULE_SPAM_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=normal3_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "chat_log"

    def test_report_chat_non_participant(self, normal2_headers):
        """Non-participant cannot report a chat (403)."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=normal2_headers,
            json=payload,
        )
        assert resp.status_code == 403

    def test_report_nonexistent_chat(self, normal1_headers):
        """Reporting a nonexistent chat returns 400."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{NONEXISTENT_UUID}/report",
            headers=normal1_headers,
            json=payload,
        )
        assert resp.status_code == 400

    def test_report_chat_unauthenticated(self):
        """Unauthenticated request returns 401."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            json=payload,
        )
        assert resp.status_code == 401


class TestModerationQueue:
    """GET /moderation/queue"""

    def test_moderator_can_access_queue(self, moderator_headers):
        """Moderator can access the moderation queue."""
        resp = requests.get(
            f"{MODERATION_URL}/queue",
            headers=moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        # Each item should have type and data fields
        for item in body:
            assert "type" in item
            assert item["type"] in ["report", "appeal"]
            assert "data" in item

    def test_admin_can_access_queue(self, admin_headers):
        """Admin can access the moderation queue."""
        resp = requests.get(
            f"{MODERATION_URL}/queue",
            headers=admin_headers,
        )
        assert resp.status_code == 200

    def test_normal_user_cannot_access_queue(self, normal_headers):
        """Normal user cannot access the moderation queue (403)."""
        resp = requests.get(
            f"{MODERATION_URL}/queue",
            headers=normal_headers,
        )
        assert resp.status_code == 403

    def test_unauthenticated_cannot_access_queue(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(f"{MODERATION_URL}/queue")
        assert resp.status_code == 401


class TestTakeModeratorAction:
    """POST /moderation/reports/{reportId}/response"""

    @pytest.fixture(autouse=True)
    def _restore_users_after_action(self):
        """Moderation actions may ban position creators. Restore after each test."""
        yield
        # Restore admin1 (creator of POSITION1_ID) and moderator1 (creator of POSITION2_ID)
        db_execute(
            "UPDATE users SET status = 'active' WHERE id IN (%s, %s)",
            (ADMIN1_ID, "a443c4ff-86ab-4751-aec9-d9b23d7acb9c"),
        )
        # Clear ban-related moderation_action records that could affect future tests
        import redis
        try:
            r = redis.from_url("redis://localhost:6379", encoding="utf-8", decode_responses=True)
            for key in r.keys("ban_status:*"):
                r.delete(key)
            r.close()
        except Exception:
            pass

    @pytest.fixture
    def pending_report_id(self, normal_headers):
        """Create a fresh report to use for action tests."""
        # Create a new report using a different position to avoid conflicts
        payload = {
            "ruleId": RULE_SPAM_ID,
            "comment": "Test for moderator action",
        }
        # Use POSITION2_ID to create a fresh report
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION2_ID}/report",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    @pytest.mark.mutation
    def test_dismiss_report(self, moderator_headers, pending_report_id):
        """Moderator can dismiss a report."""
        payload = {
            "modResponse": "dismiss",
            "modResponseText": "This does not violate our rules.",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{pending_report_id}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["reportId"] == pending_report_id
        assert body["modResponse"] == "dismiss"
        assert "responder" in body
        assert body["responder"]["username"] == "moderator1"

    @pytest.mark.mutation
    def test_mark_spurious(self, moderator_headers, normal_headers):
        """Moderator can mark a report as spurious."""
        # Create a new report first
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=report_payload,
        )
        assert report_resp.status_code == 201
        report_id = report_resp.json()["id"]

        # Mark it as spurious
        action_payload = {
            "modResponse": "mark_spurious",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=action_payload,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["modResponse"] == "mark_spurious"

    @pytest.mark.mutation
    def test_take_action_with_warning(self, moderator_headers, normal_headers):
        """Moderator can take action with a warning."""
        # Create a new report
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=report_payload,
        )
        assert report_resp.status_code == 201
        report_id = report_resp.json()["id"]

        # Take action with warning
        action_payload = {
            "modResponse": "take_action",
            "modResponseText": "User has been warned.",
            "actions": [
                {
                    "userClass": "submitter",
                    "action": "warning",
                }
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=action_payload,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["modResponse"] == "take_action"

    @pytest.mark.mutation
    def test_take_action_with_temporary_ban(self, moderator_headers, normal_headers):
        """Moderator can take action with a temporary ban."""
        # Create a new report
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=report_payload,
        )
        assert report_resp.status_code == 201
        report_id = report_resp.json()["id"]

        # Take action with temporary ban
        action_payload = {
            "modResponse": "take_action",
            "modResponseText": "User has been temporarily banned.",
            "actions": [
                {
                    "userClass": "submitter",
                    "action": "temporary_ban",
                    "duration": 7,
                }
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=action_payload,
        )
        assert resp.status_code == 200

    def test_take_action_requires_actions_array(self, moderator_headers, pending_report_id):
        """Taking action without specifying actions returns 400."""
        payload = {
            "modResponse": "take_action",
            "modResponseText": "Taking action without actions",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{pending_report_id}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 400

    def test_temp_ban_requires_duration(self, moderator_headers, normal_headers):
        """Temporary ban without duration returns 400."""
        # Create a new report
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION1_ID}/report",
            headers=normal_headers,
            json=report_payload,
        )
        assert report_resp.status_code == 201
        report_id = report_resp.json()["id"]

        action_payload = {
            "modResponse": "take_action",
            "actions": [
                {
                    "userClass": "submitter",
                    "action": "temporary_ban",
                    # Missing duration
                }
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=action_payload,
        )
        assert resp.status_code == 400

    def test_action_on_nonexistent_report(self, moderator_headers):
        """Action on nonexistent report returns 400."""
        payload = {
            "modResponse": "dismiss",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{NONEXISTENT_UUID}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 400

    def test_normal_user_cannot_take_action(self, normal_headers, pending_report_id):
        """Normal user cannot take moderator action (403)."""
        payload = {
            "modResponse": "dismiss",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{pending_report_id}/response",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 403

    def test_unauthenticated_cannot_take_action(self):
        """Unauthenticated request returns 401."""
        payload = {
            "modResponse": "dismiss",
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{NONEXISTENT_UUID}/response",
            json=payload,
        )
        assert resp.status_code == 401


class TestRespondToAppeal:
    """POST /moderation/appeals/{appealId}/response

    Note: These tests require creating a full chain: report -> mod_action -> appeal.
    Since we don't have seed data for appeals, we test authorization and error cases.
    """

    def test_normal_user_cannot_respond_to_appeal(self, normal_headers):
        """Normal user cannot respond to appeals (403)."""
        payload = {
            "response": "approve",
            "responseText": "Appeal approved.",
        }
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{NONEXISTENT_UUID}/response",
            headers=normal_headers,
            json=payload,
        )
        assert resp.status_code == 403

    def test_unauthenticated_cannot_respond_to_appeal(self):
        """Unauthenticated request returns 401."""
        payload = {
            "response": "approve",
            "responseText": "Appeal approved.",
        }
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{NONEXISTENT_UUID}/response",
            json=payload,
        )
        assert resp.status_code == 401

    def test_respond_to_nonexistent_appeal(self, moderator_headers):
        """Responding to nonexistent appeal returns 400."""
        payload = {
            "response": "deny",
            "responseText": "Appeal denied.",
        }
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{NONEXISTENT_UUID}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 400


class TestGetRules:
    """GET /rules"""

    def test_get_rules_success(self, normal_headers):
        """Authenticated user can get the list of rules."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0
        for rule in body:
            assert "id" in rule
            assert "title" in rule
            assert "text" in rule

    def test_get_rules_includes_known_rules(self, normal_headers):
        """Rules list includes known seed data rules."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        rule_ids = {r["id"] for r in resp.json()}
        assert RULE_VIOLENCE_ID in rule_ids
        assert RULE_SPAM_ID in rule_ids

    def test_get_rules_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(f"{BASE_URL}/rules")
        assert resp.status_code == 401

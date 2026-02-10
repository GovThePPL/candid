"""Tests for moderation endpoints: report position/chat, moderation queue, moderator actions, appeal responses."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    POSITION1_ID,
    POSITION2_ID,
    POSITION3_ID,
    NONEXISTENT_UUID,
    RULE_VIOLENCE_ID,
    RULE_SPAM_ID,
    RULE_SEXUAL_ID,
    RULE_NOT_POLITICAL_ID,
    CHAT_LOG_1_ID,  # Normal1 <-> Normal3
    CHAT_LOG_2_ID,  # Normal4 <-> Normal5
    NORMAL1_ID,
    NORMAL2_ID,
    NORMAL3_ID,
    ADMIN1_ID,
    MODERATOR1_ID,
    MODERATOR2_ID,
    login,
    auth_header,
    db_execute,
    db_query,
    db_query_one,
)

MODERATION_URL = f"{BASE_URL}/moderation"


class TestReportPosition:
    """POST /positions/{positionId}/report"""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up pending reports after each test for idempotency."""
        yield
        _cleanup_pending_reports()

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



class TestReportChat:
    """POST /chats/{chatId}/report

    CHAT_LOG_1_ID participants: Normal1 (initiator) and Normal3 (position holder).
    """

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up pending reports after each test for idempotency."""
        yield
        _cleanup_pending_reports()

    @pytest.fixture
    def chat_initiator_headers(self):
        """Get headers for normal1 (initiator/participant in CHAT_LOG_1)."""
        token = login("normal1")
        return auth_header(token)

    @pytest.fixture
    def chat_position_holder_headers(self):
        """Get headers for normal3 (position holder/participant in CHAT_LOG_1)."""
        token = login("normal3")
        return auth_header(token)

    @pytest.fixture
    def non_participant_headers(self):
        """Get headers for normal2 (not a participant in CHAT_LOG_1)."""
        token = login("normal2")
        return auth_header(token)

    @pytest.mark.mutation
    def test_report_chat_by_initiator(self, chat_initiator_headers):
        """Chat initiator can report a chat."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
            "comment": "Inappropriate behavior in chat",
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=chat_initiator_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "chat_log"
        assert body["targetId"] == CHAT_LOG_1_ID
        assert body["ruleId"] == RULE_VIOLENCE_ID
        assert body["status"] == "pending"

    @pytest.mark.mutation
    def test_report_chat_by_position_holder(self, chat_position_holder_headers):
        """Position holder can report a chat."""
        payload = {
            "ruleId": RULE_SPAM_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=chat_position_holder_headers,
            json=payload,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["reportType"] == "chat_log"

    def test_report_chat_non_participant(self, non_participant_headers):
        """Non-participant cannot report a chat (403)."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{CHAT_LOG_1_ID}/report",
            headers=non_participant_headers,
            json=payload,
        )
        assert resp.status_code == 403

    def test_report_nonexistent_chat(self, chat_initiator_headers):
        """Reporting a nonexistent chat returns 400."""
        payload = {
            "ruleId": RULE_VIOLENCE_ID,
        }
        resp = requests.post(
            f"{BASE_URL}/chats/{NONEXISTENT_UUID}/report",
            headers=chat_initiator_headers,
            json=payload,
        )
        assert resp.status_code == 400



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
            assert item["type"] in ["report", "appeal", "admin_response_notification"]
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



class TestTakeModeratorAction:
    """POST /moderation/reports/{reportId}/response"""

    @pytest.fixture(autouse=True)
    def _restore_users_after_action(self):
        """Moderation actions may ban position creators. Restore after each test."""
        yield
        # Restore users who may have been banned (admin1, moderator1, normal1)
        db_execute(
            "UPDATE users SET status = 'active' WHERE id IN (%s, %s, %s)",
            (ADMIN1_ID, MODERATOR1_ID, NORMAL1_ID),
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
        # Create a new report using a normal user's position so moderator can act on it
        payload = {
            "ruleId": RULE_SPAM_ID,
            "comment": "Test for moderator action",
        }
        # Use POSITION3_ID (normal1's position) to create a fresh report
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION3_ID}/report",
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
        # Create a new report against a normal user's position
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION3_ID}/report",
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
        # Create a new report against a normal user's position
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION3_ID}/report",
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
        # Create a new report against a normal user's position
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION3_ID}/report",
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
        # Create a new report against a normal user's position
        report_payload = {"ruleId": RULE_VIOLENCE_ID}
        report_resp = requests.post(
            f"{BASE_URL}/positions/{POSITION3_ID}/report",
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



# ====================================================================
# Moderation Queue Enhancements Tests
# ====================================================================

def _cleanup_pending_reports():
    """Clean up all pending reports to avoid test interference."""
    db_execute("DELETE FROM mod_action_target WHERE mod_action_class_id IN (SELECT id FROM mod_action_class WHERE mod_action_id IN (SELECT id FROM mod_action WHERE report_id IN (SELECT id FROM report WHERE status = 'pending')))")
    db_execute("DELETE FROM mod_action_class WHERE mod_action_id IN (SELECT id FROM mod_action WHERE report_id IN (SELECT id FROM report WHERE status = 'pending'))")
    db_execute("DELETE FROM mod_action WHERE report_id IN (SELECT id FROM report WHERE status = 'pending')")
    db_execute("DELETE FROM report WHERE status = 'pending'")


def _cleanup_all_test_reports():
    """Clean up all reports created during tests."""
    db_execute("DELETE FROM mod_action_target")
    db_execute("DELETE FROM mod_action_class")
    db_execute("DELETE FROM mod_action")
    db_execute("DELETE FROM report")


def _create_report(headers, position_id, rule_id=None, comment=None):
    """Helper to create a report and return the report ID."""
    payload = {"ruleId": rule_id or RULE_VIOLENCE_ID}
    if comment:
        payload["comment"] = comment
    resp = requests.post(
        f"{BASE_URL}/positions/{position_id}/report",
        headers=headers,
        json=payload,
    )
    assert resp.status_code == 201, f"Failed to create report: {resp.text}"
    return resp.json()["id"]


def _create_chat_report(headers, chat_id, rule_id=None, comment=None):
    """Helper to create a chat report and return the report ID."""
    payload = {"ruleId": rule_id or RULE_VIOLENCE_ID}
    if comment:
        payload["comment"] = comment
    resp = requests.post(
        f"{BASE_URL}/chats/{chat_id}/report",
        headers=headers,
        json=payload,
    )
    assert resp.status_code == 201, f"Failed to create chat report: {resp.text}"
    return resp.json()["id"]


class TestRoleBasedRouting:
    """Tests for role-based moderation queue routing."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up reports before and after each test."""
        _cleanup_pending_reports()
        yield
        _cleanup_pending_reports()

    def test_moderator_can_see_reports_against_normal_users(self, moderator_headers):
        """Moderators can still see reports against normal users (baseline)."""
        # POSITION3_ID is created by normal1 — report it as normal2
        normal2_headers = auth_header(login("normal2"))
        report_id = _create_report(normal2_headers, POSITION3_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200
        report_ids = [item["data"]["id"] for item in resp.json() if item["type"] == "report"]
        assert report_id in report_ids

    def test_moderator_cannot_see_reports_against_moderators(self, normal_headers, moderator_headers):
        """Moderators cannot see reports against moderator-created positions."""
        # POSITION2_ID is created by moderator1 — report it as normal user
        report_id = _create_report(normal_headers, POSITION2_ID)

        # moderator1 should NOT see this report (it's against a moderator)
        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200
        report_ids = [item["data"]["id"] for item in resp.json() if item["type"] == "report"]
        assert report_id not in report_ids

    def test_admin_sees_reports_against_moderators(self, normal_headers, admin_headers):
        """Admins CAN see reports against moderator-created positions."""
        # POSITION2_ID is created by moderator1
        report_id = _create_report(normal_headers, POSITION2_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=admin_headers)
        assert resp.status_code == 200
        report_ids = [item["data"]["id"] for item in resp.json() if item["type"] == "report"]
        assert report_id in report_ids

    def test_admin_cannot_see_reports_against_self(self, admin_headers):
        """Admins cannot see reports against their own positions."""
        # POSITION1_ID is created by admin1 — use a normal user to report
        normal2_token = login("normal2")
        normal2_headers = auth_header(normal2_token)
        report_id = _create_report(normal2_headers, POSITION1_ID)

        # admin1 should NOT see this (report is against admin1's position)
        resp = requests.get(f"{MODERATION_URL}/queue", headers=admin_headers)
        assert resp.status_code == 200
        report_ids = [item["data"]["id"] for item in resp.json() if item["type"] == "report"]
        assert report_id not in report_ids

    @pytest.mark.mutation
    def test_moderator_cannot_action_report_against_moderator(self, normal_headers, moderator_headers):
        """Moderator cannot take action on reports against another moderator."""
        report_id = _create_report(normal_headers, POSITION2_ID)

        payload = {"modResponse": "dismiss"}
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 403

    @pytest.mark.mutation
    def test_admin_can_action_report_against_moderator(self, normal_headers, admin_headers):
        """Admin CAN take action on reports against a moderator."""
        report_id = _create_report(normal_headers, POSITION2_ID)

        payload = {"modResponse": "dismiss"}
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=admin_headers,
            json=payload,
        )
        assert resp.status_code == 200
        assert resp.json()["modResponse"] == "dismiss"


class TestQueueClaiming:
    """Tests for queue claiming to prevent double-review."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up reports before and after each test."""
        _cleanup_pending_reports()
        yield
        _cleanup_pending_reports()
        # Clear ban cache
        import redis
        try:
            r = redis.from_url("redis://localhost:6379", encoding="utf-8", decode_responses=True)
            for key in r.keys("ban_status:*"):
                r.delete(key)
            r.close()
        except Exception:
            pass

    @pytest.fixture
    def moderator2_headers(self):
        """Get headers for moderator2."""
        token = login("moderator2")
        return auth_header(token)

    @pytest.mark.mutation
    def test_claim_report_on_open(self, normal_headers, moderator_headers):
        """Moderator can claim a report."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "claimed"
        assert body["claimedBy"] == MODERATOR1_ID

    @pytest.mark.mutation
    def test_claimed_report_hidden_from_other_mods(self, normal_headers, moderator_headers, moderator2_headers):
        """After claiming, other moderators don't see the report."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        # Moderator1 claims it
        claim_resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )
        assert claim_resp.status_code == 200

        # Moderator2's queue should NOT contain it
        queue_resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator2_headers)
        assert queue_resp.status_code == 200
        report_ids = [item["data"]["id"] for item in queue_resp.json() if item["type"] == "report"]
        assert report_id not in report_ids

    @pytest.mark.mutation
    def test_claimed_report_visible_to_claimer(self, normal_headers, moderator_headers):
        """Claimer's queue still shows their claimed items."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        # Moderator1 claims it
        requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )

        # Moderator1's queue SHOULD still contain it
        queue_resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert queue_resp.status_code == 200
        report_ids = [item["data"]["id"] for item in queue_resp.json() if item["type"] == "report"]
        assert report_id in report_ids

    @pytest.mark.mutation
    def test_claim_already_claimed_returns_409(self, normal_headers, moderator_headers, moderator2_headers):
        """Another mod trying to claim same item returns 409."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        # Moderator1 claims
        requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )

        # Moderator2 tries to claim → 409
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator2_headers,
        )
        assert resp.status_code == 409

    @pytest.mark.mutation
    def test_claim_expires_after_timeout(self, normal_headers, moderator_headers, moderator2_headers):
        """After claim expires, other mods can see and claim the report."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        # Moderator1 claims
        requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )

        # Manually set claimed_at to 16 minutes ago
        db_execute(
            "UPDATE report SET claimed_at = NOW() - INTERVAL '16 minutes' WHERE id = %s",
            (report_id,)
        )

        # Moderator2's queue SHOULD now show it
        queue_resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator2_headers)
        assert queue_resp.status_code == 200
        report_ids = [item["data"]["id"] for item in queue_resp.json() if item["type"] == "report"]
        assert report_id in report_ids

    @pytest.mark.mutation
    def test_release_claim(self, normal_headers, moderator_headers, moderator2_headers):
        """Releasing a claim makes it visible to others again."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        # Claim then release
        requests.post(
            f"{MODERATION_URL}/reports/{report_id}/claim",
            headers=moderator_headers,
        )
        release_resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/release",
            headers=moderator_headers,
        )
        assert release_resp.status_code == 200
        assert release_resp.json()["status"] == "released"

        # Moderator2 should now see it
        queue_resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator2_headers)
        assert queue_resp.status_code == 200
        report_ids = [item["data"]["id"] for item in queue_resp.json() if item["type"] == "report"]
        assert report_id in report_ids

    @pytest.mark.mutation
    def test_action_auto_claims_if_unclaimed(self, normal_headers, moderator_headers):
        """Taking action without explicit claim succeeds and auto-claims."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        payload = {"modResponse": "dismiss"}
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=payload,
        )
        assert resp.status_code == 200

        # Verify it was claimed by the acting moderator
        row = db_query_one("SELECT claimed_by_user_id FROM report WHERE id = %s", (report_id,))
        assert str(row["claimed_by_user_id"]) == MODERATOR1_ID


class TestChatLogInQueue:
    """Tests for chat message embedding in moderation queue."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up reports."""
        _cleanup_pending_reports()
        yield
        _cleanup_pending_reports()

    @pytest.mark.mutation
    def test_chat_report_includes_messages(self, moderator_headers):
        """Queue item for chat_log report has targetContent.messages[]."""
        normal1_headers = auth_header(login("normal1"))
        report_id = _create_chat_report(normal1_headers, CHAT_LOG_1_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200

        # Find the chat report
        chat_reports = [
            item for item in resp.json()
            if item["type"] == "report" and item["data"]["id"] == report_id
        ]
        assert len(chat_reports) == 1
        target_content = chat_reports[0]["data"]["targetContent"]
        assert target_content["type"] == "chat_log"
        assert "messages" in target_content
        assert isinstance(target_content["messages"], list)
        assert len(target_content["messages"]) > 0

    @pytest.mark.mutation
    def test_chat_report_includes_participants(self, moderator_headers):
        """Chat report targetContent has both participant user info."""
        normal1_headers = auth_header(login("normal1"))
        _create_chat_report(normal1_headers, CHAT_LOG_1_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200

        chat_reports = [
            item for item in resp.json()
            if item["type"] == "report" and item["data"]["reportType"] == "chat_log"
        ]
        assert len(chat_reports) >= 1
        target_content = chat_reports[0]["data"]["targetContent"]
        assert "participants" in target_content
        assert len(target_content["participants"]) == 2

    @pytest.mark.mutation
    def test_position_report_does_not_include_messages(self, normal_headers, moderator_headers):
        """Position report targetContent has NO messages field."""
        report_id = _create_report(normal_headers, POSITION3_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200

        pos_reports = [
            item for item in resp.json()
            if item["type"] == "report" and item["data"]["id"] == report_id
        ]
        assert len(pos_reports) == 1
        target_content = pos_reports[0]["data"]["targetContent"]
        assert target_content["type"] == "position"
        assert "messages" not in target_content


class TestChatReportActions:
    """Tests for reporter/reported user classes in chat reports.

    CHAT_LOG_1_ID participants: Normal1 (initiator/reporter) and Normal3 (position holder/reported).
    """

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up all test reports."""
        _cleanup_all_test_reports()
        yield
        _cleanup_all_test_reports()
        # Restore users that may have been banned
        db_execute(
            "UPDATE users SET status = 'active' WHERE id IN (%s, %s, %s, %s)",
            (NORMAL1_ID, NORMAL3_ID, ADMIN1_ID, MODERATOR1_ID),
        )
        import redis
        try:
            r = redis.from_url("redis://localhost:6379", encoding="utf-8", decode_responses=True)
            for key in r.keys("ban_status:*"):
                r.delete(key)
            r.close()
        except Exception:
            pass

    @pytest.mark.mutation
    def test_chat_action_with_reported_class(self, admin_headers):
        """Actions can target 'reported' user class in chat reports."""
        # Normal1 reports chat where Normal1 and Normal3 are participants
        normal1_headers = auth_header(login("normal1"))
        report_id = _create_chat_report(normal1_headers, CHAT_LOG_1_ID)

        # Admin takes action targeting 'reported' with warning
        payload = {
            "modResponse": "take_action",
            "modResponseText": "Warning the reported user.",
            "actions": [
                {"userClass": "reported", "action": "warning"}
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=admin_headers,
            json=payload,
        )
        assert resp.status_code == 200

        # Verify the 'reported' user (Normal3, who is NOT the reporter Normal1) was targeted
        mod_action_id = resp.json()["id"]
        target_row = db_query_one("""
            SELECT mat.user_id FROM mod_action_target mat
            JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
            WHERE mac.mod_action_id = %s AND mac.class = 'reported'
        """, (mod_action_id,))
        assert target_row is not None
        assert str(target_row["user_id"]) == NORMAL3_ID

    @pytest.mark.mutation
    def test_chat_action_with_reporter_class(self, admin_headers):
        """Actions can target 'reporter' user class (the person who filed the report)."""
        # Normal1 reports the chat
        normal1_headers = auth_header(login("normal1"))
        report_id = _create_chat_report(normal1_headers, CHAT_LOG_1_ID)

        # Admin takes action targeting 'reporter' (e.g., spurious report penalty)
        payload = {
            "modResponse": "take_action",
            "modResponseText": "Warning the reporter for spurious report.",
            "actions": [
                {"userClass": "reporter", "action": "warning"}
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=admin_headers,
            json=payload,
        )
        assert resp.status_code == 200

        mod_action_id = resp.json()["id"]
        target_row = db_query_one("""
            SELECT mat.user_id FROM mod_action_target mat
            JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
            WHERE mac.mod_action_id = %s AND mac.class = 'reporter'
        """, (mod_action_id,))
        assert target_row is not None
        assert str(target_row["user_id"]) == NORMAL1_ID


class TestDefaultActionsAndGuidelines:
    """Tests for severity, default actions, and sentencing guidelines on rules."""

    def test_rules_include_severity(self, normal_headers):
        """GET /rules → each rule has 'severity' field (integer 1-5)."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        rules = resp.json()
        for rule in rules:
            assert "severity" in rule, f"Rule {rule['title']} missing severity"
            assert isinstance(rule["severity"], int)
            assert 1 <= rule["severity"] <= 5

    def test_rules_include_default_actions(self, normal_headers):
        """GET /rules → each rule has 'defaultActions' array."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        rules = resp.json()
        for rule in rules:
            assert "defaultActions" in rule, f"Rule {rule['title']} missing defaultActions"
            assert isinstance(rule["defaultActions"], list)

    def test_rules_include_sentencing_guidelines(self, normal_headers):
        """GET /rules → each rule has 'sentencingGuidelines' string."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        rules = resp.json()
        for rule in rules:
            assert "sentencingGuidelines" in rule, f"Rule {rule['title']} missing sentencingGuidelines"
            assert isinstance(rule["sentencingGuidelines"], str)
            assert len(rule["sentencingGuidelines"]) > 0

    def test_default_actions_structure(self, normal_headers):
        """defaultActions entries have userClass, action, and optionally duration."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        rules = resp.json()
        for rule in rules:
            for da in rule.get("defaultActions", []):
                assert "userClass" in da
                assert "action" in da

    def test_violence_rule_severity_is_highest(self, normal_headers):
        """Violence rule has severity 5 (highest)."""
        resp = requests.get(f"{BASE_URL}/rules", headers=normal_headers)
        assert resp.status_code == 200
        violence_rule = next(r for r in resp.json() if r["id"] == RULE_VIOLENCE_ID)
        assert violence_rule["severity"] == 5

    @pytest.mark.mutation
    def test_queue_report_includes_rule_defaults(self, normal_headers, moderator_headers):
        """Queue report's rule object has defaultActions and sentencingGuidelines."""
        _cleanup_pending_reports()
        report_id = _create_report(normal_headers, POSITION3_ID)

        resp = requests.get(f"{MODERATION_URL}/queue", headers=moderator_headers)
        assert resp.status_code == 200

        reports = [item for item in resp.json() if item["type"] == "report" and item["data"]["id"] == report_id]
        assert len(reports) == 1
        rule = reports[0]["data"]["rule"]
        assert "defaultActions" in rule
        assert "sentencingGuidelines" in rule
        assert "severity" in rule
        # Clean up
        _cleanup_pending_reports()


class TestDismissAdminResponseNotification:
    """POST /moderation/notifications/{appealId}/dismiss-admin-response"""

    def test_normal_user_forbidden(self, normal_headers):
        """Normal user cannot dismiss admin response notifications (403)."""
        resp = requests.post(
            f"{MODERATION_URL}/notifications/{NONEXISTENT_UUID}/dismiss-admin-response",
            headers=normal_headers,
        )
        assert resp.status_code == 403

    def test_moderator_dismiss_nonexistent_ok(self, moderator_headers):
        """Dismissing a nonexistent appeal notification is a silent no-op (200)."""
        resp = requests.post(
            f"{MODERATION_URL}/notifications/{NONEXISTENT_UUID}/dismiss-admin-response",
            headers=moderator_headers,
        )
        assert resp.status_code == 200


class TestAppealResponseLifecycle:
    """Full appeal lifecycle: report → mod action → ban → appeal → response (B7).

    Uses admin_headers to create/resolve; moderator_headers for initial action.
    """

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Full cleanup of moderation chain."""
        _cleanup_all_test_reports()
        yield
        _cleanup_all_test_reports()
        # Restore users that may have been banned
        db_execute(
            "UPDATE users SET status = 'active' WHERE id IN (%s, %s, %s)",
            (NORMAL1_ID, NORMAL3_ID, ADMIN1_ID),
        )
        import redis as _redis
        try:
            r = _redis.from_url("redis://localhost:6379", encoding="utf-8", decode_responses=True)
            for key in r.keys("ban_status:*"):
                r.delete(key)
            r.close()
        except Exception:
            pass

    def _create_ban_and_appeal(self, reporter_headers, moderator_headers):
        """Create report → mod action (ban normal1) → appeal. Returns appeal_id."""
        # 1. Report normal1's position
        report_id = _create_report(reporter_headers, POSITION3_ID, rule_id=RULE_VIOLENCE_ID)

        # 2. Moderator bans the submitter (normal1)
        action_payload = {
            "modResponse": "take_action",
            "modResponseText": "Banned for testing.",
            "actions": [
                {"userClass": "submitter", "action": "permanent_ban"}
            ],
        }
        resp = requests.post(
            f"{MODERATION_URL}/reports/{report_id}/response",
            headers=moderator_headers,
            json=action_payload,
        )
        assert resp.status_code == 200
        mod_action_id = resp.json()["id"]

        # 3. Normal1 (now banned) creates an appeal
        # Need to re-login since ban may have invalidated cache
        normal1_headers = auth_header(login("normal1"))
        appeal_resp = requests.post(
            f"{MODERATION_URL}/actions/{mod_action_id}/appeal",
            headers=normal1_headers,
            json={"appealText": "I did not violate any rules, please review."},
        )
        assert appeal_resp.status_code == 201, f"Appeal creation failed: {appeal_resp.text}"
        return appeal_resp.json()["id"], mod_action_id

    @pytest.mark.mutation
    def test_admin_approve_appeal_reverses_ban(self, normal_headers, admin_headers):
        """Admin approving an appeal reverses the ban."""
        appeal_id, _ = self._create_ban_and_appeal(normal_headers, admin_headers)

        # Verify user is banned
        user = db_query_one("SELECT status FROM users WHERE id = %s", (NORMAL1_ID,))
        assert user["status"] == "banned"

        # Admin approves the appeal
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=admin_headers,
            json={"response": "approve", "responseText": "Appeal approved."},
        )
        assert resp.status_code == 200

        # Verify user is unbanned
        user = db_query_one("SELECT status FROM users WHERE id = %s", (NORMAL1_ID,))
        assert user["status"] == "active"

    @pytest.mark.mutation
    def test_admin_deny_appeal(self, normal_headers, admin_headers):
        """Admin denying an appeal keeps user banned."""
        appeal_id, _ = self._create_ban_and_appeal(normal_headers, admin_headers)

        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=admin_headers,
            json={"response": "deny", "responseText": "Appeal denied."},
        )
        assert resp.status_code == 200

        # Verify user stays banned
        user = db_query_one("SELECT status FROM users WHERE id = %s", (NORMAL1_ID,))
        assert user["status"] == "banned"

    @pytest.mark.mutation
    def test_moderator_approve_overrules(self, normal_headers, moderator_headers):
        """Non-admin moderator approving sets appeal_state to overruled."""
        # Use a second moderator to review
        mod2_headers = auth_header(login("moderator2"))
        appeal_id, _ = self._create_ban_and_appeal(normal_headers, moderator_headers)

        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=mod2_headers,
            json={"response": "approve", "responseText": "I think the user is right."},
        )
        assert resp.status_code == 200

        # Check appeal state is 'overruled'
        appeal = db_query_one(
            "SELECT appeal_state FROM mod_action_appeal WHERE id = %s",
            (appeal_id,),
        )
        assert appeal["appeal_state"] == "overruled"

    @pytest.mark.mutation
    def test_only_admin_can_resolve_escalated(self, normal_headers, moderator_headers):
        """Moderator cannot resolve escalated appeals — only admin can."""
        mod2_headers = auth_header(login("moderator2"))
        appeal_id, mod_action_id = self._create_ban_and_appeal(normal_headers, moderator_headers)

        # Second moderator overrules
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=mod2_headers,
            json={"response": "approve", "responseText": "Overrule."},
        )
        assert resp.status_code == 200

        # Original moderator escalates
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=moderator_headers,
            json={"response": "escalate", "responseText": "Escalating to admin."},
        )
        assert resp.status_code == 200

        # Verify state is escalated
        appeal = db_query_one(
            "SELECT appeal_state FROM mod_action_appeal WHERE id = %s",
            (appeal_id,),
        )
        assert appeal["appeal_state"] == "escalated"

        # Moderator2 tries to resolve escalated → 403
        resp = requests.post(
            f"{MODERATION_URL}/appeals/{appeal_id}/response",
            headers=mod2_headers,
            json={"response": "deny", "responseText": "Trying to deny."},
        )
        assert resp.status_code == 403

"""Integration tests for admin rule management endpoints.

Tests cover:
- GET  /admin/rules         — listing rules with filters
- POST /admin/rules/requests — creating rule change requests
- GET  /admin/rules/requests — viewing rule change requests
- PATCH /admin/rules/requests/{id} — approving, denying, rescinding
- GET  /rules               — public rule listing with content_type filter
"""

import pytest
import requests
import uuid
import json

from conftest import (
    BASE_URL,
    US_LOCATION_ID,
    OREGON_LOCATION_ID,
    PORTLAND_LOCATION_ID,
    HEALTHCARE_SESSION_ID,
    ECONOMY_SESSION_ID,
    ADMIN1_ID,
    MODERATOR1_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    RULE_VIOLENCE_ID,
    RULE_SPAM_ID,
    RULE_NOT_POLITICAL_ID,
    NONEXISTENT_UUID,
    db_execute,
    db_query,
    db_query_one,
)

ADMIN_RULES_URL = f"{BASE_URL}/admin/rules"
ADMIN_RULES_REQUESTS_URL = f"{BASE_URL}/admin/rules/requests"
RULES_URL = f"{BASE_URL}/rules"

# Location-scoped rule IDs from seed data
RULE_OREGON_CIVILITY_ID = "f2e1d0c9-b8a7-4e6f-5d4c-3b2a1c0d9e8f"
RULE_HEALTHCARE_MISINFO_ID = "a3b2c1d0-e9f8-4a7b-6c5d-4e3f2a1b0c9d"


def _cleanup_rule_request(request_id):
    """Remove a rule change request from the DB."""
    db_execute("DELETE FROM rule_change_request WHERE id = %s", (request_id,))


def _cleanup_rule(rule_id):
    """Remove a rule from the DB."""
    db_execute("DELETE FROM rule_change_request WHERE rule_id = %s", (rule_id,))
    db_execute("DELETE FROM rule WHERE id = %s", (rule_id,))


# ---------------------------------------------------------------------------
# GET /admin/rules — listing rules with filters
# ---------------------------------------------------------------------------

class TestGetAdminRules:
    """GET /admin/rules — list rules with optional filters."""

    def test_default_returns_active_rules(self, admin_headers):
        """Default (no filters) returns active rules only."""
        resp = requests.get(ADMIN_RULES_URL, headers=admin_headers)
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0
        for rule in rules:
            assert rule['status'] == 'active'

    def test_status_filter_all(self, admin_headers):
        """status=all returns rules of all statuses."""
        resp = requests.get(
            ADMIN_RULES_URL, headers=admin_headers, params={"status": "all"}
        )
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0

    def test_location_filter(self, admin_headers):
        """location_id filter returns only rules at that location."""
        resp = requests.get(
            ADMIN_RULES_URL, headers=admin_headers,
            params={"location_id": OREGON_LOCATION_ID}
        )
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0
        for rule in rules:
            assert rule['locationId'] == OREGON_LOCATION_ID

    def test_content_type_filter(self, admin_headers):
        """content_type filter returns only rules that include that type."""
        resp = requests.get(
            ADMIN_RULES_URL, headers=admin_headers,
            params={"contentType": "position"}
        )
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0
        for rule in rules:
            assert 'position' in rule['applicableContentTypes']

    def test_content_type_filter_exclusive(self, admin_headers):
        """The 'Not a Normative Political Statement' rule only applies to positions."""
        resp = requests.get(
            ADMIN_RULES_URL, headers=admin_headers,
            params={"contentType": "chat_log"}
        )
        assert resp.status_code == 200
        rule_ids = [r['id'] for r in resp.json()]
        # The position-only rule should NOT appear in chat_log results
        assert RULE_NOT_POLITICAL_ID not in rule_ids

    def test_normal_user_denied(self, normal2_headers):
        """Normal user without facilitator role is denied."""
        resp = requests.get(ADMIN_RULES_URL, headers=normal2_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /admin/rules/requests — creating rule change requests
# ---------------------------------------------------------------------------

class TestCreateRuleRequest:
    """POST /admin/rules/requests — create rule change requests."""

    @pytest.mark.mutation
    def test_valid_create_request(self, admin_headers):
        """Admin can create a rule change request for a new rule."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Test Create Rule",
                "text": "This is a test rule created by integration test.",
                "severity": 3,
                "applicableContentTypes": ["position", "post"],
            },
            "reason": "Testing rule creation",
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 201
        data = resp.json()
        assert 'id' in data
        assert data['status'] in ('pending', 'auto_approved')

        request_id = data['id']
        try:
            # If auto-approved, verify the rule was created
            if data['status'] == 'auto_approved':
                rules_resp = requests.get(
                    ADMIN_RULES_URL, headers=admin_headers
                )
                rule_titles = [r['title'] for r in rules_resp.json()]
                assert "Test Create Rule" in rule_titles
        finally:
            # Clean up: find and delete the created rule
            created_rule = db_query_one(
                "SELECT id FROM rule WHERE title = %s", ("Test Create Rule",)
            )
            if created_rule:
                _cleanup_rule(str(created_rule['id']))
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_valid_update_request(self, admin_headers):
        """Admin can create a rule update request for an existing rule."""
        body = {
            "action": "update",
            "ruleId": RULE_SPAM_ID,
            "proposedRule": {
                "title": "Updated Spam Rule",
                "text": "This content contains spam or self-promotion",
                "severity": 3,
            },
            "reason": "Updating severity",
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 201, f"Unexpected response: {resp.status_code} {resp.text}"
        data = resp.json()
        assert 'id' in data

        request_id = data['id']
        try:
            if data['status'] == 'auto_approved':
                # Verify rule was updated
                rule = db_query_one("SELECT title, severity FROM rule WHERE id = %s", (RULE_SPAM_ID,))
                assert rule['title'] == 'Updated Spam Rule'
                assert rule['severity'] == 3
        finally:
            # Restore original rule state
            db_execute("""
                UPDATE rule SET title = 'Spam or Self-Promotion', severity = 2,
                       updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (RULE_SPAM_ID,))
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_valid_delete_request(self, admin_headers):
        """Admin can create a rule delete request."""
        # Create a temporary rule to delete
        temp_rule_id = str(uuid.uuid4())
        db_execute("""
            INSERT INTO rule (id, creator_user_id, title, text, status, severity,
                             applicable_content_types, created_time)
            VALUES (%s, %s, 'Temp Rule To Delete', 'Will be deleted', 'active', 1,
                    '{position}', CURRENT_TIMESTAMP)
        """, (temp_rule_id, ADMIN1_ID))

        try:
            body = {
                "action": "delete",
                "ruleId": temp_rule_id,
                "proposedRule": {"title": "placeholder", "text": "placeholder"},
                "reason": "No longer needed",
            }
            resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
            assert resp.status_code == 201
            data = resp.json()
            request_id = data['id']

            if data['status'] == 'auto_approved':
                # Verify rule was soft-deleted
                rule = db_query_one("SELECT status FROM rule WHERE id = %s", (temp_rule_id,))
                assert rule['status'] == 'inactive'

            _cleanup_rule_request(request_id)
        finally:
            _cleanup_rule(temp_rule_id)

    def test_create_missing_title(self, admin_headers):
        """Create request without title returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "text": "Description only, no title.",
                "severity": 2,
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_create_missing_text(self, admin_headers):
        """Create request without text returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Title Only",
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_bad_severity(self, admin_headers):
        """Severity outside 1-5 returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Bad Severity",
                "text": "This rule has bad severity.",
                "severity": 10,
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_bad_severity_zero(self, admin_headers):
        """Severity of 0 returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Zero Severity",
                "text": "This rule has zero severity.",
                "severity": 0,
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_scope_denied_for_normal_user(self, normal2_headers):
        """Normal user (no roles) cannot create rule requests."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Normal User Rule",
                "text": "Should not be allowed.",
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=normal2_headers, json=body)
        assert resp.status_code == 403

    @pytest.mark.mutation
    def test_duplicate_pending_request(self, admin_headers):
        """Cannot create duplicate pending request for same rule+action."""
        # Create a temp rule for update requests
        temp_rule_id = str(uuid.uuid4())
        db_execute("""
            INSERT INTO rule (id, creator_user_id, title, text, status, severity,
                             applicable_content_types, created_time)
            VALUES (%s, %s, 'Temp Dup Check Rule', 'For dup test', 'active', 1,
                    '{position}', CURRENT_TIMESTAMP)
        """, (temp_rule_id, ADMIN1_ID))

        request_ids = []
        try:
            body = {
                "action": "update",
                "ruleId": temp_rule_id,
                "proposedRule": {"title": "Updated Title", "text": "For dup test"},
                "reason": "First request",
            }
            # First request should succeed
            resp1 = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
            assert resp1.status_code == 201
            request_ids.append(resp1.json()['id'])

            # Only check for duplicate if first request is pending (not auto-approved)
            if resp1.json()['status'] == 'pending':
                resp2 = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
                assert resp2.status_code == 400
        finally:
            for rid in request_ids:
                _cleanup_rule_request(rid)
            _cleanup_rule(temp_rule_id)

    @pytest.mark.mutation
    def test_auto_approve_when_no_peer(self, admin_headers):
        """When no peer admin exists to review, request is auto-approved."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Auto Approve Test Rule",
                "text": "This should be auto-approved because admin1 is the only root admin.",
                "severity": 2,
                "applicableContentTypes": ["position"],
            },
            "reason": "Auto-approve test",
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 201
        data = resp.json()
        # admin1 is the only root admin, so no peer => auto-approve
        assert data['status'] == 'auto_approved'

        request_id = data['id']
        try:
            # Verify the rule was actually created
            rule = db_query_one(
                "SELECT id, status FROM rule WHERE title = %s",
                ("Auto Approve Test Rule",)
            )
            assert rule is not None
            assert rule['status'] == 'active'
        finally:
            created_rule = db_query_one(
                "SELECT id FROM rule WHERE title = %s", ("Auto Approve Test Rule",)
            )
            if created_rule:
                _cleanup_rule(str(created_rule['id']))
            _cleanup_rule_request(request_id)

    def test_invalid_action(self, admin_headers):
        """Invalid action returns 400."""
        body = {
            "action": "invalid",
            "proposedRule": {"title": "Bad Action"},
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_update_without_rule_id(self, admin_headers):
        """Update without ruleId returns 400."""
        body = {
            "action": "update",
            "proposedRule": {"title": "No rule ID", "text": "Missing ruleId"},
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_delete_without_rule_id(self, admin_headers):
        """Delete without ruleId returns 400."""
        body = {
            "action": "delete",
            "proposedRule": {"title": "placeholder", "text": "placeholder"},
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_update_nonexistent_rule(self, admin_headers):
        """Update with nonexistent ruleId returns 400."""
        body = {
            "action": "update",
            "ruleId": NONEXISTENT_UUID,
            "proposedRule": {"title": "Ghost Rule", "text": "Does not exist"},
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_invalid_content_type(self, admin_headers):
        """Invalid content type returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Bad Content Type",
                "text": "Has invalid type.",
                "applicableContentTypes": ["invalid_type"],
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400

    def test_empty_content_types(self, admin_headers):
        """Empty content types list returns 400."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Empty Content Types",
                "text": "Has empty types list.",
                "applicableContentTypes": [],
            },
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /admin/rules/requests — viewing rule change requests
# ---------------------------------------------------------------------------

class TestGetRuleRequests:
    """GET /admin/rules/requests — view rule change requests with filters."""

    @pytest.mark.mutation
    def test_mine_view(self, admin_headers):
        """Mine view returns requests created by the authenticated user."""
        # Create a request first
        body = {
            "action": "create",
            "proposedRule": {
                "title": "Mine View Test Rule",
                "text": "For testing mine view.",
                "severity": 1,
            },
            "reason": "Mine view test",
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 201
        request_id = resp.json()['id']

        try:
            mine_resp = requests.get(
                ADMIN_RULES_REQUESTS_URL, headers=admin_headers,
                params={"view": "mine"}
            )
            assert mine_resp.status_code == 200
            mine_data = mine_resp.json()
            request_ids = [r['id'] for r in mine_data]
            assert request_id in request_ids
        finally:
            created_rule = db_query_one(
                "SELECT id FROM rule WHERE title = %s", ("Mine View Test Rule",)
            )
            if created_rule:
                _cleanup_rule(str(created_rule['id']))
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_all_view_scope_filtering(self, admin_headers):
        """All view returns requests within the user's scope."""
        body = {
            "action": "create",
            "proposedRule": {
                "title": "All View Test Rule",
                "text": "For testing all view.",
                "severity": 2,
            },
            "reason": "All view test",
        }
        resp = requests.post(ADMIN_RULES_REQUESTS_URL, headers=admin_headers, json=body)
        assert resp.status_code == 201
        request_id = resp.json()['id']

        try:
            all_resp = requests.get(
                ADMIN_RULES_REQUESTS_URL, headers=admin_headers,
                params={"view": "all"}
            )
            assert all_resp.status_code == 200
            all_data = all_resp.json()
            request_ids = [r['id'] for r in all_data]
            assert request_id in request_ids
        finally:
            created_rule = db_query_one(
                "SELECT id FROM rule WHERE title = %s", ("All View Test Rule",)
            )
            if created_rule:
                _cleanup_rule(str(created_rule['id']))
            _cleanup_rule_request(request_id)

    def test_pending_view_default(self, admin_headers):
        """Default view (no parameter) returns pending requests."""
        resp = requests.get(ADMIN_RULES_REQUESTS_URL, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # All returned items should be pending
        for item in data:
            assert item['status'] == 'pending'

    def test_invalid_view_returns_400(self, admin_headers):
        """Invalid view parameter returns 400."""
        resp = requests.get(
            ADMIN_RULES_REQUESTS_URL, headers=admin_headers,
            params={"view": "invalid"}
        )
        assert resp.status_code == 400

    def test_normal_user_denied(self, normal2_headers):
        """Normal user without facilitator role is denied."""
        resp = requests.get(ADMIN_RULES_REQUESTS_URL, headers=normal2_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /admin/rules/requests/{id} — approve, deny, rescind
# ---------------------------------------------------------------------------

class TestUpdateRuleRequest:
    """PATCH /admin/rules/requests/{requestId} — approve, deny, or rescind."""

    @pytest.mark.mutation
    def test_approve_applies_create(self, admin_headers):
        """Approving a create request creates the rule.

        Since admin1 is the only root admin, create requests are auto-approved
        when admin1 is the requester. We insert a pending request from moderator1
        so admin1 can act as the peer reviewer.
        """
        # Insert a pending rule change request from moderator1 so admin1 can review
        request_id = str(uuid.uuid4())
        proposed = json.dumps({
            "title": "Approved Create Test",
            "text": "Rule approved via test.",
            "severity": 2,
            "applicableContentTypes": ["position"],
        })
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'create', %s, %s, %s, 'test',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        """, (request_id, proposed, MODERATOR1_ID, US_LOCATION_ID))

        try:
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "approved"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data['status'] == 'approved'

            # Verify rule was created
            rule = db_query_one(
                "SELECT id, status FROM rule WHERE title = %s",
                ("Approved Create Test",)
            )
            assert rule is not None
            assert rule['status'] == 'active'
        finally:
            created_rule = db_query_one(
                "SELECT id FROM rule WHERE title = %s", ("Approved Create Test",)
            )
            if created_rule:
                _cleanup_rule(str(created_rule['id']))
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_deny_records_reason(self, admin_headers):
        """Denying a request records the denial reason."""
        request_id = str(uuid.uuid4())
        proposed = json.dumps({
            "title": "Deny Test Rule",
            "text": "Will be denied.",
        })
        # Use moderator1 as requester so admin1 can act as peer reviewer
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'create', %s, %s, %s, 'test',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        """, (request_id, proposed, MODERATOR1_ID, US_LOCATION_ID))

        try:
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "denied", "reason": "Not appropriate"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data['status'] == 'denied'

            # Verify denial reason is stored
            row = db_query_one(
                "SELECT denial_reason, reviewed_by FROM rule_change_request WHERE id = %s",
                (request_id,)
            )
            assert row['denial_reason'] == 'Not appropriate'
            assert row['reviewed_by'] is not None
        finally:
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_rescind_only_by_requester(self, admin_headers, normal_headers):
        """Only the original requester can rescind their request."""
        request_id = str(uuid.uuid4())
        proposed = json.dumps({
            "title": "Rescind Test Rule",
            "text": "Will be rescinded.",
        })
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'create', %s, %s, %s, 'test',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        """, (request_id, proposed, ADMIN1_ID, US_LOCATION_ID))

        try:
            # normal1 (facilitator) should NOT be able to rescind admin1's request
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=normal_headers,
                json={"status": "rescinded"},
            )
            assert resp.status_code == 403

            # admin1 (the requester) should be able to rescind
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "rescinded"},
            )
            assert resp.status_code == 200
            assert resp.json()['status'] == 'rescinded'
        finally:
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_already_resolved_error(self, admin_headers):
        """Cannot update an already-resolved request."""
        request_id = str(uuid.uuid4())
        proposed = json.dumps({
            "title": "Already Resolved Test",
            "text": "Already approved.",
        })
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'create', %s, %s, %s, 'test',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'approved')
        """, (request_id, proposed, ADMIN1_ID, US_LOCATION_ID))

        try:
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "approved"},
            )
            assert resp.status_code == 400
        finally:
            _cleanup_rule_request(request_id)

    def test_nonexistent_request_returns_404(self, admin_headers):
        """Updating a nonexistent request returns 404."""
        resp = requests.patch(
            f"{ADMIN_RULES_REQUESTS_URL}/{NONEXISTENT_UUID}",
            headers=admin_headers,
            json={"status": "approved"},
        )
        assert resp.status_code == 404

    def test_invalid_status_returns_400(self, admin_headers):
        """Invalid status value returns 400."""
        request_id = str(uuid.uuid4())
        proposed = json.dumps({"title": "Invalid Status Test", "text": "Test"})
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'create', %s, %s, %s, 'test',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        """, (request_id, proposed, ADMIN1_ID, US_LOCATION_ID))

        try:
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "invalid_status"},
            )
            assert resp.status_code == 400
        finally:
            _cleanup_rule_request(request_id)

    @pytest.mark.mutation
    def test_approve_delete_request(self, admin_headers):
        """Approving a delete request soft-deletes the rule."""
        # Create a temp rule to delete
        temp_rule_id = str(uuid.uuid4())
        db_execute("""
            INSERT INTO rule (id, creator_user_id, title, text, status, severity,
                             applicable_content_types, created_time)
            VALUES (%s, %s, 'Rule To Be Deleted Via Approve', 'Delete me', 'active', 1,
                    '{position}', CURRENT_TIMESTAMP)
        """, (temp_rule_id, ADMIN1_ID))

        # Use moderator1 as requester so admin1 can act as peer reviewer
        request_id = str(uuid.uuid4())
        proposed = json.dumps({
            "title": "Rule To Be Deleted Via Approve",
            "text": "Delete me",
        })
        db_execute("""
            INSERT INTO rule_change_request
                (id, action, rule_id, proposed_rule, requested_by,
                 requester_authority_location_id, request_reason,
                 auto_approve_at, status)
            VALUES (%s, 'delete', %s, %s, %s, %s, 'cleanup',
                    CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        """, (request_id, temp_rule_id, proposed, MODERATOR1_ID, US_LOCATION_ID))

        try:
            resp = requests.patch(
                f"{ADMIN_RULES_REQUESTS_URL}/{request_id}",
                headers=admin_headers,
                json={"status": "approved"},
            )
            assert resp.status_code == 200
            assert resp.json()['status'] == 'approved'

            # Verify the rule is now inactive
            rule = db_query_one("SELECT status FROM rule WHERE id = %s", (temp_rule_id,))
            assert rule['status'] == 'inactive'
        finally:
            _cleanup_rule_request(request_id)
            _cleanup_rule(temp_rule_id)


# ---------------------------------------------------------------------------
# GET /rules — public rule listing with content_type filter
# ---------------------------------------------------------------------------

class TestGetRules:
    """GET /rules — public rule listing (authenticated users)."""

    def test_returns_active_rules(self, normal_headers):
        """Returns active rules for authenticated users."""
        resp = requests.get(RULES_URL, headers=normal_headers)
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0
        for rule in rules:
            assert 'id' in rule
            assert 'title' in rule
            assert 'text' in rule

    def test_content_type_filter_position(self, normal_headers):
        """content_type=position returns only rules applicable to positions."""
        resp = requests.get(
            RULES_URL, headers=normal_headers, params={"contentType": "position"}
        )
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) > 0
        for rule in rules:
            assert 'position' in rule.get('applicableContentTypes', [])

    def test_content_type_filter_excludes_position_only(self, normal_headers):
        """content_type=chat_log excludes position-only rules."""
        resp = requests.get(
            RULES_URL, headers=normal_headers, params={"contentType": "chat_log"}
        )
        assert resp.status_code == 200
        rule_ids = [r['id'] for r in resp.json()]
        # "Not a Normative Political Statement" only applies to positions
        assert RULE_NOT_POLITICAL_ID not in rule_ids

    def test_unauthenticated_denied(self):
        """Unauthenticated request is denied."""
        resp = requests.get(RULES_URL)
        assert resp.status_code in (401, 422)

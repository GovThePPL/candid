"""Unit tests for admin_controller.py — role management helpers."""

import pytest
from unittest.mock import patch, MagicMock, call

pytestmark = pytest.mark.unit

# Module paths for patching
ADMIN = "candid.controllers.admin_controller"
ADMIN_HELPERS = "candid.controllers.helpers.admin"
AUTH = "candid.controllers.helpers.auth"

# Test location UUIDs
US_ROOT = "f1a2b3c4-d5e6-7890-abcd-ef1234567890"
OREGON = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"
PORTLAND = "d3c4b5a6-f7e8-9012-cdef-123456789012"
HEALTHCARE_CAT = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"

# Test user UUIDs
ADMIN_USER = "aaa00000-0000-0000-0000-000000000001"
PEER_ADMIN = "aaa00000-0000-0000-0000-000000000099"
MOD_USER = "bbb00000-0000-0000-0000-000000000002"
FACILITATOR_USER = "ccc00000-0000-0000-0000-000000000003"
PEER_FACILITATOR = "ccc00000-0000-0000-0000-000000000099"
TARGET_USER = "eee00000-0000-0000-0000-000000000005"

ROLE_ID = "rrr00000-0000-0000-0000-000000000001"
REQUEST_ID = "qqq00000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _clear_caches():
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


# ---------------------------------------------------------------------------
# _get_requester_authority_location  (extracted to helpers/admin.py)
# ---------------------------------------------------------------------------

class TestGetRequesterAuthorityLocation:
    def test_admin_at_target_location(self):
        """Admin at exactly the target location returns that location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"location_id": OREGON}
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "admin", OREGON)
            assert result == OREGON

    def test_admin_at_ancestor_returns_ancestor(self):
        """Admin at root can assign at descendant; returns root (deepest match)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"location_id": US_ROOT}
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[PORTLAND, OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "moderator", PORTLAND)
            # Deepest admin location in ancestry: US_ROOT is the only admin loc
            assert result == US_ROOT

    def test_admin_at_deeper_ancestor_preferred(self):
        """When admin at both Oregon and root, Oregon (deeper) is preferred."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"location_id": OREGON},
            {"location_id": US_ROOT},
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[PORTLAND, OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "facilitator", PORTLAND)
            # Ancestors are [PORTLAND, OREGON, US_ROOT]; first match = OREGON
            assert result == OREGON

    def test_no_admin_role_returns_none(self):
        """User with no admin role gets None."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                TARGET_USER, "admin", OREGON)
            assert result is None

    def test_facilitator_assignable_with_category(self):
        """Facilitator can assign assistant_moderator at exact location+category."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"exists": True})

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                FACILITATOR_USER, "assistant_moderator", OREGON, HEALTHCARE_CAT)
            assert result == str(OREGON)

    def test_facilitator_assignable_no_category_returns_none(self):
        """Facilitator assignable role without category returns None."""
        from candid.controllers.admin_controller import _get_requester_authority_location
        result = _get_requester_authority_location(
            FACILITATOR_USER, "expert", OREGON, None)
        assert result is None

    def test_facilitator_not_at_location_returns_none(self):
        """Facilitator at different location+category returns None."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                FACILITATOR_USER, "liaison", PORTLAND, HEALTHCARE_CAT)
            assert result is None

    def test_unknown_role_returns_none(self):
        """Unknown role that's not in either set returns None."""
        from candid.controllers.admin_controller import _get_requester_authority_location
        result = _get_requester_authority_location(
            ADMIN_USER, "unknown_role", OREGON)
        assert result is None

    def test_empty_ancestors_returns_none(self):
        """If get_location_ancestors returns empty, no match possible."""
        with patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "admin", OREGON)
            assert result is None


# ---------------------------------------------------------------------------
# _find_approval_peer  (extracted to helpers/admin.py)
# ---------------------------------------------------------------------------

class TestFindApprovalPeer:
    def test_admin_assignable_finds_peer_admin(self):
        """For admin/moderator/facilitator assignment, find peer admin at authority location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": PEER_ADMIN}
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': ADMIN_USER,
                'role': 'moderator',
                'location_id': PORTLAND,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert PEER_ADMIN in result

    def test_admin_assignable_no_peer_at_authority_falls_to_target(self):
        """No peer at authority location; tries admin at target location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no peer admin at Oregon (authority)
            [{"user_id": "portland-admin"}],  # admin at Portland (target)
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': ADMIN_USER,
                'role': 'moderator',
                'location_id': PORTLAND,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert "portland-admin" in result

    def test_admin_assignable_no_one_returns_none(self):
        """No peer at authority or target → auto-approve (None)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': ADMIN_USER,
                'role': 'admin',
                'location_id': OREGON,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert result is None

    def test_admin_assignable_same_loc_no_fallback_needed(self):
        """When authority == target, only one query is made."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': ADMIN_USER,
                'role': 'facilitator',
                'location_id': OREGON,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert result is None
            # Only 1 query: peer admin at authority=target location
            assert mock_db.execute_query.call_count == 1

    def test_facilitator_assignable_finds_peer_facilitator(self):
        """For asst_mod/expert/liaison, find peer facilitator at same location+category."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": PEER_FACILITATOR}
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'assistant_moderator',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requester_authority_location_id': OREGON,
            })
            assert PEER_FACILITATOR in result

    def test_facilitator_assignable_falls_to_moderator(self):
        """No peer facilitator → falls to location moderator."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no peer facilitator
            [{"user_id": MOD_USER}],  # moderator found
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'expert',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requester_authority_location_id': OREGON,
            })
            assert MOD_USER in result

    def test_facilitator_assignable_falls_to_admin(self):
        """No peer facilitator, no moderator → falls to admin."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no peer facilitator
            [],  # no moderator
            [{"user_id": ADMIN_USER}],  # admin found
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'liaison',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requester_authority_location_id': OREGON,
            })
            assert ADMIN_USER in result

    def test_facilitator_assignable_no_one_returns_none(self):
        """No peer facilitator, moderator, or admin → auto-approve."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'assistant_moderator',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requester_authority_location_id': OREGON,
            })
            assert result is None

    def test_facilitator_no_location_returns_none(self):
        """Facilitator assignable without target location → auto-approve."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'expert',
                'location_id': None,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert result is None

    def test_unknown_role_returns_none(self):
        """Role not in either set → None."""
        from candid.controllers.admin_controller import _find_approval_peer
        result = _find_approval_peer({
            'requested_by': ADMIN_USER,
            'role': 'unknown_role',
            'location_id': OREGON,
            'position_category_id': None,
            'requester_authority_location_id': OREGON,
        })
        assert result is None

    def test_ghost_peer_excluded_from_admin_query(self):
        """Peers without keycloak_id (ghost users) are excluded — queries JOIN users."""
        mock_db = MagicMock()
        # Ghost peer exists in user_role but has no keycloak_id → JOIN filters it out
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': ADMIN_USER,
                'role': 'admin',
                'location_id': OREGON,
                'position_category_id': None,
                'requester_authority_location_id': OREGON,
            })
            assert result is None
            # Verify the query JOINs users and filters on keycloak_id
            sql = mock_db.execute_query.call_args[0][0]
            assert "JOIN users" in sql
            assert "keycloak_id IS NOT NULL" in sql

    def test_ghost_peer_excluded_from_facilitator_query(self):
        """Ghost peers are excluded from facilitator peer queries too."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _find_approval_peer
            result = _find_approval_peer({
                'requested_by': FACILITATOR_USER,
                'role': 'assistant_moderator',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requester_authority_location_id': OREGON,
            })
            assert result is None
            # All 3 fallback queries should JOIN users with keycloak_id filter
            for call_obj in mock_db.execute_query.call_args_list:
                sql = call_obj[0][0]
                assert "JOIN users" in sql
                assert "keycloak_id IS NOT NULL" in sql


# ---------------------------------------------------------------------------
# _apply_role_change  (extracted to helpers/admin.py)
# ---------------------------------------------------------------------------

class TestApplyRoleChange:
    def test_assign_inserts_new_role(self):
        """Assignment creates a new user_role row when none exists."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no existing role (SELECT returns None)
            None,  # INSERT
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.uuid.uuid4", return_value="new-role-id"):
            from candid.controllers.admin_controller import _apply_role_change
            _apply_role_change({
                'action': 'assign',
                'target_user_id': TARGET_USER,
                'role': 'moderator',
                'location_id': OREGON,
                'position_category_id': None,
                'requested_by': ADMIN_USER,
            })

            # Should have called INSERT
            insert_call = mock_db.execute_query.call_args_list[1]
            assert "INSERT INTO user_role" in insert_call[0][0]

    def test_assign_idempotent_when_exists(self):
        """If role already exists, no INSERT is performed."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"id": ROLE_ID},  # existing role found
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _apply_role_change
            _apply_role_change({
                'action': 'assign',
                'target_user_id': TARGET_USER,
                'role': 'moderator',
                'location_id': OREGON,
                'position_category_id': None,
                'requested_by': ADMIN_USER,
            })

            # Only 1 call (the SELECT), no INSERT
            assert mock_db.execute_query.call_count == 1

    def test_remove_deletes_role(self):
        """Removal deletes the user_role row."""
        mock_db = MagicMock()

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _apply_role_change
            _apply_role_change({
                'action': 'remove',
                'user_role_id': ROLE_ID,
                'target_user_id': TARGET_USER,
                'role': 'moderator',
                'location_id': OREGON,
                'position_category_id': None,
                'requested_by': ADMIN_USER,
            })

            delete_call = mock_db.execute_query.call_args_list[0]
            assert "DELETE FROM user_role" in delete_call[0][0]
            assert ROLE_ID in delete_call[0][1]

    def test_remove_without_role_id_is_noop(self):
        """If user_role_id is missing on a removal, nothing happens."""
        mock_db = MagicMock()

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _apply_role_change
            _apply_role_change({
                'action': 'remove',
                'user_role_id': None,
                'target_user_id': TARGET_USER,
                'role': 'moderator',
                'location_id': OREGON,
                'position_category_id': None,
                'requested_by': ADMIN_USER,
            })

            assert mock_db.execute_query.call_count == 0

    def test_assign_with_category(self):
        """Assignment with position_category_id passes it through."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no existing
            None,  # INSERT
        ])

        with patch(f"{ADMIN_HELPERS}.db", mock_db), \
             patch(f"{ADMIN_HELPERS}.uuid.uuid4", return_value="new-role-id"):
            from candid.controllers.admin_controller import _apply_role_change
            _apply_role_change({
                'action': 'assign',
                'target_user_id': TARGET_USER,
                'role': 'facilitator',
                'location_id': OREGON,
                'position_category_id': HEALTHCARE_CAT,
                'requested_by': ADMIN_USER,
            })

            insert_call = mock_db.execute_query.call_args_list[1]
            params = insert_call[0][1]
            assert HEALTHCARE_CAT in params


# ---------------------------------------------------------------------------
# _check_auto_approve_expired  (extracted to helpers/admin.py)
# ---------------------------------------------------------------------------

class TestCheckAutoApproveExpired:
    def test_runs_update_query(self):
        """Calls UPDATE to auto-approve expired pending requests."""
        mock_db = MagicMock()

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _check_auto_approve_expired
            _check_auto_approve_expired()

            mock_db.execute_query.assert_called_once()
            sql = mock_db.execute_query.call_args[0][0]
            assert "UPDATE role_change_request" in sql
            assert "auto_approved" in sql
            assert "auto_approve_at <= CURRENT_TIMESTAMP" in sql

    def test_is_idempotent(self):
        """Calling multiple times just runs the same UPDATE (no side effects)."""
        mock_db = MagicMock()

        with patch(f"{ADMIN_HELPERS}.db", mock_db):
            from candid.controllers.admin_controller import _check_auto_approve_expired
            _check_auto_approve_expired()
            _check_auto_approve_expired()

            assert mock_db.execute_query.call_count == 2


# ---------------------------------------------------------------------------
# _format_role_request  (extracted to helpers/admin.py — no db, pure logic)
# ---------------------------------------------------------------------------

class TestFormatRoleRequest:
    def test_formats_pending_request(self):
        """Pending request is serialized with all fields."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        from candid.controllers.admin_controller import _format_role_request
        row = {
            'id': REQUEST_ID,
            'action': 'assign',
            'target_user_id': TARGET_USER,
            'target_username': 'target1',
            'target_display_name': 'Target One',
            'role': 'moderator',
            'location_id': OREGON,
            'location_name': 'Oregon',
            'location_code': 'OR',
            'position_category_id': None,
            'category_label': None,
            'requested_by': ADMIN_USER,
            'requester_username': 'admin1',
            'requester_display_name': 'Admin One',
            'request_reason': 'Good candidate',
            'auto_approve_at': now,
            'created_time': now,
            'status': 'pending',
            'denial_reason': None,
            'reviewer_id': None,
            'reviewer_username': None,
            'reviewer_display_name': None,
            'updated_time': None,
        }
        result = _format_role_request(row)
        assert result['id'] == REQUEST_ID
        assert result['status'] == 'pending'
        assert result['targetUser']['username'] == 'target1'
        # New fields fall back to defaults when not present in row
        assert result['targetUser']['status'] == 'active'
        assert result['targetUser']['avatarIconUrl'] is None
        assert result['targetUser']['trustScore'] is None
        assert result['targetUser']['kudosCount'] == 0
        assert result['requester']['status'] == 'active'
        assert result['requester']['avatarIconUrl'] is None
        assert result['requester']['trustScore'] is None
        assert result['requester']['kudosCount'] == 0
        assert result['reviewer'] is None
        assert result['denialReason'] is None

    def test_formats_denied_request_with_reviewer(self):
        """Denied request includes reviewer and denial reason."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        from candid.controllers.admin_controller import _format_role_request
        row = {
            'id': REQUEST_ID,
            'action': 'assign',
            'target_user_id': TARGET_USER,
            'target_username': 'target1',
            'target_display_name': 'Target One',
            'role': 'admin',
            'location_id': OREGON,
            'location_name': 'Oregon',
            'location_code': 'OR',
            'position_category_id': None,
            'category_label': None,
            'requested_by': ADMIN_USER,
            'requester_username': 'admin1',
            'requester_display_name': 'Admin One',
            'request_reason': None,
            'auto_approve_at': now,
            'created_time': now,
            'status': 'denied',
            'denial_reason': 'Not qualified',
            'reviewer_id': PEER_ADMIN,
            'reviewer_username': 'peer_admin',
            'reviewer_display_name': 'Peer Admin',
            'updated_time': now,
        }
        result = _format_role_request(row)
        assert result['status'] == 'denied'
        assert result['denialReason'] == 'Not qualified'
        assert result['reviewer']['id'] == PEER_ADMIN
        assert result['reviewer']['username'] == 'peer_admin'
        # Reviewer also gets default values for new fields
        assert result['reviewer']['status'] == 'active'
        assert result['reviewer']['avatarIconUrl'] is None
        assert result['reviewer']['trustScore'] is None
        assert result['reviewer']['kudosCount'] == 0

    def test_formats_request_with_explicit_user_fields(self):
        """New user fields (status, avatarIconUrl, trustScore, kudosCount) are serialized."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        from candid.controllers.admin_controller import _format_role_request
        row = {
            'id': REQUEST_ID,
            'action': 'assign',
            'target_user_id': TARGET_USER,
            'target_username': 'target1',
            'target_display_name': 'Target One',
            'target_status': 'banned',
            'target_avatar_icon_url': 'https://example.com/avatar.png',
            'target_trust_score': 3.5,
            'target_kudos_count': 12,
            'role': 'moderator',
            'location_id': OREGON,
            'location_name': 'Oregon',
            'location_code': 'OR',
            'position_category_id': None,
            'category_label': None,
            'requested_by': ADMIN_USER,
            'requester_username': 'admin1',
            'requester_display_name': 'Admin One',
            'requester_status': 'active',
            'requester_avatar_icon_url': 'https://example.com/admin.png',
            'requester_trust_score': 8.0,
            'requester_kudos_count': 25,
            'request_reason': 'Good candidate',
            'auto_approve_at': now,
            'created_time': now,
            'status': 'approved',
            'denial_reason': None,
            'reviewer_id': PEER_ADMIN,
            'reviewer_username': 'peer_admin',
            'reviewer_display_name': 'Peer Admin',
            'reviewer_status': 'active',
            'reviewer_avatar_icon_url': None,
            'reviewer_trust_score': 5.0,
            'reviewer_kudos_count': 7,
            'updated_time': now,
        }
        result = _format_role_request(row)
        assert result['targetUser']['status'] == 'banned'
        assert result['targetUser']['avatarIconUrl'] == 'https://example.com/avatar.png'
        assert result['targetUser']['trustScore'] == 3.5
        assert result['targetUser']['kudosCount'] == 12
        assert result['requester']['status'] == 'active'
        assert result['requester']['avatarIconUrl'] == 'https://example.com/admin.png'
        assert result['requester']['trustScore'] == 8.0
        assert result['requester']['kudosCount'] == 25
        assert result['reviewer']['trustScore'] == 5.0
        assert result['reviewer']['kudosCount'] == 7


# ---------------------------------------------------------------------------
# rescind_role_request  (still in admin_controller.py — patch ADMIN)
# ---------------------------------------------------------------------------

class TestRescindRoleRequest:
    """Tests for the rescind path through update_role_request (PATCH with status=rescinded)."""

    def _make_token_info(self, user_id=FACILITATOR_USER):
        return {'sub': 'kc_' + user_id}

    def _mock_user(self, user_id=FACILITATOR_USER):
        user = MagicMock()
        user.id = user_id
        user.display_name = 'Test User'
        return user

    def _mock_connexion_request(self, body):
        mock_req = MagicMock()
        mock_req.is_json = True
        mock_req.get_json.return_value = body
        return mock_req

    def test_rescind_own_pending_request(self):
        """User can rescind their own pending request."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            # Fetch request
            {'id': REQUEST_ID, 'requested_by': FACILITATOR_USER, 'status': 'pending'},
            # UPDATE
            None,
        ])
        body = {'status': 'rescinded'}

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.connexion") as mock_cx:
            mock_cx.request = self._mock_connexion_request(body)
            from candid.controllers.admin_controller import update_role_request
            result = update_role_request(REQUEST_ID, body, token_info=self._make_token_info())
            assert result == {'id': REQUEST_ID, 'status': 'rescinded'}

    def test_rescind_other_users_request_returns_403(self):
        """Cannot rescind another user's request."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            'id': REQUEST_ID, 'requested_by': ADMIN_USER, 'status': 'pending'
        })
        body = {'status': 'rescinded'}

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.connexion") as mock_cx:
            mock_cx.request = self._mock_connexion_request(body)
            from candid.controllers.admin_controller import update_role_request
            result, status = update_role_request(REQUEST_ID, body, token_info=self._make_token_info())
            assert status == 403

    def test_rescind_non_pending_returns_400(self):
        """Cannot rescind an already-resolved request."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            'id': REQUEST_ID, 'requested_by': FACILITATOR_USER, 'status': 'approved'
        })
        body = {'status': 'rescinded'}

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.connexion") as mock_cx:
            mock_cx.request = self._mock_connexion_request(body)
            from candid.controllers.admin_controller import update_role_request
            result, status = update_role_request(REQUEST_ID, body, token_info=self._make_token_info())
            assert status == 400

    def test_rescind_nonexistent_returns_404(self):
        """Rescinding a non-existent request returns 404."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)
        body = {'status': 'rescinded'}

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.connexion") as mock_cx:
            mock_cx.request = self._mock_connexion_request(body)
            from candid.controllers.admin_controller import update_role_request
            result, status = update_role_request('nonexistent-id', body, token_info=self._make_token_info())
            assert status == 404

    def test_rescind_unauthorized_returns_auth_error(self):
        """Unauthenticated user gets auth error."""
        mock_err = MagicMock()
        mock_err.code = 401

        with patch(f"{ADMIN}.authorization_scoped", return_value=(False, mock_err)):
            from candid.controllers.admin_controller import update_role_request
            result, status = update_role_request(REQUEST_ID, {'status': 'rescinded'}, token_info=None)
            assert status == 401

    def test_rescind_already_rescinded_returns_400(self):
        """Cannot rescind an already-rescinded request."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            'id': REQUEST_ID, 'requested_by': FACILITATOR_USER, 'status': 'rescinded'
        })
        body = {'status': 'rescinded'}

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.connexion") as mock_cx:
            mock_cx.request = self._mock_connexion_request(body)
            from candid.controllers.admin_controller import update_role_request
            result, status = update_role_request(REQUEST_ID, body, token_info=self._make_token_info())
            assert status == 400


# ---------------------------------------------------------------------------
# get_role_requests  (still in admin_controller.py — patch ADMIN)
# ---------------------------------------------------------------------------

class TestGetRoleRequests:
    def _make_token_info(self, user_id=ADMIN_USER):
        return {'sub': 'kc_' + user_id}

    def _mock_user(self, user_id=ADMIN_USER):
        user = MagicMock()
        user.id = user_id
        user.display_name = 'Admin One'
        return user

    def _make_request_row(self, req_id=REQUEST_ID, status='pending',
                          requested_by=FACILITATOR_USER):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        return {
            'id': req_id,
            'action': 'assign',
            'target_user_id': TARGET_USER,
            'target_username': 'target1',
            'target_display_name': 'Target One',
            'role': 'moderator',
            'location_id': OREGON,
            'location_name': 'Oregon',
            'location_code': 'OR',
            'position_category_id': None,
            'category_label': None,
            'user_role_id': None,
            'requested_by': requested_by,
            'requester_authority_location_id': OREGON,
            'requester_username': 'fac1',
            'requester_display_name': 'Facilitator One',
            'request_reason': 'Good candidate',
            'auto_approve_at': now,
            'created_time': now,
            'status': status,
            'denial_reason': None,
            'updated_time': None,
            'reviewer_id': None,
            'reviewer_username': None,
            'reviewer_display_name': None,
        }

    def test_pending_view_filters_by_peer(self):
        """Pending view only returns requests where current user is a peer."""
        mock_db = MagicMock()
        row = self._make_request_row()
        mock_db.execute_query = MagicMock(return_value=[row])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}._find_approval_peer", return_value=[ADMIN_USER]):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='pending', token_info=self._make_token_info())
            assert len(result) == 1
            assert result[0]['id'] == REQUEST_ID

    def test_pending_view_excludes_non_peer(self):
        """Pending view excludes requests where user is NOT a peer."""
        mock_db = MagicMock()
        row = self._make_request_row()
        mock_db.execute_query = MagicMock(return_value=[row])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}._find_approval_peer", return_value=[PEER_ADMIN]):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='pending', token_info=self._make_token_info())
            assert len(result) == 0

    def test_mine_view_returns_user_requests(self):
        """Mine view returns requests made by the current user."""
        mock_db = MagicMock()
        row = self._make_request_row(requested_by=ADMIN_USER, status='approved')
        mock_db.execute_query = MagicMock(return_value=[row])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='mine', token_info=self._make_token_info())
            assert len(result) == 1
            assert result[0]['status'] == 'approved'

    def test_mine_view_queries_with_user_id(self):
        """Mine view passes user ID to the WHERE clause."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"):
            from candid.controllers.admin_controller import get_role_requests
            get_role_requests(view='mine', token_info=self._make_token_info())
            # Second call is the mine query (first is auto-approve check if not patched)
            mine_call = mock_db.execute_query.call_args_list[-1]
            sql = mine_call[0][0]
            params = mine_call[0][1]
            assert "requested_by = %s" in sql
            assert ADMIN_USER in params

    def test_all_view_computes_scope_from_admin_roles(self):
        """All view includes descendant locations for admin/moderator roles."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        admin_roles = [
            {'role': 'admin', 'location_id': OREGON, 'position_category_id': None},
        ]

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.get_user_roles", return_value=admin_roles), \
             patch(f"{ADMIN}.get_location_descendants", return_value=[OREGON, PORTLAND]):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='all', token_info=self._make_token_info())
            # Should query with scope containing both Oregon and Portland
            scope_call = mock_db.execute_query.call_args_list[-1]
            scope_list = scope_call[0][1][0]
            assert OREGON in scope_list
            assert PORTLAND in scope_list

    def test_all_view_facilitator_scope_is_exact_location(self):
        """All view uses exact location for facilitator roles (no descendants)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        fac_roles = [
            {'role': 'facilitator', 'location_id': PORTLAND, 'position_category_id': HEALTHCARE_CAT},
        ]

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user(FACILITATOR_USER)), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.get_user_roles", return_value=fac_roles):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='all', token_info=self._make_token_info(FACILITATOR_USER))
            scope_call = mock_db.execute_query.call_args_list[-1]
            scope_list = scope_call[0][1][0]
            assert PORTLAND in scope_list
            assert len(scope_list) == 1

    def test_all_view_empty_scope_returns_empty(self):
        """All view returns empty list if user has no roles with locations."""
        with patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"), \
             patch(f"{ADMIN}.get_user_roles", return_value=[]):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view='all', token_info=self._make_token_info())
            assert result == []

    def test_invalid_view_returns_400(self):
        """Invalid view parameter returns 400 error."""
        with patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"):
            from candid.controllers.admin_controller import get_role_requests
            result, status = get_role_requests(view='invalid', token_info=self._make_token_info())
            assert status == 400

    def test_default_view_is_pending(self):
        """When view is None, defaults to 'pending' behavior."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.authorization_scoped", return_value=(True, None)), \
             patch(f"{ADMIN}.token_to_user", return_value=self._mock_user()), \
             patch(f"{ADMIN}._check_auto_approve_expired"):
            from candid.controllers.admin_controller import get_role_requests
            result = get_role_requests(view=None, token_info=self._make_token_info())
            # Should query for pending status
            sql = mock_db.execute_query.call_args[0][0]
            assert "status = 'pending'" in sql

    def test_unauthorized_returns_auth_error(self):
        """Unauthenticated user gets auth error."""
        mock_err = MagicMock()
        mock_err.code = 401

        with patch(f"{ADMIN}.authorization_scoped", return_value=(False, mock_err)):
            from candid.controllers.admin_controller import get_role_requests
            result, status = get_role_requests(view='all', token_info=None)
            assert status == 401

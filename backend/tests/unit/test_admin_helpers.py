"""Unit tests for admin_controller.py — role management helpers."""

import pytest
from unittest.mock import patch, MagicMock, call

pytestmark = pytest.mark.unit

# Module path for patching
ADMIN = "candid.controllers.admin_controller"
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
# _get_requester_authority_location
# ---------------------------------------------------------------------------

class TestGetRequesterAuthorityLocation:
    def test_admin_at_target_location(self):
        """Admin at exactly the target location returns that location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"location_id": OREGON}
        ])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[PORTLAND, OREGON, US_ROOT]):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[PORTLAND, OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "facilitator", PORTLAND)
            # Ancestors are [PORTLAND, OREGON, US_ROOT]; first match = OREGON
            assert result == OREGON

    def test_no_admin_role_returns_none(self):
        """User with no admin role gets None."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                TARGET_USER, "admin", OREGON)
            assert result is None

    def test_facilitator_assignable_with_category(self):
        """Facilitator can assign assistant_moderator at exact location+category."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"exists": True})

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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
        with patch(f"{ADMIN}.get_location_ancestors", return_value=[]):
            from candid.controllers.admin_controller import _get_requester_authority_location
            result = _get_requester_authority_location(
                ADMIN_USER, "admin", OREGON)
            assert result is None


# ---------------------------------------------------------------------------
# _find_approval_peer
# ---------------------------------------------------------------------------

class TestFindApprovalPeer:
    def test_admin_assignable_finds_peer_admin(self):
        """For admin/moderator/facilitator assignment, find peer admin at authority location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": PEER_ADMIN}
        ])

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
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

        with patch(f"{ADMIN}.db", mock_db):
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


# ---------------------------------------------------------------------------
# _apply_role_change
# ---------------------------------------------------------------------------

class TestApplyRoleChange:
    def test_assign_inserts_new_role(self):
        """Assignment creates a new user_role row when none exists."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # no existing role (SELECT returns None)
            None,  # INSERT
        ])

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.uuid.uuid4", return_value="new-role-id"):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db), \
             patch(f"{ADMIN}.uuid.uuid4", return_value="new-role-id"):
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
# _check_auto_approve_expired
# ---------------------------------------------------------------------------

class TestCheckAutoApproveExpired:
    def test_runs_update_query(self):
        """Calls UPDATE to auto-approve expired pending requests."""
        mock_db = MagicMock()

        with patch(f"{ADMIN}.db", mock_db):
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

        with patch(f"{ADMIN}.db", mock_db):
            from candid.controllers.admin_controller import _check_auto_approve_expired
            _check_auto_approve_expired()
            _check_auto_approve_expired()

            assert mock_db.execute_query.call_count == 2

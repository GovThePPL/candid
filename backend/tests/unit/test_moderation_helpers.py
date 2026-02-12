"""Unit tests for moderation_controller.py — hierarchical appeal routing helpers."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit

# Module paths for patching
MOD = "candid.controllers.moderation_controller"
MOD_HELPERS = "candid.controllers.helpers.moderation"
AUTH = "candid.controllers.helpers.auth"

# Test location UUIDs
US_ROOT = "f1a2b3c4-d5e6-7890-abcd-ef1234567890"
OREGON = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"
PORTLAND = "d3c4b5a6-f7e8-9012-cdef-123456789012"
HEALTHCARE_CAT = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"

# Test user UUIDs
ADMIN_USER = "aaa00000-0000-0000-0000-000000000001"
MOD_USER = "bbb00000-0000-0000-0000-000000000002"
FACILITATOR_USER = "ccc00000-0000-0000-0000-000000000003"
ASST_MOD_USER = "ddd00000-0000-0000-0000-000000000004"
NORMAL_USER = "eee00000-0000-0000-0000-000000000005"
PEER_MOD_USER = "fff00000-0000-0000-0000-000000000006"

REPORT_ID = "rrr00000-0000-0000-0000-000000000001"
POSITION_ID = "ppp00000-0000-0000-0000-000000000001"
MOD_ACTION_ID = "mmm00000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _clear_caches():
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


# ---------------------------------------------------------------------------
# _get_reported_user_role  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestGetReportedUserRole:
    def test_position_creator_is_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": ADMIN_USER},  # position lookup
            {"role": "admin"},                 # user_role lookup
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("position", POSITION_ID) == "admin"

    def test_position_creator_is_normal(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": NORMAL_USER},
            None,  # no admin/moderator role
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("position", POSITION_ID) == "normal"

    def test_chat_log_highest_role_wins(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            # chat_log lookup
            {"initiator_user_id": NORMAL_USER, "position_holder_user_id": MOD_USER},
            None,           # normal user has no admin/moderator role
            {"role": "moderator"},  # mod user is moderator
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("chat_log", "chat-id-1") == "moderator"

    def test_unknown_target_type_returns_normal(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("unknown", "id-1") == "normal"


# ---------------------------------------------------------------------------
# _get_content_scope  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestGetContentScope:
    def test_position_report_returns_scope(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "position", "target_object_id": POSITION_ID},
            {"location_id": OREGON, "category_id": HEALTHCARE_CAT},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc == OREGON
            assert cat == HEALTHCARE_CAT

    def test_missing_report_returns_none(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope("nonexistent")
            assert loc is None
            assert cat is None

    def test_position_with_no_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "position", "target_object_id": POSITION_ID},
            {"location_id": None, "category_id": None},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc is None
            assert cat is None

    def test_chat_log_report_derives_from_position(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "chat_log", "target_object_id": "chat-1"},
            {"location_id": PORTLAND, "category_id": HEALTHCARE_CAT},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc == PORTLAND
            assert cat == HEALTHCARE_CAT


# ---------------------------------------------------------------------------
# _determine_actioner_role_level  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestDetermineActionerRoleLevel:
    def test_returns_role_from_location_scope(self):
        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value="moderator"):
            from candid.controllers.moderation_controller import _determine_actioner_role_level
            assert _determine_actioner_role_level(MOD_USER, OREGON, HEALTHCARE_CAT) == "moderator"

    def test_fallback_to_any_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"role": "facilitator"})

        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value=None), \
             patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _determine_actioner_role_level
            assert _determine_actioner_role_level(FACILITATOR_USER, None, None) == "facilitator"

    def test_no_role_returns_none(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value=None), \
             patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _determine_actioner_role_level
            assert _determine_actioner_role_level(NORMAL_USER, None, None) is None


# ---------------------------------------------------------------------------
# _find_appeal_reviewers  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestFindAppealReviewers:
    def test_asst_mod_routes_to_facilitator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": FACILITATOR_USER}
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers(
                "assistant_moderator", OREGON, HEALTHCARE_CAT, ASST_MOD_USER)
            assert FACILITATOR_USER in result

    def test_asst_mod_falls_through_to_moderator(self):
        """If no facilitator, falls through to moderator."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no facilitator
            [{"user_id": MOD_USER}],  # moderator found
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers(
                "assistant_moderator", OREGON, HEALTHCARE_CAT, ASST_MOD_USER)
            assert MOD_USER in result

    def test_facilitator_routes_to_moderator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"user_id": MOD_USER}])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers(
                "facilitator", OREGON, HEALTHCARE_CAT, FACILITATOR_USER)
            assert MOD_USER in result

    def test_moderator_routes_to_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"user_id": ADMIN_USER}])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers("moderator", OREGON, None, MOD_USER)
            assert ADMIN_USER in result

    def test_moderator_no_admin_returns_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers("moderator", OREGON, None, MOD_USER)
            assert result == []

    def test_excludes_actioner(self):
        mock_db = MagicMock()
        # Only the actioner has the role
        mock_db.execute_query = MagicMock(return_value=[{"user_id": MOD_USER}])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            # Exclude MOD_USER (the actioner)
            result = _find_appeal_reviewers("facilitator", OREGON, None, MOD_USER)
            # MOD_USER should be excluded
            assert MOD_USER not in result

    def test_admin_routes_to_parent_location_admin(self):
        """Admin at Oregon should route to admin at US root."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"location_id": OREGON}],    # actioner's admin locations in ancestry
            [{"user_id": "root-admin"}],  # admin at parent location
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", side_effect=[
                 [OREGON, US_ROOT],   # content ancestors
                 [OREGON, US_ROOT],   # actioner's admin location ancestors
             ]):
            from candid.controllers.moderation_controller import _find_appeal_reviewers
            result = _find_appeal_reviewers("admin", OREGON, None, ADMIN_USER)
            assert "root-admin" in result

    def test_no_content_loc_returns_empty(self):
        from candid.controllers.moderation_controller import _find_appeal_reviewers
        assert _find_appeal_reviewers("moderator", None, None, MOD_USER) == []


# ---------------------------------------------------------------------------
# _find_peer_reviewers  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestFindPeerReviewers:
    def test_moderator_finds_peer_moderator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"user_id": PEER_MOD_USER}])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_peer_reviewers
            result = _find_peer_reviewers("moderator", OREGON, None, MOD_USER)
            assert PEER_MOD_USER in result
            assert MOD_USER not in result

    def test_facilitator_finds_peer_facilitator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": "peer-facilitator"}
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _find_peer_reviewers
            result = _find_peer_reviewers(
                "facilitator", OREGON, HEALTHCARE_CAT, FACILITATOR_USER)
            assert "peer-facilitator" in result

    def test_no_peers_falls_through_to_next_tier(self):
        """If no peer moderator, falls through to _find_appeal_reviewers (admin)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no peer moderators
            [{"user_id": ADMIN_USER}],  # admin found (from _find_appeal_reviewers)
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[OREGON, US_ROOT]):
            from candid.controllers.moderation_controller import _find_peer_reviewers
            result = _find_peer_reviewers("moderator", OREGON, None, MOD_USER)
            assert ADMIN_USER in result

    def test_admin_finds_peer_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"user_id": "peer-admin"}])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_location_ancestors", return_value=[US_ROOT]):
            from candid.controllers.moderation_controller import _find_peer_reviewers
            result = _find_peer_reviewers("admin", US_ROOT, None, ADMIN_USER)
            assert "peer-admin" in result


# ---------------------------------------------------------------------------
# _can_review_appeal_at_scope  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestCanReviewAppealAtScope:
    def test_moderator_can_review_facilitator_action(self):
        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value="moderator"):
            from candid.controllers.moderation_controller import _can_review_appeal_at_scope
            assert _can_review_appeal_at_scope(
                MOD_USER, OREGON, HEALTHCARE_CAT, "facilitator") is True

    def test_facilitator_cannot_review_moderator_action(self):
        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value="facilitator"):
            from candid.controllers.moderation_controller import _can_review_appeal_at_scope
            assert _can_review_appeal_at_scope(
                FACILITATOR_USER, OREGON, HEALTHCARE_CAT, "moderator") is False

    def test_same_tier_cannot_review(self):
        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value="moderator"):
            from candid.controllers.moderation_controller import _can_review_appeal_at_scope
            assert _can_review_appeal_at_scope(
                MOD_USER, OREGON, None, "moderator") is False

    def test_admin_can_review_any_lower_tier(self):
        with patch(f"{MOD_HELPERS}.get_highest_role_at_location", return_value="admin"):
            from candid.controllers.moderation_controller import _can_review_appeal_at_scope
            assert _can_review_appeal_at_scope(
                ADMIN_USER, OREGON, None, "assistant_moderator") is True

    def test_invalid_actioner_level(self):
        from candid.controllers.moderation_controller import _can_review_appeal_at_scope
        assert _can_review_appeal_at_scope(
            MOD_USER, OREGON, None, "expert") is False

    def test_no_content_location(self):
        from candid.controllers.moderation_controller import _can_review_appeal_at_scope
        assert _can_review_appeal_at_scope(
            MOD_USER, None, None, "facilitator") is False


# ---------------------------------------------------------------------------
# _should_show_escalated_appeal  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestShouldShowEscalatedAppeal:
    def test_shows_to_next_tier_reviewer(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "report_id": REPORT_ID, "responder_user_id": MOD_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_content_scope", return_value=(OREGON, HEALTHCARE_CAT)), \
             patch(f"{MOD_HELPERS}.determine_actioner_role_level", return_value="moderator"), \
             patch(f"{MOD_HELPERS}.find_appeal_reviewers", return_value=[ADMIN_USER]):
            from candid.controllers.moderation_controller import _should_show_escalated_appeal
            assert _should_show_escalated_appeal(
                {"mod_action_id": MOD_ACTION_ID}, ADMIN_USER) is True

    def test_hides_from_non_reviewer(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "report_id": REPORT_ID, "responder_user_id": MOD_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_content_scope", return_value=(OREGON, HEALTHCARE_CAT)), \
             patch(f"{MOD_HELPERS}.determine_actioner_role_level", return_value="moderator"), \
             patch(f"{MOD_HELPERS}.find_appeal_reviewers", return_value=[ADMIN_USER]):
            from candid.controllers.moderation_controller import _should_show_escalated_appeal
            assert _should_show_escalated_appeal(
                {"mod_action_id": MOD_ACTION_ID}, NORMAL_USER) is False

    def test_missing_mod_action_returns_false(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _should_show_escalated_appeal
            assert _should_show_escalated_appeal(
                {"mod_action_id": "bad-id"}, ADMIN_USER) is False

    def test_no_scope_fallback_to_admin_check(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "report_id": REPORT_ID, "responder_user_id": MOD_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_content_scope", return_value=(None, None)), \
             patch(f"{MOD_HELPERS}.determine_actioner_role_level", return_value=None), \
             patch(f"{MOD_HELPERS}.is_admin_anywhere", return_value=True):
            from candid.controllers.moderation_controller import _should_show_escalated_appeal
            assert _should_show_escalated_appeal(
                {"mod_action_id": MOD_ACTION_ID}, ADMIN_USER) is True


# ---------------------------------------------------------------------------
# _should_show_appeal_to_reviewer  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestShouldShowAppealToReviewer:
    def test_not_shown_to_original_actioner(self):
        from candid.controllers.moderation_controller import _should_show_appeal_to_reviewer
        appeal_data = {"originalAction": {"responder": {"id": MOD_USER}}}
        assert _should_show_appeal_to_reviewer(
            appeal_data, MOD_USER, {"mod_action_id": MOD_ACTION_ID}) is False

    def test_shown_to_peer_reviewer(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "report_id": REPORT_ID, "responder_user_id": MOD_USER
        })

        appeal_data = {"originalAction": {"responder": {"id": MOD_USER}}}

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_content_scope", return_value=(OREGON, None)), \
             patch(f"{MOD_HELPERS}.determine_actioner_role_level", return_value="moderator"), \
             patch(f"{MOD_HELPERS}.find_peer_reviewers", return_value=[PEER_MOD_USER]):
            from candid.controllers.moderation_controller import _should_show_appeal_to_reviewer
            assert _should_show_appeal_to_reviewer(
                appeal_data, PEER_MOD_USER,
                {"mod_action_id": MOD_ACTION_ID}) is True

    def test_hidden_from_non_peer(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "report_id": REPORT_ID, "responder_user_id": MOD_USER
        })

        appeal_data = {"originalAction": {"responder": {"id": MOD_USER}}}

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.get_content_scope", return_value=(OREGON, None)), \
             patch(f"{MOD_HELPERS}.determine_actioner_role_level", return_value="moderator"), \
             patch(f"{MOD_HELPERS}.find_peer_reviewers", return_value=[PEER_MOD_USER]):
            from candid.controllers.moderation_controller import _should_show_appeal_to_reviewer
            assert _should_show_appeal_to_reviewer(
                appeal_data, NORMAL_USER,
                {"mod_action_id": MOD_ACTION_ID}) is False

    def test_fallback_when_no_mod_action(self):
        """If mod_action_id is missing, fallback to show to any reviewer."""
        from candid.controllers.moderation_controller import _should_show_appeal_to_reviewer
        appeal_data = {"originalAction": {"responder": {"id": MOD_USER}}}
        assert _should_show_appeal_to_reviewer(
            appeal_data, PEER_MOD_USER, {}) is True

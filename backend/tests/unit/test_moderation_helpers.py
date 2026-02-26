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

    def test_post_creator_is_moderator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": MOD_USER},  # post lookup
            {"role": "moderator"},           # user_role lookup
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("post", "post-1") == "moderator"

    def test_post_creator_is_normal(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": NORMAL_USER},
            None,  # no privileged role
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("post", "post-1") == "normal"

    def test_comment_author_is_facilitator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": FACILITATOR_USER},  # comment lookup
            {"role": "facilitator"},         # user_role lookup
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("comment", "comment-1") == "facilitator"

    def test_comment_author_is_normal(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"creator_user_id": NORMAL_USER},
            None,
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_reported_user_role
            assert _get_reported_user_role("comment", "comment-1") == "normal"


# ---------------------------------------------------------------------------
# _get_content_scope  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestGetContentScope:
    def test_position_report_returns_scope(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "position", "target_object_id": POSITION_ID},
            {"location_id": OREGON, "session_id": HEALTHCARE_CAT},
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
            {"location_id": None, "session_id": None},
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
            {"location_id": PORTLAND, "session_id": HEALTHCARE_CAT},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc == PORTLAND
            assert cat == HEALTHCARE_CAT

    def test_post_report_returns_scope(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "post", "target_object_id": "post-1"},
            {"location_id": OREGON, "session_id": HEALTHCARE_CAT},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc == OREGON
            assert cat == HEALTHCARE_CAT

    def test_comment_report_derives_from_parent_post(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"target_object_type": "comment", "target_object_id": "comment-1"},
            {"location_id": PORTLAND, "session_id": HEALTHCARE_CAT},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope
            loc, cat = _get_content_scope(REPORT_ID)
            assert loc == PORTLAND
            assert cat == HEALTHCARE_CAT


# ---------------------------------------------------------------------------
# _get_content_scope_direct  (extracted to helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestGetContentScopeDirect:
    def test_position_direct_scope(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"location_id": OREGON, "session_id": HEALTHCARE_CAT})

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope_direct
            loc, cat = _get_content_scope_direct("position", POSITION_ID)
            assert loc == OREGON
            assert cat == HEALTHCARE_CAT

    def test_post_direct_scope(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"location_id": PORTLAND, "session_id": HEALTHCARE_CAT})

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope_direct
            loc, cat = _get_content_scope_direct("post", "post-1")
            assert loc == PORTLAND
            assert cat == HEALTHCARE_CAT

    def test_comment_direct_scope_derives_from_post(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"location_id": OREGON, "session_id": HEALTHCARE_CAT})

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope_direct
            loc, cat = _get_content_scope_direct("comment", "comment-1")
            assert loc == OREGON
            assert cat == HEALTHCARE_CAT

    def test_unknown_type_returns_none(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope_direct
            loc, cat = _get_content_scope_direct("unknown", "id-1")
            assert loc is None
            assert cat is None

    def test_missing_record_returns_none(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.moderation_controller import _get_content_scope_direct
            loc, cat = _get_content_scope_direct("post", "nonexistent")
            assert loc is None
            assert cat is None


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


# ---------------------------------------------------------------------------
# get_target_content  (helpers/moderation.py)
# ---------------------------------------------------------------------------

POST_ID = "ddd00000-0000-0000-0000-000000000010"
COMMENT_ID = "ddd00000-0000-0000-0000-000000000011"

FAKE_USER_INFO = {
    'id': str(NORMAL_USER),
    'username': 'testuser',
    'displayName': 'Test User',
    'status': 'active',
    'kudosCount': 0,
    'trustScore': None,
    'avatarUrl': None,
    'avatarIconUrl': None,
}


class TestGetTargetContent:
    def test_post_returns_id_status_and_content(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {
                'id': POST_ID,
                'title': 'Test Post',
                'body': 'Post body text',
                'status': 'active',
                'creator_user_id': NORMAL_USER,
                'session_id': HEALTHCARE_CAT,
                'session_label': 'Healthcare',
                'location_id': OREGON,
                'location_name': 'Oregon',
                'location_code': 'OR',
            },
            # get_user_info query
            {
                'id': NORMAL_USER, 'username': 'testuser',
                'display_name': 'Test User', 'status': 'active',
                'trust_score': None, 'kudos_count': 0,
                'avatar_url': None, 'avatar_icon_url': None,
            },
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_content
            result = get_target_content('post', POST_ID)
            assert result is not None
            assert result['type'] == 'post'
            assert result['id'] == str(POST_ID)
            assert result['status'] == 'active'
            assert result['title'] == 'Test Post'
            assert result['body'] == 'Post body text'
            assert result['session']['label'] == 'Healthcare'
            assert result['location']['code'] == 'OR'
            assert result['creator'] is not None

    def test_comment_returns_post_id_and_status(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {
                'id': COMMENT_ID,
                'body': 'Comment body',
                'status': 'removed',
                'creator_user_id': NORMAL_USER,
                'post_id': POST_ID,
                'post_title': 'Parent Post',
            },
            # get_user_info query
            {
                'id': NORMAL_USER, 'username': 'testuser',
                'display_name': 'Test User', 'status': 'active',
                'trust_score': None, 'kudos_count': 0,
                'avatar_url': None, 'avatar_icon_url': None,
            },
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_content
            result = get_target_content('comment', COMMENT_ID)
            assert result is not None
            assert result['type'] == 'comment'
            assert result['id'] == str(COMMENT_ID)
            assert result['status'] == 'removed'
            assert result['postId'] == str(POST_ID)
            assert result['postTitle'] == 'Parent Post'
            assert result['body'] == 'Comment body'
            assert result['creator'] is not None

    def test_position_unchanged(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {
                'id': POSITION_ID,
                'statement': 'Test position',
                'creator_user_id': NORMAL_USER,
                'session_id': HEALTHCARE_CAT,
                'session_label': 'Healthcare',
                'location_id': OREGON,
                'location_name': 'Oregon',
                'location_code': 'OR',
            },
            # get_user_info query
            {
                'id': NORMAL_USER, 'username': 'testuser',
                'display_name': 'Test User', 'status': 'active',
                'trust_score': None, 'kudos_count': 0,
                'avatar_url': None, 'avatar_icon_url': None,
            },
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_content
            result = get_target_content('position', POSITION_ID)
            assert result is not None
            assert result['type'] == 'position'
            assert result['statement'] == 'Test position'
            assert result['session']['label'] == 'Healthcare'
            assert result['location']['code'] == 'OR'

    def test_unknown_type_returns_none(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_content
            result = get_target_content('unknown', 'some-id')
            assert result is None


# ---------------------------------------------------------------------------
# get_reported_user_ids  (helpers/moderation.py)
# ---------------------------------------------------------------------------

CHAT_LOG_ID = "ccc00000-0000-0000-0000-000000000010"
INITIATOR_USER = "eee00000-0000-0000-0000-000000000010"
HOLDER_USER = "eee00000-0000-0000-0000-000000000011"
CREATOR_USER = "eee00000-0000-0000-0000-000000000012"


class TestGetReportedUserIds:
    def test_position_returns_creator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("position", POSITION_ID)
            assert result == [str(CREATOR_USER)]

    def test_position_missing_returns_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("position", "nonexistent")
            assert result == []

    def test_chat_log_returns_both_participants(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "initiator_user_id": INITIATOR_USER,
            "position_holder_user_id": HOLDER_USER,
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("chat_log", CHAT_LOG_ID)
            assert result == [str(INITIATOR_USER), str(HOLDER_USER)]

    def test_chat_log_missing_returns_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("chat_log", "nonexistent")
            assert result == []

    def test_post_returns_author(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("post", POST_ID)
            assert result == [str(CREATOR_USER)]

    def test_comment_returns_author(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("comment", COMMENT_ID)
            assert result == [str(CREATOR_USER)]

    def test_unknown_type_returns_empty(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("unknown", "some-id")
            assert result == []

    def test_position_null_creator_returns_empty(self):
        """Position exists but creator_user_id is null."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": None
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_reported_user_ids
            result = get_reported_user_ids("position", POSITION_ID)
            assert result == []


# ---------------------------------------------------------------------------
# reverse_mod_action  (helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestReverseModAction:
    def test_reverses_permanent_ban(self):
        """Permanent ban reversal sets user status back to 'active'."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            # Initial query fetching action targets
            [{
                "action": "permanent_ban",
                "user_id": NORMAL_USER,
                "class": "submitter",
                "target_object_type": "position",
                "target_object_id": POSITION_ID,
            }],
            # UPDATE users SET status = 'active'
            None,
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache") as mock_invalidate:
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            # Verify the ban was reversed (UPDATE users)
            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 2
            update_call = calls[1]
            assert "UPDATE users SET status = 'active'" in update_call[0][0]
            assert update_call[0][1] == (NORMAL_USER,)

            # Verify ban cache was invalidated
            mock_invalidate.assert_called_once_with(NORMAL_USER)

    def test_reverses_temporary_ban(self):
        """Temporary ban reversal also sets user status back to 'active'."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{
                "action": "temporary_ban",
                "user_id": MOD_USER,
                "class": "reporter",
                "target_object_type": "post",
                "target_object_id": POST_ID,
            }],
            None,  # UPDATE users
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache") as mock_invalidate:
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 2
            update_call = calls[1]
            assert "UPDATE users SET status = 'active'" in update_call[0][0]
            assert update_call[0][1] == (MOD_USER,)
            mock_invalidate.assert_called_once_with(MOD_USER)

    def test_reverses_position_removal(self):
        """Content removal for position restores position and user_position."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{
                "action": "removed",
                "user_id": NORMAL_USER,
                "class": "submitter",
                "target_object_type": "position",
                "target_object_id": POSITION_ID,
            }],
            None,  # UPDATE position SET status = 'active'
            None,  # UPDATE user_position SET status = 'active'
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache"):
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 3
            # First UPDATE: position
            assert "UPDATE position SET status = 'active'" in calls[1][0][0]
            assert calls[1][0][1] == (POSITION_ID,)
            # Second UPDATE: user_position
            assert "UPDATE user_position SET status = 'active'" in calls[2][0][0]
            assert calls[2][0][1] == (POSITION_ID,)

    def test_reverses_post_removal(self):
        """Content removal for post restores post status."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{
                "action": "removed",
                "user_id": NORMAL_USER,
                "class": "submitter",
                "target_object_type": "post",
                "target_object_id": POST_ID,
            }],
            None,  # UPDATE post SET status = 'active'
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache"):
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 2
            assert "UPDATE post SET status = 'active'" in calls[1][0][0]
            assert calls[1][0][1] == (POST_ID,)

    def test_reverses_comment_removal(self):
        """Content removal for comment restores comment status."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{
                "action": "removed",
                "user_id": NORMAL_USER,
                "class": "submitter",
                "target_object_type": "comment",
                "target_object_id": COMMENT_ID,
            }],
            None,  # UPDATE comment SET status = 'active'
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache"):
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 2
            assert "UPDATE comment SET status = 'active'" in calls[1][0][0]
            assert calls[1][0][1] == (COMMENT_ID,)

    def test_no_targets_does_nothing(self):
        """When no action targets are found, nothing is updated."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache") as mock_invalidate:
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            # Only the initial SELECT query should have been called
            assert mock_db.execute_query.call_count == 1
            mock_invalidate.assert_not_called()

    def test_reverses_ban_and_removal_together(self):
        """Multiple action classes are reversed independently."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [
                {
                    "action": "permanent_ban",
                    "user_id": NORMAL_USER,
                    "class": "submitter",
                    "target_object_type": "post",
                    "target_object_id": POST_ID,
                },
                {
                    "action": "removed",
                    "user_id": NORMAL_USER,
                    "class": "submitter",
                    "target_object_type": "post",
                    "target_object_id": POST_ID,
                },
            ],
            None,  # UPDATE users (ban reversal)
            None,  # UPDATE post (content removal reversal)
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db), \
             patch(f"{MOD_HELPERS}.invalidate_ban_cache") as mock_invalidate:
            from candid.controllers.helpers.moderation import reverse_mod_action
            reverse_mod_action(MOD_ACTION_ID)

            calls = mock_db.execute_query.call_args_list
            assert len(calls) == 3
            assert "UPDATE users SET status = 'active'" in calls[1][0][0]
            assert "UPDATE post SET status = 'active'" in calls[2][0][0]
            mock_invalidate.assert_called_once_with(NORMAL_USER)


# ---------------------------------------------------------------------------
# get_target_users  (helpers/moderation.py)
# ---------------------------------------------------------------------------

class TestGetTargetUsers:
    # --- submitter class ---

    def test_submitter_position_returns_creator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "position", POSITION_ID)
            assert result == [str(CREATOR_USER)]

    def test_submitter_post_returns_author(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "post", POST_ID)
            assert result == [str(CREATOR_USER)]

    def test_submitter_comment_returns_author(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "comment", COMMENT_ID)
            assert result == [str(CREATOR_USER)]

    def test_submitter_chat_log_returns_both_participants(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "initiator_user_id": INITIATOR_USER,
            "position_holder_user_id": HOLDER_USER,
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "chat_log", CHAT_LOG_ID)
            assert result == [str(INITIATOR_USER), str(HOLDER_USER)]

    # --- active_adopter / passive_adopter classes ---

    def test_active_adopter_position_returns_active_user_positions(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": NORMAL_USER},
            {"user_id": CREATOR_USER},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("active_adopter", "position", POSITION_ID)
            assert str(NORMAL_USER) in result
            assert str(CREATOR_USER) in result
            assert len(result) == 2

    def test_passive_adopter_position_returns_non_active_user_positions(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"user_id": HOLDER_USER},
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("passive_adopter", "position", POSITION_ID)
            assert result == [str(HOLDER_USER)]

    def test_active_adopter_chat_log_returns_empty(self):
        """Chat logs don't have adopters."""
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("active_adopter", "chat_log", CHAT_LOG_ID)
            assert result == []

    # --- reporter class ---

    def test_reporter_returns_report_submitter(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "submitter_user_id": NORMAL_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("reporter", "position", POSITION_ID, report_id=REPORT_ID)
            assert result == [str(NORMAL_USER)]

    def test_reporter_without_report_id_returns_empty(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("reporter", "position", POSITION_ID)
            assert result == []

    # --- reported class ---

    def test_reported_position_returns_creator(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": CREATOR_USER
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("reported", "position", POSITION_ID, report_id=REPORT_ID)
            assert result == [str(CREATOR_USER)]

    def test_reported_chat_log_returns_non_reporter_participant(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            # report lookup for submitter
            {"submitter_user_id": INITIATOR_USER},
            # chat_log lookup for participants
            {
                "initiator_user_id": INITIATOR_USER,
                "position_holder_user_id": HOLDER_USER,
            },
        ])

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("reported", "chat_log", CHAT_LOG_ID, report_id=REPORT_ID)
            assert result == [str(HOLDER_USER)]
            assert str(INITIATOR_USER) not in result

    def test_reported_without_report_id_returns_empty(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("reported", "position", POSITION_ID)
            assert result == []

    # --- unknown type / class ---

    def test_unknown_content_type_returns_empty(self):
        mock_db = MagicMock()
        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "unknown_type", "some-id")
            assert result == []

    def test_submitter_position_null_creator_returns_empty(self):
        """Position exists but creator_user_id is null."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={
            "creator_user_id": None
        })

        with patch(f"{MOD_HELPERS}.db", mock_db):
            from candid.controllers.helpers.moderation import get_target_users
            result = get_target_users("submitter", "position", POSITION_ID)
            assert result == []

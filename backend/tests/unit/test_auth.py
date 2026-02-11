"""Unit tests for auth.py — hierarchical role system, authorization, ban checking."""

import pytest
from unittest.mock import patch, MagicMock, call
from datetime import datetime, timezone, timedelta

pytestmark = pytest.mark.unit

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

US_ROOT = "f1a2b3c4-d5e6-7890-abcd-ef1234567890"
OREGON = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"
MULTNOMAH = "c2b3a4d5-e6f7-8901-bcde-f12345678901"
PORTLAND = "d3c4b5a6-f7e8-9012-cdef-123456789012"
HEALTHCARE_CAT = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"

# Ancestry chains (self, parent, ..., root) for easy mocking
PORTLAND_ANCESTORS = [PORTLAND, MULTNOMAH, OREGON, US_ROOT]
OREGON_ANCESTORS = [OREGON, US_ROOT]
US_ANCESTORS = [US_ROOT]


@pytest.fixture(autouse=True)
def _clear_caches():
    """Clear location caches before each test."""
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


# ---------------------------------------------------------------------------
# user_type ranking (only guest vs normal now)
# ---------------------------------------------------------------------------

class TestRoleRanking:
    def test_guest_is_lowest(self):
        from candid.controllers.helpers.auth import _USER_ROLE_RANKING
        assert _USER_ROLE_RANKING["guest"] < _USER_ROLE_RANKING["normal"]

    def test_only_two_user_types(self):
        from candid.controllers.helpers.auth import _USER_ROLE_RANKING
        assert set(_USER_ROLE_RANKING.keys()) == {"guest", "normal"}


# ---------------------------------------------------------------------------
# Scoped role hierarchy
# ---------------------------------------------------------------------------

class TestScopedRoleHierarchy:
    def test_admin_only_satisfied_by_admin(self):
        from candid.controllers.helpers.auth import _SCOPED_ROLE_HIERARCHY
        assert _SCOPED_ROLE_HIERARCHY["admin"] == {"admin"}

    def test_moderator_satisfied_by_admin_or_moderator(self):
        from candid.controllers.helpers.auth import _SCOPED_ROLE_HIERARCHY
        assert _SCOPED_ROLE_HIERARCHY["moderator"] == {"admin", "moderator"}

    def test_facilitator_satisfied_by_admin_moderator_facilitator(self):
        from candid.controllers.helpers.auth import _SCOPED_ROLE_HIERARCHY
        assert _SCOPED_ROLE_HIERARCHY["facilitator"] == {"admin", "moderator", "facilitator"}

    def test_assistant_moderator_hierarchy(self):
        from candid.controllers.helpers.auth import _SCOPED_ROLE_HIERARCHY
        assert "admin" in _SCOPED_ROLE_HIERARCHY["assistant_moderator"]
        assert "moderator" in _SCOPED_ROLE_HIERARCHY["assistant_moderator"]
        assert "facilitator" in _SCOPED_ROLE_HIERARCHY["assistant_moderator"]
        assert "assistant_moderator" in _SCOPED_ROLE_HIERARCHY["assistant_moderator"]

    def test_expert_not_satisfied_by_liaison(self):
        from candid.controllers.helpers.auth import _SCOPED_ROLE_HIERARCHY
        assert "liaison" not in _SCOPED_ROLE_HIERARCHY["expert"]
        assert "expert" not in _SCOPED_ROLE_HIERARCHY["liaison"]


# ---------------------------------------------------------------------------
# Location tree helpers
# ---------------------------------------------------------------------------

class TestLocationAncestors:
    def test_returns_self_and_parents(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"id": PORTLAND}, {"id": MULTNOMAH}, {"id": OREGON}, {"id": US_ROOT}
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_location_ancestors
            result = get_location_ancestors(PORTLAND)
            assert result == [PORTLAND, MULTNOMAH, OREGON, US_ROOT]

    def test_root_has_only_self(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"id": US_ROOT}])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_location_ancestors
            result = get_location_ancestors(US_ROOT)
            assert result == [US_ROOT]

    def test_caching(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"id": OREGON}, {"id": US_ROOT}])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_location_ancestors
            result1 = get_location_ancestors(OREGON)
            result2 = get_location_ancestors(OREGON)
            assert result1 == result2
            # DB should only be called once
            assert mock_db.execute_query.call_count == 1


class TestLocationDescendants:
    def test_returns_self_and_children(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"id": OREGON}, {"id": MULTNOMAH}, {"id": PORTLAND}
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_location_descendants
            result = get_location_descendants(OREGON)
            assert OREGON in result
            assert MULTNOMAH in result
            assert PORTLAND in result


class TestRootLocation:
    def test_finds_root(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"id": US_ROOT})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_root_location_id
            assert get_root_location_id() == US_ROOT


# ---------------------------------------------------------------------------
# Hierarchical authority checks
# ---------------------------------------------------------------------------

class TestIsAdminAtLocation:
    def test_admin_at_exact_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors
            {"1": 1},  # admin role found
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_admin_at_location
            assert is_admin_at_location("user-1", OREGON) is True

    def test_admin_at_ancestor_covers_descendant(self):
        """Admin at US root should cover Portland (inherits down)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": PORTLAND}, {"id": MULTNOMAH}, {"id": OREGON}, {"id": US_ROOT}],  # ancestors
            {"1": 1},  # admin role found at ancestor
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_admin_at_location
            assert is_admin_at_location("user-1", PORTLAND) is True

    def test_admin_at_child_does_not_cover_parent(self):
        """Admin at Portland should NOT cover Oregon."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors of Oregon
            None,  # no admin role at Oregon or US root
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_admin_at_location
            assert is_admin_at_location("user-1", OREGON) is False


class TestIsModeratorAtLocation:
    def test_moderator_at_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors
            {"1": 1},  # moderator or admin role found
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_moderator_at_location
            assert is_moderator_at_location("user-1", OREGON) is True

    def test_admin_satisfies_moderator_check(self):
        """Admin at a location should also satisfy moderator check."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],
            {"1": 1},  # admin role found (query checks IN ('admin', 'moderator'))
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_moderator_at_location
            assert is_moderator_at_location("user-1", OREGON) is True


class TestIsRootAdmin:
    def test_root_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"id": US_ROOT},        # get_root_location_id
            [{"id": US_ROOT}],      # get_location_ancestors
            {"1": 1},               # admin role found at root
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_root_admin
            assert is_root_admin("user-1") is True

    def test_non_root_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"id": US_ROOT},        # get_root_location_id
            [{"id": US_ROOT}],      # get_location_ancestors
            None,                    # no admin role at root
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_root_admin
            assert is_root_admin("user-1") is False


class TestIsFacilitatorFor:
    def test_facilitator_at_exact_location_category(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_facilitator_for
            assert is_facilitator_for("user-1", OREGON, HEALTHCARE_CAT) is True

    def test_facilitator_does_not_inherit_down(self):
        """Facilitator at Oregon should NOT cover Portland."""
        mock_db = MagicMock()
        # Query for exact location+category returns nothing
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_facilitator_for
            assert is_facilitator_for("user-1", PORTLAND, HEALTHCARE_CAT) is False

    def test_facilitator_any_category_at_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_facilitator_for
            assert is_facilitator_for("user-1", OREGON) is True


# ---------------------------------------------------------------------------
# Role queries
# ---------------------------------------------------------------------------

class TestIsAdminAnywhere:
    def test_has_admin_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_admin_anywhere
            assert is_admin_anywhere("user-1") is True

    def test_no_admin_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_admin_anywhere
            assert is_admin_anywhere("user-1") is False


class TestIsModeratorAnywhere:
    def test_has_moderator_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_moderator_anywhere
            assert is_moderator_anywhere("user-1") is True

    def test_admin_satisfies_moderator_check(self):
        """Admin role should satisfy is_moderator_anywhere (query checks IN ('admin', 'moderator'))."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_moderator_anywhere
            assert is_moderator_anywhere("user-1") is True

    def test_no_admin_or_moderator_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import is_moderator_anywhere
            assert is_moderator_anywhere("user-1") is False


class TestGetHighestRoleAtLocation:
    def test_admin_is_highest(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors
            {"role": "admin"},  # admin found
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_highest_role_at_location
            assert get_highest_role_at_location("user-1", OREGON) == "admin"

    def test_moderator_when_no_admin(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],
            {"role": "moderator"},  # moderator found (no admin)
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_highest_role_at_location
            assert get_highest_role_at_location("user-1", OREGON) == "moderator"

    def test_facilitator_with_category(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors
            None,  # no admin/moderator
            {"role": "facilitator"},  # facilitator at location+category
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_highest_role_at_location
            assert get_highest_role_at_location("user-1", OREGON, HEALTHCARE_CAT) == "facilitator"

    def test_no_role_at_location(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": OREGON}, {"id": US_ROOT}],
            None,  # no admin/moderator
            None,  # no category-scoped role
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_highest_role_at_location
            assert get_highest_role_at_location("user-1", OREGON) is None


class TestGetUserRoles:
    def test_returns_roles(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"role": "admin", "location_id": US_ROOT, "position_category_id": None},
            {"role": "facilitator", "location_id": OREGON, "position_category_id": HEALTHCARE_CAT},
        ])

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_user_roles
            roles = get_user_roles("user-1")
            assert len(roles) == 2
            assert roles[0]["role"] == "admin"
            assert roles[1]["position_category_id"] == HEALTHCARE_CAT

    def test_no_roles(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import get_user_roles
            assert get_user_roles("user-1") == []


class TestHasAnyScopedRole:
    def test_has_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"1": 1})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import has_any_scoped_role
            assert has_any_scoped_role("user-1") is True

    def test_no_role(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import has_any_scoped_role
            assert has_any_scoped_role("user-1") is False


# ---------------------------------------------------------------------------
# authorization()
# ---------------------------------------------------------------------------

class TestAuthorization:
    def test_no_token_returns_401(self):
        from candid.controllers.helpers.auth import authorization
        ok, err = authorization("normal", token_info=None)
        assert ok is False
        assert err.code == 401

    def test_user_not_found_returns_401(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)
        mock_redis = MagicMock()

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is False
            assert err.code == 401

    def test_guest_cannot_access_normal(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"user_type": "guest"})
        mock_redis = MagicMock()

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is False
            assert err.code == 403

    def test_normal_user_passes_normal_check(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"user_type": "normal"},   # get_user_type
                {"status": "active"},      # _check_ban_status
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("normal", token_info={"sub": "user-123"})
            assert ok is True
            assert err is None

    def test_normal_user_passes_guest_check(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"user_type": "normal"},
                {"status": "active"},
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization
            ok, err = authorization("guest", token_info={"sub": "user-123"})
            assert ok is True


# ---------------------------------------------------------------------------
# authorization_site_admin()
# ---------------------------------------------------------------------------

class TestAuthorizationSiteAdmin:
    def test_no_token(self):
        from candid.controllers.helpers.auth import authorization_site_admin
        ok, err = authorization_site_admin(token_info=None)
        assert ok is False
        assert err.code == 401

    def test_root_admin_passes(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},    # get_user_type
            {"status": "active"},       # _check_ban_status
            {"id": US_ROOT},            # get_root_location_id
            [{"id": US_ROOT}],          # get_location_ancestors
            {"1": 1},                   # admin role at root
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_site_admin
            ok, err = authorization_site_admin(token_info={"sub": "admin-1"})
            assert ok is True

    def test_non_admin_fails(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},    # get_user_type
            {"status": "active"},       # _check_ban_status
            {"id": US_ROOT},            # get_root_location_id
            [{"id": US_ROOT}],          # get_location_ancestors
            None,                       # no admin role at root
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_site_admin
            ok, err = authorization_site_admin(token_info={"sub": "user-1"})
            assert ok is False
            assert err.code == 403


# ---------------------------------------------------------------------------
# authorization_scoped()
# ---------------------------------------------------------------------------

class TestAuthorizationScoped:
    def test_no_token(self):
        from candid.controllers.helpers.auth import authorization_scoped
        ok, err = authorization_scoped("moderator", token_info=None)
        assert ok is False
        assert err.code == 401

    def test_admin_satisfies_moderator_at_location(self):
        """Admin at US root should pass moderator check at Portland."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},       # get_user_type
            {"status": "active"},          # _check_ban_status
            PORTLAND_ANCESTORS_DB,          # get_location_ancestors
            {"1": 1},                      # admin role found
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "moderator", token_info={"sub": "user-1"}, location_id=PORTLAND
            )
            assert ok is True

    def test_moderator_at_ancestor_covers_descendant(self):
        """Moderator at Oregon should pass moderator check at Portland."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},
            {"status": "active"},
            PORTLAND_ANCESTORS_DB,
            None,  # no admin role
            {"1": 1},  # moderator role found at ancestor
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "moderator", token_info={"sub": "user-1"}, location_id=PORTLAND
            )
            assert ok is True

    def test_facilitator_at_location_category(self):
        """Facilitator at Oregon+Healthcare should pass facilitator check."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},
            {"status": "active"},
            [{"id": OREGON}, {"id": US_ROOT}],  # ancestors
            None,  # no admin
            None,  # no moderator
            {"1": 1},  # facilitator role found (with category)
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "facilitator", token_info={"sub": "user-1"},
                location_id=OREGON, category_id=HEALTHCARE_CAT
            )
            assert ok is True

    def test_facilitator_does_not_satisfy_moderator(self):
        """Facilitator should NOT pass moderator check."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},
            {"status": "active"},
            [{"id": OREGON}, {"id": US_ROOT}],
            None,  # no admin
            None,  # no moderator (the only satisfying roles for 'moderator')
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "moderator", token_info={"sub": "user-1"}, location_id=OREGON
            )
            assert ok is False
            assert err.code == 403

    def test_no_location_checks_any_role(self):
        """Without location, authorization_scoped checks if user has role anywhere."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},
            {"status": "active"},
            {"1": 1},  # has satisfying role somewhere
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "moderator", token_info={"sub": "user-1"}
            )
            assert ok is True

    def test_banned_user_rejected(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"user_type": "normal"},
            {"status": "banned"},
            None,  # no active ban record (permanent)
        ])
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import authorization_scoped
            ok, err = authorization_scoped(
                "moderator", token_info={"sub": "user-1"}, location_id=OREGON
            )
            assert ok is False
            assert err.code == 403


# Helper: DB result format for Portland ancestors
PORTLAND_ANCESTORS_DB = [
    {"id": PORTLAND}, {"id": MULTNOMAH}, {"id": OREGON}, {"id": US_ROOT}
]


# ---------------------------------------------------------------------------
# _check_ban_status (unchanged logic)
# ---------------------------------------------------------------------------

class TestCheckBanStatus:
    def test_cached_not_banned(self):
        mock_db = MagicMock()
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value="not_banned")

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False
            assert err is None
            mock_db.execute_query.assert_not_called()

    def test_active_user_not_banned(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"status": "active"})
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False
            mock_redis.setex.assert_called()

    def test_permanently_banned(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},
                {"action_end_time": None},
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is True
            assert err.code == 403

    def test_expired_temp_ban_restores_user(self):
        past_time = datetime.now(timezone.utc) - timedelta(hours=1)
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},
                {"action_end_time": past_time},
                None,  # UPDATE
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False

    def test_active_temp_ban(self):
        future_time = datetime.now(timezone.utc) + timedelta(hours=24)
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                {"status": "banned"},
                {"action_end_time": future_time},
            ]
        )
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is True

    def test_redis_failure_falls_through(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"status": "active"})
        mock_redis = MagicMock()
        mock_redis.get = MagicMock(side_effect=Exception("Redis down"))

        with patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import _check_ban_status
            is_banned, err = _check_ban_status("user-123")
            assert is_banned is False


# ---------------------------------------------------------------------------
# invalidate_ban_cache
# ---------------------------------------------------------------------------

class TestInvalidateBanCache:
    def test_deletes_key(self):
        mock_redis = MagicMock()
        with patch("candid.controllers.helpers.auth.get_redis", return_value=mock_redis):
            from candid.controllers.helpers.auth import invalidate_ban_cache
            invalidate_ban_cache("user-123")
            mock_redis.delete.assert_called_once_with("ban_status:user-123")

    def test_redis_failure_silent(self):
        with patch("candid.controllers.helpers.auth.get_redis", side_effect=Exception("fail")):
            from candid.controllers.helpers.auth import invalidate_ban_cache
            invalidate_ban_cache("user-123")


# ---------------------------------------------------------------------------
# authorization_allow_banned
# ---------------------------------------------------------------------------

class TestAuthorizationAllowBanned:
    def test_banned_user_still_authorized(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"user_type": "normal"})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import authorization_allow_banned
            ok, err = authorization_allow_banned("normal", token_info={"sub": "user-123"})
            assert ok is True
            assert err is None

    def test_guest_cannot_access_normal(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"user_type": "guest"})

        with patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.auth import authorization_allow_banned
            ok, err = authorization_allow_banned("normal", token_info={"sub": "user-123"})
            assert ok is False
            assert err.code == 403

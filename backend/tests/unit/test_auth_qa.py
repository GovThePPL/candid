"""Unit tests for has_qa_authority() in auth.py."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit

OREGON = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"
US_ROOT = "f1a2b3c4-d5e6-7890-abcd-ef1234567890"
HEALTHCARE_CAT = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"
ECONOMY_CAT = "63e233e9-187e-441f-a7a9-f5f44dffadf0"

USER_A = "aaaa0000-0000-0000-0000-000000000001"

OREGON_ANCESTORS = [OREGON, US_ROOT]


@pytest.fixture(autouse=True)
def _clear_caches():
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


def _make_mock(role_to_return, match_on_hierarchical=False, match_on_category_scoped=False):
    """Create a mock that simulates get_highest_role_at_location behavior.

    The function makes up to 4 queries:
    1. CTE for ancestors (always returns OREGON_ANCESTORS)
    2. Hierarchical role check (admin/moderator at ancestors)
    3. Category-scoped role check (with specific category)
    4. Category-scoped role check (without category constraint)
    """
    call_count = [0]

    def side_effect(query, params=None, fetchone=False):
        call_count[0] += 1
        q = query.strip()

        # Query 1: get_location_ancestors CTE
        if "WITH RECURSIVE" in q:
            return [{"id": a} for a in OREGON_ANCESTORS]

        # Query 2: hierarchical role check (admin/moderator at ANY ancestors)
        if "role IN ('admin', 'moderator')" in q and "ANY" in q:
            if match_on_hierarchical:
                return {"role": role_to_return}
            return None

        # Query 3: category-scoped with specific category (position_category_id = %s)
        if "position_category_id = %s" in q:
            if match_on_category_scoped:
                return {"role": role_to_return}
            return None

        # Query 4: category-scoped without category (fallback)
        if "position_category_id IS NULL" in q or ("role IN ('facilitator'" in q and "position_category_id" not in q):
            return None

        # Fallback: last query in get_highest_role_at_location
        return None

    return side_effect


class TestHasQaAuthority:
    """Tests for has_qa_authority()."""

    @patch("candid.controllers.helpers.auth.db")
    def test_admin_at_ancestor_returns_true(self, mock_db):
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock("admin", match_on_hierarchical=True)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is True

    @patch("candid.controllers.helpers.auth.db")
    def test_moderator_at_location_returns_true(self, mock_db):
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock("moderator", match_on_hierarchical=True)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is True

    @patch("candid.controllers.helpers.auth.db")
    def test_facilitator_at_exact_scope_returns_true(self, mock_db):
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock("facilitator", match_on_category_scoped=True)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is True

    @patch("candid.controllers.helpers.auth.db")
    def test_expert_at_exact_scope_returns_true(self, mock_db):
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock("expert", match_on_category_scoped=True)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is True

    @patch("candid.controllers.helpers.auth.db")
    def test_liaison_at_exact_scope_returns_true(self, mock_db):
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock("liaison", match_on_category_scoped=True)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is True

    @patch("candid.controllers.helpers.auth.db")
    def test_normal_user_returns_false(self, mock_db):
        """No roles at all → False."""
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock(None)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, HEALTHCARE_CAT) is False

    @patch("candid.controllers.helpers.auth.db")
    def test_facilitator_at_different_category_returns_false(self, mock_db):
        """Facilitator exists but no matching role returned → False."""
        mock_db.execute_query = MagicMock(
            side_effect=_make_mock(None)
        )
        from candid.controllers.helpers.auth import has_qa_authority
        assert has_qa_authority(USER_A, OREGON, ECONOMY_CAT) is False

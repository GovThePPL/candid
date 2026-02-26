"""Unit tests for wiki suggestion helpers — reviewer logic, formatting."""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

# Import parsing helpers (no DB needed)
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'server'))

pytestmark = pytest.mark.unit

# Module path for patching
_WIKI = "candid.controllers.helpers.wiki"


# ---------------------------------------------------------------------------
# _format_user
# ---------------------------------------------------------------------------

class TestFormatUser:
    def test_basic(self):
        from candid.controllers.helpers.wiki import _format_user
        row = {
            "user_id": "abc-123",
            "username": "alice",
            "display_name": "Alice",
            "avatar_icon_url": "data:image/png;base64,xxx",
            "status": "active",
        }
        result = _format_user(row)
        assert result["id"] == "abc-123"
        assert result["username"] == "alice"
        assert result["displayName"] == "Alice"
        assert result["avatarIconUrl"] == "data:image/png;base64,xxx"
        assert result["status"] == "active"

    def test_with_prefix(self):
        from candid.controllers.helpers.wiki import _format_user
        row = {
            "suggester_user_id": "def-456",
            "suggester_username": "bob",
            "suggester_display_name": "Bob",
            "suggester_avatar_icon_url": None,
            "suggester_status": "active",
        }
        result = _format_user(row, "suggester_")
        assert result["id"] == "def-456"
        assert result["username"] == "bob"

    def test_missing_id(self):
        from candid.controllers.helpers.wiki import _format_user
        assert _format_user({}) is None
        assert _format_user({"username": "alice"}) is None


# ---------------------------------------------------------------------------
# _format_suggestion
# ---------------------------------------------------------------------------

class TestFormatSuggestion:
    def _base_row(self, **overrides):
        now = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        row = {
            "id": "sug-001",
            "suggestion_type": "new_term",
            "glossary_term_id": None,
            "term_slug": None,
            "wiki_page_path": None,
            "proposed_title": "Test Term",
            "proposed_aliases": ["alias1"],
            "proposed_summary": "Summary",
            "proposed_content": "Content",
            "proposed_wiki_category": "Governance",
            "proposed_scopes": [{"type": "location", "id": "loc-1"}],
            "proposed_scope_combine": "or",
            "original_title": None,
            "original_aliases": [],
            "original_summary": None,
            "original_content": None,
            "original_wiki_category": None,
            "original_scopes": [],
            "original_scope_combine": "or",
            "suggester_user_id": "user-1",
            "suggester_username": "alice",
            "suggester_display_name": "Alice",
            "suggester_avatar_icon_url": None,
            "suggester_status": "active",
            "suggestion_reason": "Needed",
            "status": "pending",
            "reviewer_user_id": None,
            "review_note": None,
            "reviewed_at": None,
            "original_updated_at": None,
            "created_at": now,
        }
        row.update(overrides)
        return row

    def test_basic_format(self):
        from candid.controllers.helpers.wiki import _format_suggestion
        row = self._base_row()
        result = _format_suggestion(row)
        assert result["id"] == "sug-001"
        assert result["suggestionType"] == "new_term"
        assert result["proposedTitle"] == "Test Term"
        assert result["proposedAliases"] == ["alias1"]
        assert result["suggestedBy"]["username"] == "alice"
        assert result["reviewedBy"] is None
        assert result["status"] == "pending"
        assert result["createdAt"] == "2026-01-15T12:00:00+00:00"
        assert result["glossaryTermSlug"] is None

    def test_with_reviewer(self):
        from candid.controllers.helpers.wiki import _format_suggestion
        now = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        row = self._base_row(
            id="sug-002",
            suggestion_type="edit_term",
            glossary_term_id=5,
            term_slug="test-term",
            proposed_title="Edited",
            proposed_aliases=[],
            proposed_summary=None,
            proposed_content=None,
            proposed_wiki_category=None,
            proposed_scopes=[],
            suggestion_reason=None,
            status="approved",
            reviewer_user_id="user-2",
            reviewer_username="bob",
            reviewer_display_name="Bob",
            reviewer_avatar_icon_url=None,
            reviewer_status="active",
            review_note="Looks good",
            reviewed_at=now,
            original_updated_at=now,
        )
        result = _format_suggestion(row)
        assert result["reviewedBy"]["username"] == "bob"
        assert result["reviewNote"] == "Looks good"
        assert result["glossaryTermId"] == 5
        assert result["glossaryTermSlug"] == "test-term"

    def test_original_fields_included(self):
        """Original snapshot fields appear in formatted output."""
        from candid.controllers.helpers.wiki import _format_suggestion
        row = self._base_row(
            suggestion_type="edit_term",
            original_title="Old Title",
            original_aliases=["old-alias"],
            original_summary="Old summary",
            original_content="Old content",
            original_wiki_category="Policy",
            original_scopes=[],
            original_scope_combine="and",
        )
        result = _format_suggestion(row)
        assert result["originalTitle"] == "Old Title"
        assert result["originalAliases"] == ["old-alias"]
        assert result["originalSummary"] == "Old summary"
        assert result["originalContent"] == "Old content"
        assert result["originalWikiCategory"] == "Policy"
        assert result["originalScopeCombine"] == "and"


# ---------------------------------------------------------------------------
# _find_suggestion_reviewers (requires DB mock)
# ---------------------------------------------------------------------------

class TestFindSuggestionReviewers:
    def test_global_scope_returns_admins_and_experts(self):
        """Global (no scopes) → site admins + all experts/liaisons."""
        from candid.controllers.helpers.wiki import _find_suggestion_reviewers

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"user_id": "admin-1"}],  # site admins
            [{"user_id": "expert-1"}, {"user_id": "liaison-1"}],  # experts/liaisons
        ])

        with patch(f"{_WIKI}.db", mock_db):
            reviewers = _find_suggestion_reviewers([])
        assert "admin-1" in reviewers
        assert "expert-1" in reviewers
        assert "liaison-1" in reviewers

    def test_location_scoped(self):
        """Location-scoped → admins/mods/experts/liaisons at location ancestors."""
        from candid.controllers.helpers.wiki import _find_suggestion_reviewers

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"user_id": "admin-1"}],  # site admins
            [{"user_id": "mod-1"}, {"user_id": "expert-1"}],  # at location ancestors
        ])

        with patch(f"{_WIKI}.db", mock_db), \
             patch(f"{_WIKI}.get_location_ancestors", return_value=["loc-1", "loc-root"]):
            reviewers = _find_suggestion_reviewers([
                {"type": "location", "id": "loc-1"}
            ])
        assert "admin-1" in reviewers
        assert "mod-1" in reviewers
        assert "expert-1" in reviewers

    def test_category_scoped(self):
        """Session-scoped → facilitators/experts + all admins/mods."""
        from candid.controllers.helpers.wiki import _find_suggestion_reviewers

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"user_id": "admin-1"}],  # site admins
            [{"user_id": "facilitator-1"}],  # facilitator for session
            [{"user_id": "admin-1"}, {"user_id": "mod-1"}],  # all admins/mods
        ])

        with patch(f"{_WIKI}.db", mock_db):
            reviewers = _find_suggestion_reviewers([
                {"type": "session", "id": "cat-1"}
            ])
        assert "admin-1" in reviewers
        assert "facilitator-1" in reviewers
        assert "mod-1" in reviewers

    def test_empty_results(self):
        """Returns empty list when no qualified reviewers."""
        from candid.controllers.helpers.wiki import _find_suggestion_reviewers

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [],  # no site admins
            [],  # no experts
        ])

        with patch(f"{_WIKI}.db", mock_db):
            reviewers = _find_suggestion_reviewers([])
        assert reviewers == []

    def test_deduplicates(self):
        """Same user in multiple roles is returned once."""
        from candid.controllers.helpers.wiki import _find_suggestion_reviewers

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"user_id": "user-1"}],  # site admins
            [{"user_id": "user-1"}],  # also expert
        ])

        with patch(f"{_WIKI}.db", mock_db):
            reviewers = _find_suggestion_reviewers([])
        assert reviewers.count("user-1") == 1


# ---------------------------------------------------------------------------
# _user_can_review_suggestion
# ---------------------------------------------------------------------------

class TestUserCanReview:
    def test_root_admin_can_review_anything(self):
        """Root admins can review any suggestion."""
        from candid.controllers.helpers.wiki import _user_can_review_suggestion

        with patch(f"{_WIKI}.is_root_admin", return_value=True):
            assert _user_can_review_suggestion("admin-1", []) is True

    def test_non_reviewer_cannot(self):
        """Non-reviewer user returns False."""
        from candid.controllers.helpers.wiki import _user_can_review_suggestion

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[[], []])

        with patch(f"{_WIKI}.is_root_admin", return_value=False), \
             patch(f"{_WIKI}.db", mock_db):
            assert _user_can_review_suggestion("normal-1", []) is False

    def test_reviewer_in_list(self):
        """User in reviewer list can review."""
        from candid.controllers.helpers.wiki import _user_can_review_suggestion

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            [{"user_id": "expert-1"}],  # site admins
            [{"user_id": "expert-2"}],  # experts
        ])

        with patch(f"{_WIKI}.is_root_admin", return_value=False), \
             patch(f"{_WIKI}.db", mock_db):
            assert _user_can_review_suggestion("expert-1", []) is True

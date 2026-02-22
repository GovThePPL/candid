"""Unit tests for 3-way merge helpers used in wiki suggestion approval."""

import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'server'))

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# _three_way_merge_text
# ---------------------------------------------------------------------------

class TestThreeWayMergeText:
    def test_no_intervening_edit(self):
        """original == current → use proposed."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        merged, conflict = _three_way_merge_text("hello", "world", "hello")
        assert merged == "world"
        assert conflict is False

    def test_suggestion_no_change(self):
        """original == proposed → use current (suggestion didn't change this field)."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        merged, conflict = _three_way_merge_text("hello", "hello", "updated")
        assert merged == "updated"
        assert conflict is False

    def test_same_change(self):
        """current == proposed → use current (both made same change)."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        merged, conflict = _three_way_merge_text("hello", "world", "world")
        assert merged == "world"
        assert conflict is False

    def test_conflict(self):
        """Different changes to same lines → conflict."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        original = "line1\nline2\nline3"
        proposed = "line1\nchanged_by_proposal\nline3"
        current = "line1\nchanged_by_editor\nline3"
        merged, conflict = _three_way_merge_text(original, proposed, current)
        assert conflict is True

    def test_none_values(self):
        """None original with proposed content → use proposed."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        merged, conflict = _three_way_merge_text(None, "new content", None)
        assert merged == "new content"
        assert conflict is False

    def test_both_none(self):
        """All None → no conflict."""
        from candid.controllers.glossary_controller import _three_way_merge_text
        merged, conflict = _three_way_merge_text(None, None, None)
        assert merged is None
        assert conflict is False


# ---------------------------------------------------------------------------
# _three_way_merge_scalar
# ---------------------------------------------------------------------------

class TestThreeWayMergeScalar:
    def test_no_intervening_edit(self):
        from candid.controllers.glossary_controller import _three_way_merge_scalar
        merged, conflict = _three_way_merge_scalar("A", "B", "A")
        assert merged == "B"
        assert conflict is False

    def test_no_proposal_change(self):
        from candid.controllers.glossary_controller import _three_way_merge_scalar
        merged, conflict = _three_way_merge_scalar("A", "A", "C")
        assert merged == "C"
        assert conflict is False

    def test_same_change(self):
        from candid.controllers.glossary_controller import _three_way_merge_scalar
        merged, conflict = _three_way_merge_scalar("A", "B", "B")
        assert merged == "B"
        assert conflict is False

    def test_conflict(self):
        from candid.controllers.glossary_controller import _three_way_merge_scalar
        merged, conflict = _three_way_merge_scalar("A", "B", "C")
        assert conflict is True


# ---------------------------------------------------------------------------
# _three_way_merge_array
# ---------------------------------------------------------------------------

class TestThreeWayMergeArray:
    def test_adds_new_items(self):
        from candid.controllers.glossary_controller import _three_way_merge_array
        merged, conflict = _three_way_merge_array(
            ["a", "b"], ["a", "b", "c"], ["a", "b"])
        assert "c" in merged
        assert conflict is False

    def test_removes_deleted_items(self):
        from candid.controllers.glossary_controller import _three_way_merge_array
        merged, conflict = _three_way_merge_array(
            ["a", "b", "c"], ["a", "b"], ["a", "b", "c"])
        assert "c" not in merged
        assert conflict is False

    def test_keeps_intervening_additions(self):
        from candid.controllers.glossary_controller import _three_way_merge_array
        merged, conflict = _three_way_merge_array(
            ["a"], ["a", "b"], ["a", "c"])
        assert "a" in merged
        assert "b" in merged
        assert "c" in merged
        assert conflict is False

    def test_never_conflicts(self):
        from candid.controllers.glossary_controller import _three_way_merge_array
        merged, conflict = _three_way_merge_array(
            ["a", "b"], ["c", "d"], ["e", "f"])
        assert conflict is False

    def test_empty_inputs(self):
        from candid.controllers.glossary_controller import _three_way_merge_array
        merged, conflict = _three_way_merge_array([], ["new"], [])
        assert "new" in merged
        assert conflict is False


# ---------------------------------------------------------------------------
# _three_way_merge_scopes
# ---------------------------------------------------------------------------

class TestThreeWayMergeScopes:
    def test_adds_new_scopes(self):
        from candid.controllers.glossary_controller import _three_way_merge_scopes
        original = [{"type": "location", "id": "loc-1"}]
        proposed = [{"type": "location", "id": "loc-1"}, {"type": "category", "id": "cat-1"}]
        current = [{"type": "location", "id": "loc-1"}]
        merged, conflict = _three_way_merge_scopes(original, proposed, current)
        keys = {(s["type"], s["id"]) for s in merged}
        assert ("category", "cat-1") in keys
        assert conflict is False

    def test_removes_deleted_scopes(self):
        from candid.controllers.glossary_controller import _three_way_merge_scopes
        original = [{"type": "location", "id": "loc-1"}, {"type": "location", "id": "loc-2"}]
        proposed = [{"type": "location", "id": "loc-1"}]
        current = [{"type": "location", "id": "loc-1"}, {"type": "location", "id": "loc-2"}]
        merged, conflict = _three_way_merge_scopes(original, proposed, current)
        keys = {(s["type"], s["id"]) for s in merged}
        assert ("location", "loc-2") not in keys
        assert conflict is False

    def test_keeps_intervening_scope_additions(self):
        from candid.controllers.glossary_controller import _three_way_merge_scopes
        original = [{"type": "location", "id": "loc-1"}]
        proposed = [{"type": "location", "id": "loc-1"}]
        current = [{"type": "location", "id": "loc-1"}, {"type": "category", "id": "cat-new"}]
        merged, conflict = _three_way_merge_scopes(original, proposed, current)
        keys = {(s["type"], s["id"]) for s in merged}
        assert ("category", "cat-new") in keys
        assert conflict is False

    def test_never_conflicts(self):
        from candid.controllers.glossary_controller import _three_way_merge_scopes
        merged, conflict = _three_way_merge_scopes(
            [{"type": "location", "id": "a"}],
            [{"type": "location", "id": "b"}],
            [{"type": "location", "id": "c"}],
        )
        assert conflict is False

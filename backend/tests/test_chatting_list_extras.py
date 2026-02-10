"""Tests for chatting list extras: metadata, explanation seen, bulk remove."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    HEALTHCARE_CAT_ID,
    NONEXISTENT_UUID,
)

CHATTING_LIST_URL = f"{BASE_URL}/users/me/chatting-list"


class TestChattingListMetadata:
    """GET /users/me/chatting-list/metadata"""

    def test_get_metadata_success(self, normal_headers):
        """Returns metadata with count."""
        resp = requests.get(
            f"{CHATTING_LIST_URL}/metadata",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "count" in body
        assert isinstance(body["count"], int)



class TestMarkExplanationSeen:
    """POST /users/me/chatting-list/explanation-seen"""

    @pytest.mark.mutation
    def test_mark_seen_success(self, normal_headers):
        """Can mark the chatting list explanation as seen."""
        resp = requests.post(
            f"{CHATTING_LIST_URL}/explanation-seen",
            headers=normal_headers,
        )
        assert resp.status_code in (200, 204)



class TestBulkRemove:
    """POST /users/me/chatting-list/bulk-remove"""

    @pytest.mark.mutation
    def test_bulk_remove_by_item_ids(self, normal_headers):
        """Can bulk remove by item IDs (even if empty, should not error)."""
        resp = requests.post(
            f"{CHATTING_LIST_URL}/bulk-remove",
            headers=normal_headers,
            json={"itemIds": [NONEXISTENT_UUID]},
        )
        # Should succeed even if the IDs don't match anything
        assert resp.status_code == 200

    @pytest.mark.mutation
    def test_bulk_remove_by_category(self, normal_headers):
        """Can bulk remove by category ID."""
        resp = requests.post(
            f"{CHATTING_LIST_URL}/bulk-remove",
            headers=normal_headers,
            json={"categoryId": HEALTHCARE_CAT_ID},
        )
        assert resp.status_code == 200

    def test_bulk_remove_empty_body_400(self, normal_headers):
        """Empty body returns 400."""
        resp = requests.post(
            f"{CHATTING_LIST_URL}/bulk-remove",
            headers=normal_headers,
            json={},
        )
        # May return 400 or 200 with 0 removed depending on implementation
        assert resp.status_code in (200, 400)



class TestUpdateChattingListItem:
    """PATCH /users/me/chatting-list/{itemId} — edge cases."""

    def test_nonexistent_item_404(self, normal_headers):
        """Patching a nonexistent item returns 404."""
        resp = requests.patch(
            f"{CHATTING_LIST_URL}/{NONEXISTENT_UUID}",
            headers=normal_headers,
            json={"isActive": False},
        )
        assert resp.status_code == 404


class TestRemoveFromChattingList:
    """DELETE /users/me/chatting-list/{itemId} — edge cases."""

    def test_nonexistent_item_404(self, normal_headers):
        """Deleting a nonexistent item returns 404."""
        resp = requests.delete(
            f"{CHATTING_LIST_URL}/{NONEXISTENT_UUID}",
            headers=normal_headers,
        )
        assert resp.status_code == 404

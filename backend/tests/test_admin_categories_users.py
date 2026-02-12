"""Integration tests for admin category creation and user ban/unban endpoints.

Tests:
- POST /admin/categories — create category, duplicate, empty label, unauthorized
- POST /admin/users/{userId}/ban — ban active user, already banned, unauthorized
- POST /admin/users/{userId}/unban — unban banned user, not banned, nonexistent, unauthorized
"""

import pytest
import requests
from conftest import (
    BASE_URL,
    NORMAL4_ID,
    NORMAL5_ID,
    NONEXISTENT_UUID,
    db_execute,
    db_query_one,
)

ADMIN_CATEGORIES_URL = f"{BASE_URL}/admin/categories"
ADMIN_USERS_URL = f"{BASE_URL}/admin/users"


# ---------------------------------------------------------------------------
# Category creation tests
# ---------------------------------------------------------------------------

class TestCreateCategory:
    """POST /admin/categories"""

    @pytest.mark.mutation
    def test_create_category_success(self, admin_headers):
        """Site admin can create a new category."""
        resp = requests.post(
            ADMIN_CATEGORIES_URL,
            headers=admin_headers,
            json={"label": "Test Category Integration"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["label"] == "Test Category Integration"
        assert data["id"] is not None

        # Cleanup
        db_execute("DELETE FROM position_category WHERE id = %s", (data["id"],))

    @pytest.mark.mutation
    def test_create_category_duplicate(self, admin_headers):
        """Duplicate category label (case-insensitive) returns 400."""
        resp = requests.post(
            ADMIN_CATEGORIES_URL,
            headers=admin_headers,
            json={"label": "DupCatTest"},
        )
        assert resp.status_code == 201
        cat_id = resp.json()["id"]

        try:
            resp2 = requests.post(
                ADMIN_CATEGORIES_URL,
                headers=admin_headers,
                json={"label": "dupcattest"},  # same label, different case
            )
            assert resp2.status_code == 400
            assert "already exists" in resp2.json()["message"]
        finally:
            db_execute("DELETE FROM position_category WHERE id = %s", (cat_id,))

    def test_create_category_empty_label(self, admin_headers):
        """Empty label returns 400."""
        resp = requests.post(
            ADMIN_CATEGORIES_URL,
            headers=admin_headers,
            json={"label": "   "},
        )
        assert resp.status_code == 400

    def test_create_category_unauthorized(self, normal_headers):
        """Normal user cannot create categories."""
        resp = requests.post(
            ADMIN_CATEGORIES_URL,
            headers=normal_headers,
            json={"label": "Unauthorized Category"},
        )
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Ban/Unban tests
# ---------------------------------------------------------------------------

class TestBanUser:
    """POST /admin/users/{userId}/ban"""

    @pytest.mark.mutation
    def test_ban_active_user(self, admin_headers):
        """Admin can ban an active user."""
        # normal5 should be active
        db_execute("UPDATE users SET status = 'active' WHERE id = %s", (NORMAL5_ID,))

        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL5_ID}/ban",
            headers=admin_headers,
            json={"reason": "Test ban"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "banned"

        # Verify in DB
        row = db_query_one("SELECT status FROM users WHERE id = %s", (NORMAL5_ID,))
        assert row["status"] == "banned"

        # Cleanup: restore active
        db_execute("UPDATE users SET status = 'active' WHERE id = %s", (NORMAL5_ID,))

    @pytest.mark.mutation
    def test_ban_already_banned_user(self, admin_headers):
        """Banning already-banned user returns 400."""
        # normal4 is banned in seed data
        db_execute("UPDATE users SET status = 'banned' WHERE id = %s", (NORMAL4_ID,))

        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL4_ID}/ban",
            headers=admin_headers,
            json={"reason": "Test ban"},
        )
        assert resp.status_code == 400
        assert "already banned" in resp.json()["message"]

    def test_ban_nonexistent_user(self, admin_headers):
        """Banning nonexistent user returns 404."""
        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NONEXISTENT_UUID}/ban",
            headers=admin_headers,
            json={"reason": "Test ban"},
        )
        assert resp.status_code == 404

    def test_ban_unauthorized(self, normal2_headers):
        """Normal user (no roles) cannot ban users."""
        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL5_ID}/ban",
            headers=normal2_headers,
            json={"reason": "Test ban"},
        )
        assert resp.status_code in (401, 403)


class TestUnbanUser:
    """POST /admin/users/{userId}/unban"""

    @pytest.mark.mutation
    def test_unban_banned_user(self, admin_headers):
        """Admin can unban a banned user."""
        # Ensure normal4 is banned
        db_execute("UPDATE users SET status = 'banned' WHERE id = %s", (NORMAL4_ID,))

        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL4_ID}/unban",
            headers=admin_headers,
            json={"reason": "Test unban"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

        # Verify in DB
        row = db_query_one("SELECT status FROM users WHERE id = %s", (NORMAL4_ID,))
        assert row["status"] == "active"

        # Cleanup: restore banned
        db_execute("UPDATE users SET status = 'banned' WHERE id = %s", (NORMAL4_ID,))

    @pytest.mark.mutation
    def test_unban_active_user(self, admin_headers):
        """Unbanning an active user returns 400."""
        db_execute("UPDATE users SET status = 'active' WHERE id = %s", (NORMAL5_ID,))

        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL5_ID}/unban",
            headers=admin_headers,
            json={"reason": "Test unban"},
        )
        assert resp.status_code == 400
        assert "not banned" in resp.json()["message"]

    def test_unban_nonexistent_user(self, admin_headers):
        """Unbanning nonexistent user returns 404."""
        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NONEXISTENT_UUID}/unban",
            headers=admin_headers,
            json={"reason": "Test unban"},
        )
        assert resp.status_code == 404

    def test_unban_unauthorized(self, normal2_headers):
        """Normal user (no roles) cannot unban users."""
        resp = requests.post(
            f"{ADMIN_USERS_URL}/{NORMAL4_ID}/unban",
            headers=normal2_headers,
            json={"reason": "Test unban"},
        )
        assert resp.status_code in (401, 403)

"""Tests for GET /users/me, PATCH /users/me, GET /users/{userId}."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import BASE_URL, ADMIN1_ID, NORMAL1_ID, NORMAL2_ID, db_query_one

ME_URL = f"{BASE_URL}/users/me"


class TestGetCurrentUser:
    """GET /users/me"""

    @pytest.mark.smoke
    def test_get_current_user(self, normal_headers):
        resp = requests.get(ME_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "normal1"
        assert body["id"] == NORMAL1_ID

    def test_returns_expected_fields(self, normal_headers):
        resp = requests.get(ME_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for field in ("id", "username", "displayName", "userType", "status"):
            assert field in body, f"Missing field: {field}"

    def test_admin_user_type(self, admin_headers):
        resp = requests.get(ME_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["userType"] == "admin"

    def test_moderator_user_type(self, moderator_headers):
        resp = requests.get(ME_URL, headers=moderator_headers)
        assert resp.status_code == 200
        assert resp.json()["userType"] == "moderator"



class TestUpdateUserProfile:
    """PATCH /users/me"""

    @pytest.mark.mutation
    def test_update_display_name_and_rollback(self, normal_headers):
        # Read current
        original = requests.get(ME_URL, headers=normal_headers).json()
        original_name = original["displayName"]

        # Update
        resp = requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"displayName": "Temporary Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["displayName"] == "Temporary Name"

        # Rollback
        resp = requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"displayName": original_name},
        )
        assert resp.status_code == 200
        assert resp.json()["displayName"] == original_name

    @pytest.mark.mutation
    def test_update_email_and_rollback(self, normal_headers):
        original = requests.get(ME_URL, headers=normal_headers).json()
        original_email = original.get("email")

        resp = requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"email": "temp@example.com"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "temp@example.com"

        # Rollback
        resp = requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"email": original_email},
        )
        assert resp.status_code == 200



class TestGetUserById:
    """GET /users/{userId}"""

    @pytest.mark.smoke
    def test_get_user_by_id(self, normal_headers):
        resp = requests.get(f"{BASE_URL}/users/{NORMAL2_ID}", headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == NORMAL2_ID
        assert body["username"] == "normal2"

    def test_returns_expected_fields(self, normal_headers):
        resp = requests.get(f"{BASE_URL}/users/{ADMIN1_ID}", headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for field in ("id", "username", "displayName", "status"):
            assert field in body, f"Missing field: {field}"



class TestProfileUpdateEdgeCases:
    """PATCH /users/me — avatar and unknown field handling (B8)."""

    @pytest.mark.mutation
    def test_update_avatar_url(self, normal_headers):
        """PATCH with avatarUrl persists the value."""
        original = requests.get(ME_URL, headers=normal_headers).json()
        original_avatar = original.get("avatarUrl")
        try:
            resp = requests.patch(
                ME_URL,
                headers=normal_headers,
                json={"avatarUrl": "https://example.com/avatar.png"},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body.get("avatarUrl") == "https://example.com/avatar.png"
        finally:
            requests.patch(
                ME_URL,
                headers=normal_headers,
                json={"avatarUrl": original_avatar},
            )

    @pytest.mark.mutation
    def test_clear_avatar_url(self, normal_headers):
        """PATCH with avatarUrl=null clears the avatar."""
        # Set a known avatar first
        requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"avatarUrl": "https://example.com/temp.png"},
        )
        try:
            resp = requests.patch(
                ME_URL,
                headers=normal_headers,
                json={"avatarUrl": None},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body.get("avatarUrl") is None
        finally:
            requests.patch(
                ME_URL,
                headers=normal_headers,
                json={"avatarUrl": None},
            )

    def test_update_nonexistent_field_rejected(self, normal_headers):
        """Unknown fields in PATCH body are rejected by schema validation."""
        resp = requests.patch(
            ME_URL,
            headers=normal_headers,
            json={"nonExistentField": "should be rejected"},
        )
        # Connexion's strict schema validation rejects unknown properties
        assert resp.status_code == 400

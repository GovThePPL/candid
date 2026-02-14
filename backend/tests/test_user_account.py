"""Tests for user account operations: account delete, push token, avatar upload."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    KEYCLOAK_URL,
    KEYCLOAK_REALM,
    login,
    auth_header,
    db_execute,
    db_query_one,
)


class TestDeleteCurrentUser:
    """DELETE /users/me"""

    DISPOSABLE_USERNAME = "test_delete_user"
    DISPOSABLE_EMAIL = "test_delete_user@example.com"
    DISPOSABLE_PASSWORD = "password123"

    def _register_disposable_user(self):
        """Register a disposable user for the delete test."""
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.DISPOSABLE_USERNAME,
            "email": self.DISPOSABLE_EMAIL,
            "password": self.DISPOSABLE_PASSWORD,
        })
        assert resp.status_code in (201, 409), f"Failed to register disposable user: {resp.text}"

    def _login_disposable_user(self):
        """Log in as the disposable user."""
        token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
        resp = requests.post(token_url, data={
            "grant_type": "password",
            "client_id": "candid-app",
            "username": self.DISPOSABLE_USERNAME,
            "password": self.DISPOSABLE_PASSWORD,
        })
        resp.raise_for_status()
        return resp.json()["access_token"]

    @pytest.mark.mutation
    def test_delete_success(self):
        """Can delete own account (auth token only, no password needed)."""
        # Create a disposable user so we don't destroy shared test users
        self._register_disposable_user()
        token = self._login_disposable_user()
        headers = auth_header(token)

        # Call /users/me first to trigger auto-registration in Candid DB
        me_resp = requests.get(f"{BASE_URL}/users/me", headers=headers)
        assert me_resp.status_code == 200
        user_id = me_resp.json()["id"]

        # Delete the account
        resp = requests.delete(
            f"{BASE_URL}/users/me",
            headers=headers,
        )
        assert resp.status_code == 204

        # Verify user is marked as deleted in DB
        row = db_query_one(
            "SELECT status, keycloak_id FROM users WHERE id = %s", (user_id,)
        )
        assert row["status"] == "deleted"
        assert row["keycloak_id"] is None  # Keycloak link should be cleared



class TestRegisterPushToken:
    """PUT /users/me/push-token"""

    def _cleanup_push_token(self, user_id):
        """Remove push token data for a user."""
        db_execute(
            "UPDATE users SET push_token = NULL, push_platform = NULL, notifications_enabled = false WHERE id = %s",
            (user_id,),
        )

    @pytest.mark.mutation
    def test_register_success(self, normal_headers):
        """Can register a push token."""
        from conftest import NORMAL1_ID
        try:
            resp = requests.put(
                f"{BASE_URL}/users/me/push-token",
                headers=normal_headers,
                json={"token": "ExponentPushToken[test-token-123]", "platform": "expo"},
            )
            assert resp.status_code == 200
        finally:
            self._cleanup_push_token(NORMAL1_ID)

    def test_missing_token_400(self, normal_headers):
        """Missing token returns 400."""
        resp = requests.put(
            f"{BASE_URL}/users/me/push-token",
            headers=normal_headers,
            json={"platform": "expo"},
        )
        assert resp.status_code == 400

    def test_invalid_platform_400(self, normal_headers):
        """Invalid platform returns 400."""
        resp = requests.put(
            f"{BASE_URL}/users/me/push-token",
            headers=normal_headers,
            json={"token": "ExponentPushToken[test]", "platform": "android"},
        )
        assert resp.status_code == 400



class TestUploadAvatar:
    """POST /users/me/avatar"""

    def test_missing_image_400(self, normal_headers):
        """Missing imageBase64 returns 400."""
        resp = requests.post(
            f"{BASE_URL}/users/me/avatar",
            headers=normal_headers,
            json={},
        )
        assert resp.status_code == 400

    def test_invalid_image_data_400(self, normal_headers):
        """Invalid base64 image data returns 400 or 500."""
        resp = requests.post(
            f"{BASE_URL}/users/me/avatar",
            headers=normal_headers,
            json={"imageBase64": "not-valid-base64-image-data"},
        )
        # Should fail with either 400 (invalid image) or 500 (processing error)
        assert resp.status_code in (400, 500)


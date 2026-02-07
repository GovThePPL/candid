"""Tests for user account operations: password change, account delete, push token, avatar upload."""

import pytest
import requests
from conftest import (
    BASE_URL,
    NORMAL5_ID,
    DEFAULT_PASSWORD,
    login,
    auth_header,
    db_execute,
    db_query_one,
)


# The bcrypt hash for 'password' used in seed data
SEED_PASSWORD_HASH = "$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS"


class TestChangePassword:
    """PUT /users/me/password"""

    @pytest.fixture
    def normal5_headers(self):
        """Get headers for normal5."""
        token = login("normal5")
        return auth_header(token)

    def _restore_password(self):
        """Restore normal5's password to the seed default."""
        db_execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (SEED_PASSWORD_HASH, NORMAL5_ID),
        )

    @pytest.mark.mutation
    def test_change_password_success(self, normal5_headers):
        """Can change password with correct current password."""
        try:
            resp = requests.put(
                f"{BASE_URL}/users/me/password",
                headers=normal5_headers,
                json={
                    "currentPassword": DEFAULT_PASSWORD,
                    "newPassword": "newpassword123",
                },
            )
            assert resp.status_code == 200
        finally:
            self._restore_password()

    def test_wrong_current_password_401(self, normal5_headers):
        """Wrong current password returns 401."""
        resp = requests.put(
            f"{BASE_URL}/users/me/password",
            headers=normal5_headers,
            json={
                "currentPassword": "wrongpassword",
                "newPassword": "newpassword123",
            },
        )
        assert resp.status_code == 401

    def test_too_short_new_password_400(self, normal5_headers):
        """New password shorter than 8 chars returns 400."""
        resp = requests.put(
            f"{BASE_URL}/users/me/password",
            headers=normal5_headers,
            json={
                "currentPassword": DEFAULT_PASSWORD,
                "newPassword": "short",
            },
        )
        assert resp.status_code == 400

    def test_missing_fields_400(self, normal5_headers):
        """Missing fields returns 400."""
        resp = requests.put(
            f"{BASE_URL}/users/me/password",
            headers=normal5_headers,
            json={},
        )
        assert resp.status_code == 400

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.put(
            f"{BASE_URL}/users/me/password",
            json={
                "currentPassword": DEFAULT_PASSWORD,
                "newPassword": "newpassword123",
            },
        )
        assert resp.status_code == 401


class TestDeleteCurrentUser:
    """POST /users/me/delete"""

    @pytest.fixture
    def normal5_headers(self):
        """Get headers for normal5."""
        token = login("normal5")
        return auth_header(token)

    def _restore_user(self):
        """Restore normal5 to active status."""
        db_execute(
            "UPDATE users SET status = 'active' WHERE id = %s",
            (NORMAL5_ID,),
        )

    @pytest.mark.mutation
    def test_delete_success(self, normal5_headers):
        """Can delete own account with correct password."""
        try:
            resp = requests.post(
                f"{BASE_URL}/users/me/delete",
                headers=normal5_headers,
                json={"password": DEFAULT_PASSWORD},
            )
            assert resp.status_code == 200
            # Verify user is marked as deleted
            row = db_query_one(
                "SELECT status FROM users WHERE id = %s", (NORMAL5_ID,)
            )
            assert row["status"] == "deleted"
        finally:
            self._restore_user()

    def test_wrong_password_401(self, normal5_headers):
        """Wrong password returns 401."""
        resp = requests.post(
            f"{BASE_URL}/users/me/delete",
            headers=normal5_headers,
            json={"password": "wrongpassword"},
        )
        assert resp.status_code == 401

    def test_missing_password_400(self, normal5_headers):
        """Missing password returns 400."""
        resp = requests.post(
            f"{BASE_URL}/users/me/delete",
            headers=normal5_headers,
            json={},
        )
        assert resp.status_code == 400

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            f"{BASE_URL}/users/me/delete",
            json={"password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 401


class TestRegisterPushToken:
    """POST /users/me/push-token"""

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
            resp = requests.post(
                f"{BASE_URL}/users/me/push-token",
                headers=normal_headers,
                json={"token": "ExponentPushToken[test-token-123]", "platform": "expo"},
            )
            assert resp.status_code == 200
        finally:
            self._cleanup_push_token(NORMAL1_ID)

    def test_missing_token_400(self, normal_headers):
        """Missing token returns 400."""
        resp = requests.post(
            f"{BASE_URL}/users/me/push-token",
            headers=normal_headers,
            json={"platform": "expo"},
        )
        assert resp.status_code == 400

    def test_invalid_platform_400(self, normal_headers):
        """Invalid platform returns 400."""
        resp = requests.post(
            f"{BASE_URL}/users/me/push-token",
            headers=normal_headers,
            json={"token": "ExponentPushToken[test]", "platform": "android"},
        )
        assert resp.status_code == 400

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            f"{BASE_URL}/users/me/push-token",
            json={"token": "ExponentPushToken[test]", "platform": "expo"},
        )
        assert resp.status_code == 401


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

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            f"{BASE_URL}/users/me/avatar",
            json={"imageBase64": "dGVzdA=="},
        )
        assert resp.status_code == 401
